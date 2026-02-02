
# Comprehensive Salon Platform Completion Plan

## Overview
This plan covers the completion of all remaining salon platform modules as defined in the PRD. The implementation will follow a logical dependency order, ensuring database schema changes are made first, followed by hooks, then UI components.

---

## Phase 1: Database Schema Updates

### 1.1 Add Image Support for Catalog Items
Add `image_urls` column (text array, max 2 images) to services, packages, and products tables.

```sql
-- Add image_urls to services
ALTER TABLE services ADD COLUMN image_urls text[] DEFAULT '{}';

-- Add image_urls to packages
ALTER TABLE packages ADD COLUMN image_urls text[] DEFAULT '{}';

-- Add image_urls to products
ALTER TABLE products ADD COLUMN image_urls text[] DEFAULT '{}';
```

### 1.2 Add Vouchers Table (Gift Cards)
```sql
CREATE TABLE vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  purchased_by_customer_id uuid REFERENCES customers(id),
  redeemed_by_customer_id uuid REFERENCES customers(id),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add RLS
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read tenant vouchers" ON vouchers FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can create vouchers" ON vouchers FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can update vouchers" ON vouchers FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
```

### 1.3 Add Staff Invitations Table
```sql
CREATE TABLE staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by_id uuid,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read tenant invitations" ON staff_invitations FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can create invitations" ON staff_invitations FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can update invitations" ON staff_invitations FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
```

### 1.4 Add Notifications Table
```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid,
  type text NOT NULL CHECK (type IN ('appointment', 'payment', 'customer', 'system', 'staff')),
  title text NOT NULL,
  description text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  urgent boolean NOT NULL DEFAULT false,
  entity_type text,
  entity_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read tenant notifications" ON notifications FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can update notifications" ON notifications FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
```

### 1.5 Add Email Templates Table
```sql
CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  template_type text NOT NULL CHECK (template_type IN (
    'appointment_confirmation', 'appointment_reminder', 'appointment_cancelled',
    'booking_confirmation', 'payment_receipt', 'refund_confirmation',
    'staff_invitation', 'welcome'
  )),
  subject text NOT NULL,
  body_html text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, template_type)
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read tenant templates" ON email_templates FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
CREATE POLICY "Users can manage templates" ON email_templates FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
```

### 1.6 Add Notification Settings Table
```sql
CREATE TABLE notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) UNIQUE,
  email_appointment_reminders boolean NOT NULL DEFAULT true,
  sms_appointment_reminders boolean NOT NULL DEFAULT false,
  email_new_bookings boolean NOT NULL DEFAULT true,
  email_cancellations boolean NOT NULL DEFAULT true,
  email_daily_digest boolean NOT NULL DEFAULT false,
  reminder_hours_before integer NOT NULL DEFAULT 24,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage tenant notification settings" ON notification_settings FOR ALL USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));
```

---

## Phase 2: Products & Services Page Completion

### 2.1 Image Upload for Catalog Items
- Create a new storage bucket `catalog-images` for service/product/package images
- Update `AddServiceDialog.tsx`, `AddProductDialog.tsx`, `AddPackageDialog.tsx` to include:
  - Image upload zone (max 2 images)
  - Preview thumbnails with remove option
  - Upload to Supabase Storage on submit
- Update `ServicesPage.tsx` `ItemCard` component to display images

### 2.2 Vouchers Tab
- Add "Vouchers" tab to ServicesPage tabs
- Create `AddVoucherDialog.tsx` component for creating gift cards
- Create `useVouchers.tsx` hook for CRUD operations
- Display voucher cards with code, amount, status, expiry

### 2.3 Fetch Real Data
- Update ServicesPage to use `useServices` hook for real data
- Create hooks for packages and products if not existing
- Remove hardcoded sample data

---

## Phase 3: Customers Page (Complete Implementation)

### 3.1 Real Data Integration
- Update CustomersPage to use `useCustomers` hook
- Fetch customer_purses data alongside customers
- Display real stats cards (Total, VIP, New This Month, Inactive)

### 3.2 Customer Detail View
- Create `CustomerDetailDialog.tsx` with tabs:
  - Overview (contact info, notes)
  - Appointments (history with status)
  - Purse (balance, transaction history)
  - Preferences (communication, birthday)

