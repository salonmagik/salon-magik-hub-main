
# Staff Invitation Overhaul, Add Salon Flow & Hardcoded Data Fix Plan

## Summary of All Changes

1. **Staff email confirmation uses Salon Magik backend** - Replace Supabase's default confirm email with custom branded flow
2. **Temporary password for staff invitations** - Generate a temp password, display on pending invitation, invalidate after password change
3. **Skip onboarding for invited staff** - Direct to dashboard after password update
4. **Add Salon from Salons Overview** - "Add a Salon" CTA with tier/quota validation and Stripe billing upgrade flow
5. **Fix hardcoded values** - Communication credits, trial countdown, user name/email in sidebar
6. **Remove "Roles & Permissions" from Settings** - Already exists in Staff module
7. **Team member details modal and actions** - View details, deactivate, view activities, review permissions

---

## Part 1: Custom Email Confirmation for Staff

### Problem
Staff currently receive Supabase/Lovable's default confirmation email when accepting invitations, not Salon Magik branded emails.

### Solution
Modify the invitation acceptance flow to:
1. Create user without requiring email verification (since they received the invitation email as proof of ownership)
2. OR trigger custom `send-email-verification` edge function with Salon Magik branding

### Implementation

**Option A (Recommended): Skip email verification for invited staff**

Since the staff received the invitation email, that acts as verification of email ownership. We can:
1. Create the user account
2. Auto-confirm their email via admin API
3. Sign them in immediately

Update `AcceptInvitePage.tsx`:
```typescript
// Use service role to auto-confirm email for invited users
// The invitation email itself is proof of email ownership
const { data, error } = await supabase.functions.invoke("accept-staff-invitation", {
  body: {
    token: invitationToken,
    password: formData.password,
  },
});
```

**New Edge Function: `accept-staff-invitation`**
- Uses service role to create user
- Auto-confirms email via `supabase.auth.admin.updateUserById()`
- Creates user_role and profile
- Updates invitation status
- Returns session for auto-login

---

## Part 2: Temporary Password System for Staff Invitations

### Current Flow
1. Invite sent with link
2. Staff clicks link and creates password
3. Staff must verify email (Supabase default)
4. Staff logs in

### New Flow
1. Invite sent with link AND temporary password
2. Staff can log in with temp password immediately
3. On first login with temp password, forced to change password
4. After password change, temp password is invalidated
5. No email verification needed (invitation is proof)

### Database Changes

Add columns to `staff_invitations` table:
```sql
ALTER TABLE staff_invitations
ADD COLUMN temp_password_hash TEXT,
ADD COLUMN temp_password_used BOOLEAN DEFAULT false,
ADD COLUMN password_changed_at TIMESTAMP WITH TIME ZONE;
```

### Implementation

**Update `send-staff-invitation` edge function:**
```typescript
// Generate random temporary password
const tempPassword = generateSecurePassword(); // e.g., "S@l0n!X7k9"

// Hash it for storage (don't store plain text)
const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

// Store in invitation record
await supabase.from("staff_invitations").update({
  temp_password_hash: tempPasswordHash,
}).eq("id", invitation.id);

// Include in email (plain text for user to copy)
// Also return in response for UI display
```

**Update Pending Invitations UI:**
```tsx
// Show temp password with copy button if not yet used
{!invitation.temp_password_used && invitation.temp_password && (
  <div className="flex items-center gap-2 mt-2">
    <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
      {invitation.temp_password}
    </span>
    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(invitation.temp_password)}>
      <Copy className="w-3 h-3" />
    </Button>
  </div>
)}

{invitation.password_changed_at && (
  <Badge variant="outline" className="text-xs text-muted-foreground">
    Password updated
  </Badge>
)}
```

**New Login Flow for Temp Passwords:**
1. Staff logs in with email + temp password
2. Backend validates temp password against hash
3. If valid, creates session BUT marks `requiresPasswordChange: true`
4. Frontend detects this flag and shows password change modal
5. After password change, `password_changed_at` is set and temp password becomes invalid

