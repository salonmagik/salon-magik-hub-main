

# Complete Template System & Custom Auth Emails Implementation

## Overview

This plan implements the full Template Catalogue from the PRD, including custom-branded password reset and welcome emails, appointment reminders, buffer request notifications, and all other templates specified in the catalogue.

---

## Current State Analysis

### What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `useEmailTemplates.tsx` | Partial | 8 template types defined, missing 15+ from PRD |
| `email_templates` table | Exists | Has `channel` column but limited types |
| `send-appointment-notification` | Exists | Handles scheduled/completed/cancelled/rescheduled |
| `send-staff-invitation` | Exists | Custom branded emails via Resend |
| Forgot Password | Uses Supabase default | Sends Supabase-branded email, not Salon Magik |
| Reset Password Page | Relies on Supabase `#type=recovery` | Uses Supabase auth flow |
| Appointment Reminder | Not implemented | No scheduler or edge function |
| Buffer Request | Not implemented | No notification system |

### Key Gaps

1. **Auth emails** use Supabase default templates (not branded)
2. **Password reset** relies on Supabase's email link flow
3. **No token management** for custom reset flow
4. **Missing 15+ template types** from PRD catalogue
5. **No in-app notification templates** defined
6. **No buffer request notifications**
7. **No subscription/trial emails**

---

## Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Create Token Tables

```sql
-- Password reset tokens (1-hour expiry)
CREATE TABLE public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prt_token ON password_reset_tokens(token);
CREATE INDEX idx_prt_email ON password_reset_tokens(email);

-- Email verification tokens (24-hour expiry)
CREATE TABLE public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evt_token ON email_verification_tokens(token);

-- Enable RLS (service role only access via edge functions)
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
```

#### 1.2 Expand Template Type Enum

The `email_templates.template_type` column needs to support additional types from the PRD catalogue.

---

### Phase 2: Template Type Expansion

#### 2.1 New Template Types to Add

| Template Type | Channel | Trigger | Audience |
|--------------|---------|---------|----------|
| `password_reset` | email | Forgot password request | User |
| `password_changed` | email | Password successfully reset | User |
| `email_verification` | email | New account signup | User |
| `welcome_owner` | email | Salon owner signup | Owner |
| `service_started` | in-app | Staff clicks "Start Service" | Customer |
| `buffer_requested` | email/in-app | Salon requests buffer time | Customer |
| `service_change_approval` | email | Service modified after start | Customer |
| `outstanding_fees_alert` | in-app | Customer with unpaid fees books | Salon |
| `trial_ending_7d` | email | 7 days before trial ends | Owner |
| `trial_ending_3h` | email | 3 hours before trial ends | Owner |
| `payment_failed` | email | Subscription charge fails | Owner |
| `store_credit_restored` | email | Refund to store credit | Customer |
| `gift_received` | email | Gift sent to recipient | Recipient |
| `voucher_applied` | email | Voucher redeemed | Customer |
| `new_feature` | email/in-app | Salon Magik feature launch | All |
| `maintenance_notice` | email/in-app | Scheduled maintenance | All |

#### 2.2 Update `useEmailTemplates.tsx`

Expand `TemplateType` union and add default templates with Salon Magik branding:

```typescript
export type TemplateType =
  // Existing
  | "appointment_confirmation"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "booking_confirmation"
  | "payment_receipt"
  | "refund_confirmation"
  | "staff_invitation"
  | "welcome"
  // New Auth
  | "password_reset"
  | "password_changed"
  | "email_verification"
  | "welcome_owner"
  // New Appointment
  | "service_started"
  | "buffer_requested"
  | "service_change_approval"
  // New Subscription
  | "trial_ending_7d"
  | "trial_ending_3h"
  | "payment_failed"
  // New Commerce
  | "store_credit_restored"
  | "gift_received"
  | "voucher_applied";
```

---

### Phase 3: Custom Password Reset Flow

#### 3.1 Edge Function: `send-password-reset`

**Purpose**: Replace Supabase's default reset email with branded Salon Magik email

**Flow**:
1. Accept email from frontend
2. Check if email exists in auth.users (via service role)
3. Generate secure random token
4. Store in `password_reset_tokens` with 1-hour expiry
5. Fetch custom template if salon has one, else use default
6. Send branded email via Resend with `{{reset_link}}`

