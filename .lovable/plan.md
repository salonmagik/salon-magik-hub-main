
# Staff Invitation Flow Redesign Plan

## Current Problem

The current implementation sends invited staff to `/accept-invite?token=...` which validates the invitation token. However:
1. The token validation is failing due to environment/URL mismatches
2. The flow is overly complex - staff shouldn't need to "accept" anything
3. The temp password is already the validation mechanism

## Desired Flow (Per User Requirements)

```text
+------------------+     +------------------+     +------------------+     +------------------+
| Staff receives   | --> | Staff goes to    | --> | Login with temp  | --> | Forced password  |
| invitation email |     | /login directly  |     | password works   |     | change prompt    |
+------------------+     +------------------+     +------------------+     +------------------+
                                                         |
                                                         v
                                               +------------------+
                                               | Full access to   |
                                               | salon dashboard  |
                                               +------------------+
```

Key changes:
1. **Email link goes to `/login`** (not `/accept-invite`)
2. **User account created at invitation time** (not on accept)
3. **Login validates temp password** with 7-day expiry
4. **Forced password change** after first login with temp password
5. **No token validation page needed** - temp password IS the validation

---

## Implementation Details

### 1. Modify `send-staff-invitation` Edge Function

When creating an invitation:
- **Create the user account immediately** via `supabase.auth.admin.createUser()`
- Set temp password as the actual password
- Auto-confirm email (invitation proves ownership)
- Create profile and user_role records
- Set `user_metadata.requires_password_change = true`

The email then simply directs them to `/login` with credentials pre-filled (or just shares the temp password).

**Changes:**
```typescript
// In send-staff-invitation/index.ts

// After generating temp password, CREATE the user immediately
const { data: userData, error: createError } = await serviceRoleClient.auth.admin.createUser({
  email: recipientEmail,
  password: tempPassword,
  email_confirm: true,
  user_metadata: {
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`,
    requires_password_change: true, // Flag for forced password change
    invited_via: 'staff_invitation',
  },
});

// Create profile
await serviceRoleClient.from("profiles").insert({
  user_id: userData.user.id,
  full_name: `${firstName} ${lastName}`,
});

// Create role
await serviceRoleClient.from("user_roles").insert({
  user_id: userData.user.id,
  tenant_id: tenantId,
  role: role,
  is_active: true,
});

// Update invitation with user_id reference
await supabase.from("staff_invitations").update({
  user_id: userData.user.id, // Link invitation to created user
}).eq("id", invitation.id);
```

### 2. Update Email Template

Change the invitation link from `/accept-invite?token=...` to `/login`:

```typescript
const invitationLink = `${baseUrl}/login`;

// Email now says:
// "Your login email: staff@example.com"
// "Your temporary password: XyZ123#$"
// "Click here to sign in: [Login Button]"
// "You'll be prompted to set a permanent password on first login."
```

### 3. Add Database Column

Add `user_id` column to `staff_invitations` to track the created user:

```sql
ALTER TABLE staff_invitations ADD COLUMN user_id uuid REFERENCES auth.users(id);
```

### 4. Create Forced Password Change Flow

**New Component: `ForcePasswordChangeDialog.tsx`**
- Modal that appears when `user_metadata.requires_password_change === true`
- Cannot be dismissed until password is changed
- On success: Clears the flag via edge function

**Changes to `useAuth.tsx`:**
```typescript
// Add to AuthState interface
requiresPasswordChange: boolean;

// In auth state change handler
requiresPasswordChange: session.user.user_metadata?.requires_password_change === true,
```

**New Edge Function: `complete-password-change`**
- Validates new password meets requirements
- Updates user password via admin API
- Clears `requires_password_change` flag from metadata
- Updates `staff_invitations.password_changed_at`

### 5. Handle Temp Password Expiry

On login failure, check if the user was invited but temp password expired:

```typescript
// In LoginPage.tsx handleEmailSubmit
if (error?.message === "Invalid login credentials") {
  // Check if this email has an expired invitation
  const { data } = await supabase.functions.invoke("check-temp-password-status", {
    body: { email }
  });
  
  if (data?.expired) {
    toast({
      title: "Temporary password expired",
      description: "Your invitation has expired. Please contact your salon administrator for a new invitation.",
      variant: "destructive",
    });
    return;
  }
}
```

### 6. Mark Invitation as Accepted

When user successfully logs in with temp password and changes it:
- `staff_invitations.status` = 'accepted'
- `staff_invitations.accepted_at` = now()
- `staff_invitations.password_changed_at` = now()
- `staff_invitations.temp_password_used` = true

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/send-staff-invitation/index.ts` | EDIT | Create user account at invitation time, change email link to `/login` |
| `supabase/functions/accept-staff-invitation/index.ts` | DELETE | No longer needed - user created at invite time |
| `supabase/functions/validate-staff-invitation/index.ts` | DELETE | No longer needed - no token validation required |
| `supabase/functions/complete-password-change/index.ts` | CREATE | Handle forced password change |
| `src/pages/auth/AcceptInvitePage.tsx` | DELETE | No longer needed |
| `src/App.tsx` | EDIT | Remove `/accept-invite` route |
| `src/pages/auth/LoginPage.tsx` | EDIT | Check for expired temp password on login failure |
| `src/hooks/useAuth.tsx` | EDIT | Add `requiresPasswordChange` to state |
| `src/components/auth/ForcePasswordChangeDialog.tsx` | CREATE | Modal for mandatory password change |
| `src/components/auth/ProtectedRoute.tsx` | EDIT | Show password change dialog when required |
| `supabase/migrations/xxx_add_user_id_to_invitations.sql` | CREATE | Add user_id column |

---

## Updated Email Template Content

```html
<h2>Join Our Team</h2>
<p>Hi {firstName},</p>
<p>You've been invited to join <strong>{salonName}</strong> as a <strong>{role}</strong>.</p>

<div style="background-color: #f5f7fa; padding: 16px; border-radius: 8px; margin: 24px 0;">
  <p><strong>Your login credentials:</strong></p>
  <p>Email: <code>{email}</code></p>
  <p>Temporary Password: <code>{tempPassword}</code></p>
</div>

<p style="text-align: center; margin: 32px 0;">
  <a href="{loginLink}" style="...">Sign In Now</a>
</p>

<p>You'll be prompted to set a permanent password on your first login.</p>
<p>This invitation expires in 7 days.</p>
```

---

## Security Considerations

1. **Temp password is stored plain text** in `staff_invitations.temp_password` for display in pending invitations UI - this is acceptable since:
   - Only owners/managers can view pending invitations
   - Password is only valid for 7 days
   - Password is invalidated after first use

2. **User account created immediately** means the email exists in auth.users - if invitation is cancelled, we should also delete the user account

3. **7-day expiry** is enforced by the `expires_at` on the invitation record - need to add a scheduled job or check on login to handle expired accounts

---

## Testing Checklist

- [ ] Invite new staff member
- [ ] Verify email received with credentials (not token link)
- [ ] Login with temp password works
- [ ] Password change dialog appears immediately after login
- [ ] Cannot dismiss dialog or access app until password changed
- [ ] After password change, full access granted
- [ ] Temp password no longer works after change
- [ ] Pending invitation shows temp password with copy button
- [ ] Accepted invitation no longer shows in pending list
- [ ] Invitation older than 7 days shows expired message on login attempt