**Password Change Enforcement:**
```tsx
// In useAuth or ProtectedRoute
if (session?.user?.user_metadata?.requires_password_change) {
  // Show forced password change dialog
  return <ForcePasswordChangeDialog />;
}
```

---

## Part 3: Skip Onboarding for Invited Staff

### Current Flow
Invited staff go through the same onboarding as new users creating their own salon.

### New Flow
1. Invited staff accepts invitation
2. User account is created with role already assigned
3. Staff is redirected directly to dashboard (not onboarding)
4. If using temp password, shown password change dialog first

### Implementation

**Check in `ProtectedRoute.tsx` or `App.tsx`:**
```typescript
// Check if user has any tenant roles
const { data: roles } = await supabase
  .from("user_roles")
  .select("tenant_id")
  .eq("user_id", user.id);

// If user has roles, they were invited - skip onboarding
if (roles && roles.length > 0) {
  navigate("/salon");
} else {
  // No roles = new user needs onboarding
  navigate("/onboarding");
}
```

**Update `AcceptInvitePage.tsx`:**
```typescript
// After successful invitation acceptance
toast({ title: "Welcome!", description: "Your account has been set up." });

// Redirect to salon (not onboarding)
navigate("/salon");
```

---

## Part 4: Add Salon from Salons Overview

### Current State
Salons Overview page shows existing locations but no way to add new ones.

### New Flow
1. "Add a Salon" button on Salons Overview
2. Check current plan limits (solo: 1, studio: 1, chain: X)
3. If at limit:
   - Solo/Studio: Show upgrade modal to select Chain tier
   - Chain at limit: Show add-on purchase for more locations
4. Payment via Stripe Checkout
5. On success: Show invoice, unlock location slot
6. On failure: Show retry with card update option

### Implementation

**UI Components:**

1. **AddSalonButton** in `SalonsOverviewPage.tsx`:
```tsx
<Button onClick={handleAddSalon} className="gap-2">
  <Plus className="w-4 h-4" />
  Add a Salon
</Button>
```

2. **AddSalonDialog** (or modal):
   - Checks `currentTenant.plan` and current location count
   - If can add: Show location form
   - If at limit: Show upgrade prompt

3. **UpgradePlanModal**:
   - For Solo/Studio: Select Chain plan
   - For Chain: Select additional locations (e.g., +1, +3, +5)
   - Shows pricing breakdown
   - Confirms billing details

4. **Stripe Checkout Integration**:
```typescript
// Create checkout session for plan upgrade or location add-on
const { data } = await supabase.functions.invoke("create-checkout-session", {
  body: {
    type: "plan_upgrade", // or "location_addon"
    targetPlan: "chain",
    additionalLocations: 2, // for add-ons
  },
});

// Redirect to Stripe
window.location.href = data.url;
```

**Edge Function: `create-checkout-session`**

Already exists - may need updates to handle:
- Plan upgrades
- Location add-on purchases

**Webhook Handler Updates:**
- On successful upgrade: Update `tenants.plan`
- On location add-on: Increment `plan_limits.max_locations` for tenant or track in separate table

### Plan Limit Checking

```typescript
const { data: planLimits } = await supabase
  .from("plan_limits")
  .select("max_locations")
  .eq("plan_id", currentPlanId)
  .single();

const { count: currentLocations } = await supabase
  .from("locations")
  .select("id", { count: "exact", head: true })
  .eq("tenant_id", currentTenant.id);

const canAddLocation = currentLocations < planLimits.max_locations;
```

---

## Part 5: Fix Hardcoded Values

### 5.1 Communication Credits in Sidebar/Dashboard

**Current State:** Some displays show hardcoded values.

**Fix:** All credit displays already use `useMessagingCredits` hook which fetches from database. Verify:
- `MessagingPage.tsx` ✓ (uses `stats.creditsRemaining`)
- `SalonDashboard.tsx` ✓ (uses `stats.communicationCredits`)

### 5.2 Trial Countdown in Sidebar