**File**: `supabase/functions/send-password-reset/index.ts`

```typescript
// Key logic
const token = crypto.randomUUID();
const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

await supabase.from("password_reset_tokens").insert({
  email,
  token,
  expires_at: expiresAt.toISOString(),
});

const resetLink = `${origin}/reset-password?token=${token}`;
// Send via Resend with branded template
```

#### 3.2 Edge Function: `verify-reset-token`

**Purpose**: Validate token from URL before showing password form

**Returns**: `{ valid: boolean, email?: string }`

#### 3.3 Edge Function: `complete-password-reset`

**Purpose**: Update password using Supabase Admin API

**Flow**:
1. Verify token is valid and not used
2. Use service role to update auth.users password
3. Mark token as used
4. Send `password_changed` confirmation email
5. Return success (frontend redirects to login)

```typescript
// Using Admin API to update password
const { error } = await supabase.auth.admin.updateUserById(userId, {
  password: newPassword,
});
```

#### 3.4 Frontend Updates

**`ForgotPasswordPage.tsx`**:
- Replace `supabase.auth.resetPasswordForEmail()` with edge function call
- Keep the same UI, just change the API call

**`ResetPasswordPage.tsx`**:
- Extract `token` from `?token=xxx` query param
- Call `verify-reset-token` on mount
- On submit, call `complete-password-reset`
- On success, sign out user and redirect to `/login`

---

### Phase 4: Welcome/Verification Emails

#### 4.1 Edge Function: `send-email-verification`

**Trigger**: Called after successful signup

**Flow**:
1. Generate verification token (24-hour expiry)
2. Store in `email_verification_tokens`
3. Send branded welcome email with verify button
4. Include trial start messaging

#### 4.2 Edge Function: `verify-email`

**Purpose**: Mark email as verified when user clicks link

**Note**: May integrate with Supabase's email confirmation flow or be standalone

#### 4.3 Update Signup Flow

**`SignupPage.tsx`**:
- After `supabase.auth.signUp()`, call `send-email-verification`
- Show "Check your email" success state

---

### Phase 5: Template Defaults (Branded HTML)

All templates will use consistent Salon Magik branding:

```html
<div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="color: #E11D48; font-style: italic; margin: 0;">Salon Magik</h1>
  </div>
  
  <!-- Template-specific content -->
  
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    © 2024 Salon Magik. All rights reserved.
  </p>
</div>
```

#### Key Template Examples

**Password Reset**:
```
Subject: Reset your Salon Magik password

Hi there,

We received a request to reset your password. Click the button below:

[Reset Password] ← Button with #E11D48 color

This link expires in 1 hour.
```

**Welcome Owner**:
```
Subject: Welcome to Salon Magik

Hi {{first_name}},

You're officially in.

Salon Magik helps you manage bookings, payments, and customers without chaos.

[Complete Setup] ← CTA button

Your 14-day free trial has started!
```

**Buffer Requested**:
```
Subject: {{salon_name}} has requested a buffer

Hi {{customer_name}},

{{salon_name}} has requested a {{buffer_duration}} minute buffer.

[Accept] [Suggest Reschedule]
```

**Appointment Reminder**:
```
Subject: Reminder: upcoming appointment at {{salon_name}}

Just a reminder about your upcoming appointment today at {{time}}.

[I'm on my way]
```

---

### Phase 6: In-App Notification Templates

#### 6.1 Update Notification System

The existing `notifications` table and `useNotifications` hook already support types. Define structured notification templates:

| Notification Key | Type | Title Template | Description Template |
|-----------------|------|----------------|---------------------|
| `appointment_created` | appointment | New Appointment | "New appointment for {{service_name}} on {{date}} at {{time}}" |
| `service_started` | appointment | Service Started | "Your service at {{salon_name}} has started" |
| `buffer_requested` | appointment | Buffer Requested | "{{salon_name}} requested {{buffer}} min buffer. Please respond." |
| `outstanding_fees` | payment | Outstanding Fees | "This customer has outstanding fees from a previous appointment" |
| `refund_requires_approval` | payment | Refund Pending | "{{salon_name}} has requested approval to process a refund" |

#### 6.2 Create Notification Helper

**File**: `src/lib/notifications.ts`