### 3.3 Customer Purse Management
- Create `useCustomerPurse.tsx` hook
- Display purse balance on customer cards
- Add "Top Up Purse" action in detail view
- Show purse transaction history

### 3.4 Customer Status Management
- Add ability to mark customers as VIP, blocked, inactive
- Add status column to customers table if needed
- Filter by status in list view

---

## Phase 4: Payments Page

### 4.1 Transactions List
- Create `PaymentsPage.tsx` with tabs: All, Revenue, Refunds, Purse Topups
- Create `useTransactions.tsx` hook to fetch from transactions table
- Display transaction cards with amount, method, status, customer, date

### 4.2 Refund Management
- Display pending refund requests from `refund_requests` table
- Create `RefundRequestDialog.tsx` for initiating refunds
- Create approval/rejection flow for managers
- Track refund status through lifecycle

### 4.3 Payments Statistics
- Stats cards: Today's Revenue, Pending Refunds, Purse Balance Total
- Filter by date range
- Export functionality (later phase)

---

## Phase 5: Reports Page

### 5.1 Dashboard Reports
- Create `ReportsPage.tsx` with sections:
  - Revenue Overview (daily/weekly/monthly charts)
  - Appointment Analytics (completion rates, cancellation trends)
  - Customer Insights (new vs returning, top spenders)
  - Service Performance (most booked, revenue by service)

### 5.2 Data Hooks
- Create `useReports.tsx` hook with aggregation queries
- Calculate metrics from appointments, transactions, customers tables

### 5.3 Charts Integration
- Use Recharts for visualizations (already installed)
- Line charts for revenue trends
- Bar charts for service performance
- Pie charts for payment method breakdown

---

## Phase 6: Messaging Page

### 6.1 Communication Credits
- Display current credit balance from `communication_credits` table
- Create `useMessagingCredits.tsx` hook
- Show free monthly allocation vs purchased credits
- "Buy Credits" CTA (placeholder for payment integration)

### 6.2 Message Templates
- List configured email/SMS templates
- Quick preview of template content
- Edit template functionality

### 6.3 Delivery History
- Display sent messages with status (delivered, failed, pending)
- Filter by type (SMS, Email) and date
- Credit usage per message

---

## Phase 7: Journal Page (Audit Logs)

### 7.1 Audit Log Viewer
- Create `JournalPage.tsx` displaying entries from `audit_logs` table
- Create `useAuditLogs.tsx` hook with pagination
- Display: timestamp, actor, action, entity type, entity name

### 7.2 Filtering & Search
- Filter by action type (create, update, delete)
- Filter by entity type (appointment, customer, service, etc.)
- Date range picker
- Search by entity name

### 7.3 Detail View
- Click to expand showing before/after JSON diff
- Highlight changed fields

---

## Phase 8: Staff Page (Invitations)

### 8.1 Staff Invitation Edge Function
- Create `supabase/functions/invite-staff/index.ts`:
  - Generate secure invitation token
  - Create staff_invitation record
  - Send invitation email via Resend/similar
  - Return success/failure

### 8.2 Invitation Flow
- Update `InviteStaffDialog.tsx` to call edge function
- Display pending invitations in Staff page
- Resend / Cancel invitation actions

### 8.3 Invitation Acceptance
- Create `/accept-invitation/:token` route
- Validate token, create user account, assign role
- Redirect to onboarding or dashboard

---

## Phase 9: Email Templates

### 9.1 Templates Management Page
- Add "Email Templates" tab/section in Settings or Messaging
- Create `EmailTemplatesPage.tsx` component
- List all template types with edit buttons

### 9.2 Template Editor
- Create `EditTemplateDialog.tsx` with:
  - Subject line editor
  - HTML body editor (simple WYSIWYG or textarea)
  - Preview panel
  - Available variables list ({{customer_name}}, {{appointment_date}}, etc.)

### 9.3 Default Templates
- Seed default templates for each type when tenant is created
- Allow reset to default

---

## Phase 10: Settings Page Completion

### 10.1 Complete All Tabs
Currently implemented: Profile, Hours, Notifications (partial)
Need to implement:
- **Booking Settings**: Online booking toggle, pay-at-salon toggle, deposit settings
- **Payments**: Currency, payment methods, Stripe/Paystack integration status
- **Roles & Permissions**: View permission matrix (read-only for now)
- **Subscription**: Current plan, usage, upgrade CTA
- **Integrations**: Connected services status

