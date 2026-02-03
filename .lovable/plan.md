

# Enhanced Batch 7: Complete Polish + Customer Improvements + Appointment Emails

This final batch implements customer transaction tracking, fixes the notifications badge, adds selective appointment email notifications, and polishes the mobile experience.

---

## Summary of All Requirements

| Feature | Description |
|---------|-------------|
| Customer Transaction Tracker | Add "Transactions" tab to customer profile with filters |
| Notifications Badge Bug | Fix hardcoded "2" - use real `unreadCount` |
| **Appointment Emails (Selective)** | Send emails for booking, completion, cancellation, reschedule only |
| Mobile Audit | Responsiveness verification |
| Help Page Polish | Cleanup unnecessary links |

---

## Appointment Actions Requiring Email Notifications

| Action | Email Template Type | Send Email? | Notes |
|--------|---------------------|-------------|-------|
| Scheduled (new booking) | `appointment_confirmation` | Yes | Customer confirmation |
| Walk-in Created | `appointment_confirmation` | Yes | Same as scheduled |
| Started | - | No | Track via client portal |
| Paused | - | No | Track via client portal |
| Resumed | - | No | Track via client portal |
| Completed | `appointment_completed` | Yes | Thank you + receipt |
| Cancelled | `appointment_cancelled` | Yes | Cancellation notice |
| Rescheduled | `appointment_rescheduled` | Yes | New date/time info |

**Rationale:** Started, paused, and resumed are real-time status changes that customers can monitor through their booking portal. Email notifications for these would be excessive and potentially confusing.

---

## Phase 1: Appointment Email Edge Function

Create a unified edge function that handles the 4 email-triggering actions.

**Edge Function:** `send-appointment-notification`

**Accepted Actions:**
- `scheduled` - New booking confirmation
- `completed` - Thank you email with receipt summary
- `cancelled` - Cancellation notice with reason
- `rescheduled` - Updated date/time notification

**Request Payload:**
```typescript
{
  appointmentId: string;
  action: "scheduled" | "completed" | "cancelled" | "rescheduled";
  additionalData?: {
    reason?: string;      // For cancelled
    newDate?: string;     // For rescheduled
    newTime?: string;     // For rescheduled
  }
}
```

**Template Variables:**
| Variable | Description |
|----------|-------------|
| `{{customer_name}}` | Customer's full name |
| `{{salon_name}}` | Tenant/business name |
| `{{appointment_date}}` | Formatted date |
| `{{appointment_time}}` | Formatted time |
| `{{services}}` | Comma-separated service names |
| `{{total_amount}}` | Total price |
| `{{location}}` | Salon location |
| `{{reason}}` | Cancellation reason |
| `{{new_date}}` | New date (reschedule) |
| `{{new_time}}` | New time (reschedule) |

---

## Phase 2: Integration with useAppointments Hook

Add email triggers to only the relevant actions:

| Function | Trigger Email? | Action Parameter |
|----------|----------------|------------------|
| `createAppointment()` | Yes | "scheduled" |
| `startAppointment()` | No | - |
| `pauseAppointment()` | No | - |
| `resumeAppointment()` | No | - |
| `completeAppointment()` | Yes | "completed" |
| `cancelAppointment()` | Yes | "cancelled" + reason |
| `rescheduleAppointment()` | Yes | "rescheduled" + new date/time |

**Helper function:**
```typescript
const sendAppointmentNotification = async (
  appointmentId: string,
  action: "scheduled" | "completed" | "cancelled" | "rescheduled",
  additionalData?: Record<string, string>
) => {
  try {
    await supabase.functions.invoke("send-appointment-notification", {
      body: { appointmentId, action, ...additionalData },
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
    // Don't fail the main action
  }
};
```

---

## Phase 3: Fix Notifications Badge

**Current Issue:** `SalonSidebar.tsx` line 366-367 has hardcoded "2" badge.

**Solution:**
1. Import `useNotifications` hook
2. Use `unreadCount` from hook
3. Only show badge when `unreadCount > 0`
4. Display "9+" if count exceeds 9

---

## Phase 4: Customer Transaction Tracker

Add a "Transactions" tab to `CustomerDetailDialog.tsx`:

**Features:**
- Display all transactions for the customer
- Filter by: Date range, Amount, Appointment reference
- Columns: Date, Type, Amount, Method, Status, Appointment Link
- Sort by date (newest first)

**Hook Enhancement:**
Add `fetchAllCustomerTransactions()` to `useCustomerPurse.tsx`

---

## Phase 5: Mobile Audit + Help Page

**Mobile Responsiveness:**
- Verify tables use horizontal scroll
- Touch targets meet 44px minimum
- Dialogs fit on small screens

**Help Page Cleanup:**
- Remove placeholder documentation link
- Remove placeholder video tutorials link
- Keep email support option

---

## Email Templates (Final List)

### Appointment Confirmation (scheduled)
```
Subject: Appointment Confirmed at {{salon_name}}

Hi {{customer_name}},
Your appointment has been confirmed for {{appointment_date}} at {{appointment_time}}.
Services: {{services}}
Total: {{total_amount}}
We look forward to seeing you!
```

### Appointment Completed
```
Subject: Thank you for visiting {{salon_name}}!

Hi {{customer_name}},
Your appointment has been completed.
Services: {{services}}
Total: {{total_amount}}
We hope to see you again soon!
```

### Appointment Cancelled
```
Subject: Appointment Cancelled

Hi {{customer_name}},
Your appointment at {{salon_name}} has been cancelled.
Reason: {{reason}}
We hope to serve you again in the future.
```

### Appointment Rescheduled
```
Subject: Appointment Rescheduled

Hi {{customer_name}},
Your appointment has been rescheduled.
New Date: {{new_date}}
New Time: {{new_time}}
Services: {{services}}
See you then!
```

---

## Files Summary

**Files to Create:**
- `supabase/functions/send-appointment-notification/index.ts`

**Files to Modify:**
- `src/hooks/useAppointments.tsx` - Add email triggers for 4 actions
- `src/components/layout/SalonSidebar.tsx` - Fix notifications badge
- `src/components/dialogs/CustomerDetailDialog.tsx` - Add Transactions tab
- `src/hooks/useCustomerPurse.tsx` - Add transaction fetching
- `supabase/config.toml` - Register new edge function
- `src/pages/salon/HelpPage.tsx` - Cleanup placeholders

---

## Implementation Order

| Step | Task | Priority |
|------|------|----------|
| 1 | Create `send-appointment-notification` edge function | High |
| 2 | Integrate notifications into 4 appointment actions | High |
| 3 | Fix notifications badge in sidebar | High |
| 4 | Add Transactions tab to CustomerDetailDialog | High |
| 5 | Mobile responsiveness audit | Medium |
| 6 | Help page cleanup | Low |

---

## Progress After This Batch

| Batch | Status |
|-------|--------|
| Batch 1: Core Appointments | Done |
| Batch 2: Appointment Products | Done |
| Batch 3: Product Fulfillment | Done |
| Batch 4: Settings + UX | Done |
| Batch 5: Backend (Staff Invites) | Done |
| Batch 6: Reports + Export | Done |
| **Batch 7: Polish + Enhancements** | This batch |

**After completion: 100% of implementation plan complete**