```typescript
export const notificationTemplates = {
  appointment_created: {
    type: "appointment",
    title: "New Appointment",
    description: (vars) => `New appointment for ${vars.service_name} on ${vars.date} at ${vars.time}`,
    urgent: false,
  },
  buffer_requested: {
    type: "appointment",
    title: "Buffer Requested",
    description: (vars) => `${vars.salon_name} requested ${vars.buffer_duration} min buffer`,
    urgent: true,
  },
  // ... more templates
};

export function createNotification(templateKey: string, variables: Record<string, string>) {
  const template = notificationTemplates[templateKey];
  return {
    type: template.type,
    title: template.title,
    description: template.description(variables),
    urgent: template.urgent,
  };
}
```

---

### Phase 7: Update EditTemplateDialog

#### 7.1 Expand Variable Support

Update `templateVariables` mapping to include all required variables per template:

```typescript
const templateVariables: Record<TemplateType, string[]> = {
  // Auth
  password_reset: ["reset_link"],
  password_changed: ["customer_name"],
  email_verification: ["first_name", "verification_link"],
  welcome_owner: ["first_name", "cta_link"],
  
  // Appointments
  buffer_requested: ["customer_name", "salon_name", "buffer_duration", "accept_link", "reschedule_link"],
  service_change_approval: ["customer_name", "salon_name", "old_service", "new_service", "amount", "approve_link"],
  
  // Subscription
  trial_ending_7d: ["first_name", "cta_link"],
  trial_ending_3h: ["first_name", "cta_link"],
  payment_failed: ["first_name", "cta_link"],
  
  // Commerce
  gift_received: ["recipient_name", "sender_name", "custom_message", "service_name", "view_link"],
  voucher_applied: ["customer_name", "salon_name"],
  store_credit_restored: ["customer_name", "salon_name", "amount"],
  
  // ... existing templates
};
```

#### 7.2 Template Validation

Add validation to ensure required variables are present before saving:

```typescript
const validateTemplate = (type: TemplateType, bodyHtml: string): string[] => {
  const requiredVars = templateVariables[type];
  const missingVars = requiredVars.filter(v => !bodyHtml.includes(`{{${v}}}`));
  return missingVars;
};
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `supabase/functions/send-password-reset/index.ts` | Send branded reset email |
| `supabase/functions/verify-reset-token/index.ts` | Validate reset token |
| `supabase/functions/complete-password-reset/index.ts` | Update password via Admin API |
| `supabase/functions/send-email-verification/index.ts` | Send branded welcome/verification |
| `src/lib/notification-templates.ts` | In-app notification template definitions |

### Modified Files

| File | Changes |
|------|---------|
| `supabase/config.toml` | Add new edge functions with `verify_jwt = false` |
| `src/hooks/useEmailTemplates.tsx` | Expand `TemplateType` union, add 15+ default templates |
| `src/components/dialogs/EditTemplateDialog.tsx` | Expand variables, add validation |
| `src/pages/auth/ForgotPasswordPage.tsx` | Call custom edge function instead of Supabase |
| `src/pages/auth/ResetPasswordPage.tsx` | Handle `?token=xxx` flow, call edge functions |
| `src/pages/auth/SignupPage.tsx` | Call verification email edge function after signup |
| `supabase/migrations/xxx.sql` | Create token tables |

---

## Security Considerations

1. **Token Security**: Use `crypto.randomUUID()` for secure tokens
2. **Single-Use Tokens**: Mark as used immediately after successful operation
3. **Short Expiry**: Reset tokens expire in 1 hour, verification in 24 hours
4. **Rate Limiting**: Edge functions should check for recent token requests
5. **Email Enumeration**: Don't reveal if email exists in error responses
6. **Service Role Usage**: Only `complete-password-reset` uses Admin API

---

## Configuration Required

The following secrets are already configured:
- `RESEND_API_KEY` 
- `RESEND_FROM_EMAIL`
- `SUPABASE_SERVICE_ROLE_KEY` (needed for Admin API calls)

---

## Summary

This implementation:
1. Replaces Supabase default auth emails with Salon Magik branded templates
2. Adds custom token-based password reset flow
3. Expands template system from 8 to 23+ types per PRD catalogue
4. Adds in-app notification template definitions
5. Implements template variable validation
6. Maintains security with short-lived, single-use tokens