**Current State:** `SalonSidebar.tsx` already fetches from `currentTenant.trial_ends_at`:
```typescript
const daysLeft = Math.ceil(
  (new Date(currentTenant.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
);
return { emoji: "⏰", label: `Trial (${daysLeft}d)` };
```
✓ Already dynamic

### 5.3 Name and Email in Sidebar

**Current State:** Hardcoded as "Agatha Ambrose" and "agathambrose@gmail.com":
```tsx
// Lines 323-334 in SalonSidebar.tsx
<div className="w-8 h-8 bg-white/20 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
  A
</div>
{(isExpanded || isMobileOpen) && (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium truncate text-white">
      Agatha Ambrose  // HARDCODED
    </p>
    <p className="text-xs text-white/70 truncate">
      agathambrose@gmail.com  // HARDCODED
    </p>
  </div>
)}
```

**Fix:** Use `profile` and `user` from `useAuth`:
```tsx
const { user, profile } = useAuth();

const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
const displayEmail = user?.email || "";
const initials = displayName
  .split(" ")
  .map((n) => n[0])
  .join("")
  .toUpperCase()
  .slice(0, 2);

// In JSX:
<div className="w-8 h-8 bg-white/20 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
  {initials}
</div>
{(isExpanded || isMobileOpen) && (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium truncate text-white">{displayName}</p>
    <p className="text-xs text-white/70 truncate">{displayEmail}</p>
  </div>
)}
```

---

## Part 6: Remove "Roles & Permissions" from Settings

### Current State
Settings has a "Roles & Permissions" tab that duplicates functionality in Staff module.

### Fix
Remove from `settingsTabs` array in `SettingsPage.tsx`:

```typescript
// REMOVE this line:
{ id: "roles", label: "Roles & Permissions", icon: Shield },

// REMOVE the renderRolesTab function (lines 1259-1293)
```

Update the tab rendering logic to skip the roles case.

---

## Part 7: Team Member Details & Actions

### Current State
Team members table has minimal actions (Change Role, Remove from Team).

### New Features

1. **Details Modal** - Click row to open full profile view
2. **Actions Menu** (3-dot):
   - View Details
   - View Activities (audit log filtered by user)
   - Review Permissions (add/remove access)
   - Deactivate (soft-disable account)

### Implementation