### 10.2 Notification Settings Persistence
- Save notification preferences to `notification_settings` table
- Load on page mount

---

## Phase 11: Help Module

### 11.1 Help Page Content
- Create `HelpPage.tsx` with sections:
  - Getting Started guide
  - FAQ accordion
  - Contact Support form/link
  - Documentation links
  - Video tutorials placeholder

### 11.2 In-App Help
- Help tooltips on complex features
- "?" icons linking to relevant documentation

---

## Phase 12: Notifications System

### 12.1 Real-Time Notifications
- Update `NotificationsPanel.tsx` to fetch from `notifications` table
- Subscribe to realtime updates for new notifications
- Mark as read functionality

### 12.2 Notification Creation
- Add notification triggers for key events:
  - New appointment booked
  - Appointment cancelled
  - Payment received
  - New customer registered
  - Staff invitation accepted

---

## Phase 13: Dashboard Updates

### 13.1 Dynamic Onboarding Checklist
- Calculate actual completion status:
  - Has at least one service
  - Has at least one customer
  - Has completed first appointment
  - Has configured payments
  - Has enabled online booking
- Show/hide based on completion

### 13.2 Enhanced Stats
- Add week/month comparison indicators
- Quick action buttons on cards

---

## File Changes Summary

### New Files to Create:
```text
src/pages/salon/PaymentsPage.tsx
src/pages/salon/ReportsPage.tsx
src/pages/salon/MessagingPage.tsx
src/pages/salon/JournalPage.tsx
src/pages/salon/HelpPage.tsx

src/components/dialogs/AddVoucherDialog.tsx
src/components/dialogs/CustomerDetailDialog.tsx
src/components/dialogs/RefundRequestDialog.tsx
src/components/dialogs/EditTemplateDialog.tsx

src/hooks/useVouchers.tsx
src/hooks/useTransactions.tsx
src/hooks/useRefunds.tsx
src/hooks/useReports.tsx
src/hooks/useMessagingCredits.tsx
src/hooks/useAuditLogs.tsx
src/hooks/useNotifications.tsx
src/hooks/useCustomerPurse.tsx
src/hooks/useProducts.tsx
src/hooks/usePackages.tsx
src/hooks/useEmailTemplates.tsx
src/hooks/useNotificationSettings.tsx

supabase/functions/invite-staff/index.ts
```

### Files to Modify:
```text
src/pages/salon/ServicesPage.tsx (real data, images, vouchers tab)
src/pages/salon/CustomersPage.tsx (real data, purse, detail view)
src/pages/salon/StaffPage.tsx (pending invitations)
src/pages/salon/SettingsPage.tsx (complete all tabs)
src/pages/salon/SalonDashboard.tsx (dynamic checklist)
src/pages/salon/PlaceholderPages.tsx (remove completed placeholders)

src/components/dialogs/AddServiceDialog.tsx (image upload)
src/components/dialogs/AddProductDialog.tsx (image upload)
src/components/dialogs/AddPackageDialog.tsx (image upload)
src/components/dialogs/InviteStaffDialog.tsx (call edge function)

src/components/notifications/NotificationsPanel.tsx (real data)

src/App.tsx (update routes)
```

---

## Implementation Order

1. Database migrations (all schema changes)
2. Create new hooks for data fetching
3. Catalog images (storage bucket + dialog updates)
4. Customers page with purse
5. Payments page
6. Reports page
7. Messaging page with credits
8. Journal page
9. Staff invitations (edge function)
10. Email templates
11. Settings completion
12. Help module
13. Notifications system
14. Dashboard updates

---

## Technical Considerations

### Storage Setup for Images
- Create `catalog-images` bucket with public access
- RLS policy: tenant members can upload to their tenant folder
- Path pattern: `{tenant_id}/{type}/{item_id}/{filename}`

### Edge Function for Invitations
- Use Resend or similar for email delivery
- Store RESEND_API_KEY as secret
- Generate cryptographically secure tokens
- Set 7-day expiry on invitations

### Realtime Subscriptions
- Enable realtime on notifications table
- Subscribe to INSERT events for current tenant
- Update notification bell badge count

### Mobile Responsiveness
- All new pages follow existing responsive patterns
- Dialogs use `mx-4` on mobile, scrollable content
- Tables convert to cards on small screens