**StaffDetailDialog.tsx:**
```tsx
interface StaffDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember;
}

export function StaffDetailDialog({ open, onOpenChange, staff }: StaffDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Team Member Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Avatar and name */}
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={staff.profile?.avatar_url} />
              <AvatarFallback>{getInitials(staff.profile?.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{staff.profile?.full_name}</h3>
              <Badge>{roleLabels[staff.role]}</Badge>
            </div>
          </div>
          
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p>{staff.email || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p>{staff.profile?.phone || "—"}</p>
            </div>
          </div>
          
          {/* Status */}
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant={staff.isActive ? "success" : "destructive"}>
              {staff.isActive ? "Active" : "Deactivated"}
            </Badge>
          </div>
          
          {/* Activity summary */}
          <div>
            <p className="text-sm text-muted-foreground">Last Activity</p>
            <p>{staff.lastActivityAt ? formatDistanceToNow(new Date(staff.lastActivityAt)) : "Never"}</p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Updated Actions Menu:**
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-8 w-8">
      <MoreHorizontal className="w-4 h-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => setSelectedStaff(member)}>
      <User className="w-4 h-4 mr-2" />
      View Details
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => navigate(`/salon/audit-log?userId=${member.userId}`)}>
      <History className="w-4 h-4 mr-2" />
      View Activities
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => openPermissionsReview(member)}>
      <Shield className="w-4 h-4 mr-2" />
      Review Permissions
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={() => handleRoleChange(member)}>
      <UserCog className="w-4 h-4 mr-2" />
      Change Role
    </DropdownMenuItem>
    <DropdownMenuItem 
      onClick={() => handleDeactivate(member)}
      className={member.isActive ? "text-destructive" : "text-success"}
    >
      {member.isActive ? (
        <>
          <XCircle className="w-4 h-4 mr-2" />
          Deactivate
        </>
      ) : (
        <>
          <CheckCircle className="w-4 h-4 mr-2" />
          Reactivate
        </>
      )}
    </DropdownMenuItem>
    <DropdownMenuItem className="text-destructive" onClick={() => handleRemove(member)}>
      <Trash className="w-4 h-4 mr-2" />
      Remove from Team
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Row Click Handler:**
```tsx
<TableRow 
  key={member.userId} 
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => setSelectedStaff(member)}
>
```

### Database: Staff Deactivation

Add `is_active` column to `user_roles` or create separate tracking:
```sql
ALTER TABLE user_roles ADD COLUMN is_active BOOLEAN DEFAULT true;
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/accept-staff-invitation/index.ts` | CREATE | Handle invitation acceptance with auto-confirm |
| `supabase/functions/send-staff-invitation/index.ts` | EDIT | Generate and store temp password |
| `src/pages/auth/AcceptInvitePage.tsx` | EDIT | Use new edge function, redirect to salon |
| `src/components/layout/SalonSidebar.tsx` | EDIT | Fix hardcoded name/email |
| `src/pages/salon/SettingsPage.tsx` | EDIT | Remove Roles & Permissions tab |
| `src/pages/salon/SalonsOverviewPage.tsx` | EDIT | Add "Add a Salon" button and flow |
| `src/pages/salon/StaffPage.tsx` | EDIT | Add details modal, enhanced actions |
| `src/components/dialogs/StaffDetailDialog.tsx` | CREATE | Staff member detail view |
| `src/components/dialogs/AddSalonDialog.tsx` | CREATE | Add new salon form with tier checking |
| `src/components/dialogs/UpgradePlanModal.tsx` | CREATE | Plan upgrade/location purchase flow |
| `src/hooks/useStaffInvitations.tsx` | EDIT | Include temp password fields |
| `src/hooks/useAuth.tsx` | EDIT | Check for requires_password_change flag |
| `supabase/migrations/YYYYMMDDHHMMSS_add_temp_password_to_invitations.sql` | CREATE | Add temp password columns |

---

## Technical Notes

### Password Generation
```typescript
function generateSecurePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%&*";
  let password = "";
  
  // 8 alphanumeric chars
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // 2 special chars
  for (let i = 0; i < 2; i++) {
    password += specials.charAt(Math.floor(Math.random() * specials.length));
  }
  
  return password; // e.g., "S@lon7Xk&9"
}
```

### Plan Limit Enforcement
```typescript
const planLimits = {
  solo: { maxLocations: 1 },
  studio: { maxLocations: 1 },
  chain: { maxLocations: 5 }, // base, can purchase more
};
```

### Temp Password Security
- Stored as bcrypt hash in database
- Never logged in plain text
- Invalidated immediately after password change
- 7-day expiry (same as invitation)

---

## Testing Checklist

### Staff Invitation Flow
- [ ] Send invitation generates temp password
- [ ] Temp password visible on pending invitation card
- [ ] Copy temp password works
- [ ] Staff can login with temp password
- [ ] Password change dialog appears on first login
- [ ] After password change, temp password no longer works
- [ ] Copy password button disabled after password changed

### Staff Skip Onboarding
- [ ] Invited staff redirected to dashboard (not onboarding)
- [ ] New users (no invitation) go to onboarding

### Add Salon
- [ ] Solo/Studio users see upgrade prompt
- [ ] Chain users at limit see add-on purchase
- [ ] Stripe checkout works
- [ ] Successful payment unlocks new location slot
- [ ] Failed payment shows retry option

### Hardcoded Values
- [ ] Sidebar shows actual user name and email
- [ ] Sidebar shows actual trial days from database
- [ ] Messaging page shows actual credit balance

### Settings & Staff Module
- [ ] Roles & Permissions tab removed from Settings
- [ ] Team member row click opens details modal
- [ ] Actions menu has all options (View Details, Activities, Permissions, Deactivate)
- [ ] Deactivate/Reactivate toggles correctly
