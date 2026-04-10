# QA Manual Testing Checklist - Message API (Termii Integration)

**Feature**: Termii Integration for WhatsApp and SMS Messaging
**Branch**: feat/messaging
**Last Updated**: 2026-03-29

## Overview
This checklist covers manual QA testing for the complete messaging infrastructure including Termii WhatsApp/SMS integration, credit-based billing, template management, and all related UI components.

---

## Pre-requisites

### Environment Setup
- [x] Supabase project configured with all migrations deployed
- [x] Edge functions deployed to Supabase
- [x] Environment variables configured:
  - [x] `TERMII_API_KEY` set in Supabase Edge Functions
  - [x] `RESEND_API_KEY` set in Supabase Edge Functions
- [x] Test tenant created with valid data
- [x] Test customers created with:
  - [x] Valid email addresses
  - [ ] Valid phone numbers (international format, e.g., 2347880234567)
- [ ] Salon wallet funded with sufficient balance for testing

### Test Accounts
- [ ] Salon owner account with admin role
- [ ] Salon staff account with appropriate permissions
- [ ] Test customer accounts (minimum 5 for bulk testing)

---

## Test Scenarios

### 1. Termii Configuration

#### 1.1. Configure Termii Device ID and Sender ID
**Location**: `/salon/settings/messaging`

- [ ] Navigate to Messaging Settings page
- [ ] Verify page loads with 3 sections: Termii Configuration, WhatsApp Templates, Credit Balance & History
- [ ] Enter valid Termii Device ID in input field
- [ ] Enter valid Sender ID (3-11 alphanumeric characters, e.g., "SalonTest")
- [ ] Click Save button
- [ ] Verify success toast: "Termii configuration saved successfully"
- [ ] Refresh page and verify values persist
- [ ] Test validation: Enter 2-character sender ID, verify error message
- [ ] Test validation: Enter 12-character sender ID, verify error message
- [ ] Test validation: Enter special characters in sender ID, verify error message
- [ ] Verify link to Termii documentation opens correct URL

**Expected Result**: Device ID and Sender ID save successfully with proper validation

---

### 2. WhatsApp Template Management

#### 2.1. Create WhatsApp Template
**Location**: `/salon/settings/messaging` → WhatsApp Templates section

- [ ] Click "Create Template" button
- [ ] Verify dialog opens with all required fields
- [ ] Enter template name: "appointment_reminder_test"
- [ ] Select provider: "Termii"
- [ ] Enter template content: "Hi {{1}}, your appointment is scheduled for {{2}} at {{3}}."
- [ ] Add 3 variables:
  - [ ] Variable 1: "customer_name"
  - [ ] Variable 2: "appointment_date"
  - [ ] Variable 3: "appointment_time"
- [ ] Verify template preview shows content with placeholders
- [ ] Click Save
- [ ] Verify success toast: "Template created successfully"
- [ ] Verify new template appears in table with status "Pending"
- [ ] Verify template shows 3 variables in Variables column
- [ ] Verify template shows "Termii" in Provider column

**Expected Result**: Template created with status "Pending"

#### 2.2. Edit Pending/Rejected Template
- [ ] Click Edit button on pending template
- [ ] Modify template content: Add exclamation mark at end
- [ ] Click Save
- [ ] Verify success toast: "Template updated successfully"
- [ ] Verify changes reflected in table
- [ ] Create template with status "Approved" (via database or API)
- [ ] Verify Edit button is disabled for approved template

**Expected Result**: Pending templates editable, approved templates read-only

#### 2.3. Delete Template
- [ ] Click Delete button on pending template
- [ ] Verify confirmation dialog appears: "Are you sure you want to delete this template?"
- [ ] Click Cancel, verify template not deleted
- [ ] Click Delete again, then Confirm
- [ ] Verify success toast: "Template deleted successfully"
- [ ] Verify template removed from table
- [ ] Verify Delete button is disabled for approved templates

**Expected Result**: Pending templates deletable with confirmation, approved templates cannot be deleted

#### 2.4. Check Template Approval Status
- [ ] Create new template or use existing pending template
- [ ] Click "Check Status" button
- [ ] Verify loading spinner appears
- [ ] Verify status updates in table (if status changed on provider side)
- [ ] Verify toast message: "Template status updated" or "Status unchanged"

**Expected Result**: Status check fetches latest approval status from database

#### 2.5. Submit Template for Approval
**Note**: This is typically done via Termii dashboard, not in-app

- [ ] Navigate to Termii dashboard (external)
- [ ] Submit template for approval using template name and content
- [ ] Receive Termii template ID from approval
- [ ] Use API or database to manually approve template with termii_template_id
- [ ] Verify template status changes to "Approved" in UI
- [ ] Verify template now shows green badge with "Approved"

**Expected Result**: Approved template becomes available for messaging

---

### 3. Credit Purchase

#### 3.1. Purchase Credits from Wallet (Sufficient Balance)
**Location**: `/salon/settings/messaging` → Credit Balance section OR `/billing`

- [ ] Click "Purchase Credits" button
- [ ] Verify CreditPurchaseDialog opens
- [ ] Verify 4 packages displayed: 50, 100, 250, 500 credits
- [ ] Verify prices shown in tenant currency (NGN or GHS)
- [ ] Verify "Most Popular" badge on 100 credits package
- [ ] Verify price per credit calculated correctly for each package
- [ ] Select 50 credits package
- [ ] Verify package selection highlighted with border
- [ ] Verify "Pay from Wallet" payment method selected by default
- [ ] Verify current wallet balance displayed: "Current balance: [amount]"
- [ ] Ensure wallet has sufficient balance (>= package price)
- [ ] Click "Purchase Credits" button
- [ ] Verify loading state: "Processing..." with spinner
- [ ] Verify success toast: "Credits purchased successfully!"
- [ ] Verify dialog closes automatically
- [ ] Verify credit balance increased by 50 credits
- [ ] Verify wallet balance decreased by package price
- [ ] Verify recent purchases list shows new purchase with:
  - [ ] Credit count: 50
  - [ ] Amount paid
  - [ ] Payment method: "Wallet"
  - [ ] Timestamp

**Expected Result**: Credits purchased successfully, wallet debited, credit balance increased

#### 3.2. Purchase Credits from Wallet (Insufficient Balance)
- [ ] Reduce wallet balance to less than cheapest package price (via database or spending)
- [ ] Open CreditPurchaseDialog
- [ ] Select 50 credits package
- [ ] Select "Pay from Wallet" payment method
- [ ] Verify alert displayed: "Insufficient wallet balance. You need [required] but have [available]."
- [ ] Verify wallet payment option is disabled (grayed out)
- [ ] Verify "Purchase Credits" button is disabled
- [ ] Verify cannot proceed with wallet payment

**Expected Result**: Insufficient balance prevents wallet payment with clear error message

#### 3.3. Purchase Credits via Paystack
- [ ] Open CreditPurchaseDialog
- [ ] Select 100 credits package
- [ ] Select "Pay with Paystack" payment method
- [ ] Click "Purchase Credits" button
- [ ] Verify redirect to Paystack checkout page
- [ ] Complete payment using test card:
  - [ ] Card: 4084084084084081 (Verve)
  - [ ] CVV: 408
  - [ ] Expiry: 01/99
  - [ ] PIN: 0000
  - [ ] OTP: 123456
- [ ] Verify redirect back to application after successful payment
- [ ] Verify success toast or payment confirmation
- [ ] Verify credit balance increased by 100 credits
- [ ] Verify confirmation email received (check inbox for tenant owner email)
- [ ] Email should contain:
  - [ ] Credit count: 100
  - [ ] Amount paid
  - [ ] Payment method: Paystack
  - [ ] Transaction reference
- [ ] Verify recent purchases list shows new purchase with payment method "Paystack"

**Expected Result**: Credits purchased via Paystack successfully, email confirmation sent

---

### 4. Manual Message Sending

#### 4.1. Send Manual Email to Customer
**Location**: Customer detail page → Send Message button OR `/customers` → Customer row → Send Message

- [ ] Navigate to customer detail dialog for a customer with valid email
- [ ] Click "Send Message" button (MessageSquare icon)
- [ ] Verify SendMessageDialog opens with customer pre-filled
- [ ] Select channel: Email (1 credit)
- [ ] Enter subject: "Special Promotion for You"
- [ ] Enter message: "Dear customer, we have a special offer just for you!"
- [ ] Verify credit cost preview: "This will cost 1 credit"
- [ ] Verify current credit balance displayed
- [ ] Verify Send button enabled
- [ ] Click Send button
- [ ] Verify loading state: "Sending..." with spinner
- [ ] Verify success toast: "Message sent successfully"
- [ ] Verify dialog closes
- [ ] Navigate to Messages tab in customer detail dialog
- [ ] Verify new message appears in history with:
  - [ ] Channel: Email icon (blue)
  - [ ] Subject: "Special Promotion for You"
  - [ ] Status: Sent (green badge)
  - [ ] Credits used: 1
  - [ ] Timestamp
- [ ] Click message to expand
- [ ] Verify full message content displayed
- [ ] Verify customer receives email (check inbox)

**Expected Result**: Email sent successfully, 1 credit deducted, message logged

#### 4.2. Send Manual SMS to Customer
- [ ] Open SendMessageDialog for customer with valid phone number
- [ ] Select channel: SMS (2 credits)
- [ ] Verify subject field hidden (SMS doesn't use subject)
- [ ] Enter message: "Your appointment is confirmed for tomorrow at 2 PM."
- [ ] Verify character count hint: "[message length]/160 characters"
- [ ] Verify credit cost preview: "This will cost 2 credits"
- [ ] Click Send button
- [ ] Verify loading state and success toast
- [ ] Verify credit balance decreased by 2 credits
- [ ] Verify message appears in Messages tab with:
  - [ ] Channel: SMS icon (green)
  - [ ] Status: Sent (green badge)
  - [ ] Credits used: 2
  - [ ] Provider: termii_sms
- [ ] Verify customer receives SMS (check phone)

**Expected Result**: SMS sent successfully via Termii, 2 credits deducted

#### 4.3. Send Manual WhatsApp Message to Customer
**Pre-requisite**: At least one approved WhatsApp template exists

- [ ] Open SendMessageDialog for customer with valid phone number
- [ ] Select channel: WhatsApp (2 credits)
- [ ] Verify message textarea hidden (WhatsApp uses templates only)
- [ ] Verify subject field hidden
- [ ] Verify template selector appears
- [ ] If no approved templates exist:
  - [ ] Verify template dropdown is disabled
  - [ ] Verify message: "Create WhatsApp templates first"
  - [ ] Verify Send button disabled
  - [ ] Skip remaining WhatsApp steps until template approved
- [ ] Select approved template from dropdown
- [ ] Verify template variables appear as input fields
- [ ] Enter variable values:
  - [ ] Variable 1: "John Doe"
  - [ ] Variable 2: "March 30, 2026"
  - [ ] Variable 3: "2:00 PM"
- [ ] Verify credit cost preview: "This will cost 2 credits"
- [ ] Ensure Termii device ID configured in settings
- [ ] Click Send button
- [ ] Verify loading state and success toast
- [ ] Verify credit balance decreased by 2 credits
- [ ] Verify message appears in Messages tab with:
  - [ ] Channel: WhatsApp icon (emerald)
  - [ ] Status: Sent (green badge)
  - [ ] Credits used: 2
  - [ ] Provider: termii_whatsapp
  - [ ] Template variables displayed in expanded view
- [ ] Verify customer receives WhatsApp message (check phone)

**Expected Result**: WhatsApp message sent successfully via Termii using approved template, 2 credits deducted

#### 4.4. Send Message with Insufficient Credits
- [ ] Reduce credit balance to 0 (via database or spending all credits)
- [ ] Open SendMessageDialog
- [ ] Select any channel
- [ ] Verify insufficient credits alert appears: "Insufficient credits. Required: X, Available: 0."
- [ ] Verify "Purchase Credits" link visible
- [ ] Click link, verify navigates to /billing or opens CreditPurchaseDialog
- [ ] Verify Send button disabled
- [ ] If ignoring UI validation and calling API directly (via console/Postman):
  - [ ] Verify API returns 400 error: "Insufficient credits"

**Expected Result**: Cannot send message without sufficient credits, clear error message with purchase link

#### 4.5. Send Message to Customer Missing Contact Info
- [ ] Open SendMessageDialog for customer with no email
- [ ] Select channel: Email
- [ ] Verify email channel disabled or shows warning
- [ ] Verify error message: "Customer has no email address"
- [ ] Select channel: SMS
- [ ] Verify SMS channel enabled if customer has phone
- [ ] Repeat test for customer with no phone number
- [ ] Verify SMS and WhatsApp channels disabled
- [ ] Verify error message: "Customer has no phone number"

**Expected Result**: Cannot send message via channel if customer missing required contact info

---

### 5. Bulk Message Sending

#### 5.1. Send Bulk Message to Multiple Customers
**Location**: SendMessageDialog with Multiple Customers mode

- [ ] Open SendMessageDialog (not tied to specific customer)
- [ ] Verify toggle switch: "Single Customer" / "Multiple Customers"
- [ ] Click toggle to switch to "Multiple Customers" mode
- [ ] Verify customer list appears with checkboxes
- [ ] Verify customer list shows: Name, Email icon + address, Phone icon + number
- [ ] Select channel: Email (1 credit each)
- [ ] Verify customers without email are disabled (opacity 50%, no checkbox interaction)
- [ ] Use search field to filter customers by name: Enter "John"
- [ ] Verify only matching customers displayed
- [ ] Clear search, verify all customers displayed again
- [ ] Select 5 customers with valid emails by clicking checkboxes
- [ ] Verify selected count updates: "5 customer(s) selected"
- [ ] Click "Select All" button
- [ ] Verify all eligible customers (with email) are selected
- [ ] Verify ineligible customers (without email) remain unselected
- [ ] Click "Deselect All" button
- [ ] Verify all customers deselected
- [ ] Re-select 5 customers manually
- [ ] Enter subject: "End of Month Sale"
- [ ] Enter message: "Don't miss our amazing discounts this weekend!"
- [ ] Verify credit cost preview: "This will cost 5 credits (1 per customer × 5)"
- [ ] Ensure credit balance >= 5 credits
- [ ] Click Send button
- [ ] Verify progress indicator appears: "0 of 5 sent" with progress bar
- [ ] Verify progress updates in real-time: "1 of 5 sent", "2 of 5 sent", etc.
- [ ] Verify summary toast after completion: "Successfully sent to 5 customers. 5 credits used."
- [ ] Verify dialog closes or shows summary section
- [ ] Verify credit balance decreased by 5 credits
- [ ] Navigate to each customer's Messages tab
- [ ] Verify all 5 customers received the email with:
  - [ ] Same subject and message content
  - [ ] Status: Sent
  - [ ] Credits used: 1
  - [ ] Same timestamp (within seconds)

**Expected Result**: Bulk email sent to 5 customers successfully, 5 credits deducted total

#### 5.2. Send Bulk SMS to Multiple Customers
- [ ] Open SendMessageDialog in Multiple Customers mode
- [ ] Select channel: SMS (2 credits each)
- [ ] Verify customers without phone numbers are disabled
- [ ] Select 3 customers with valid phone numbers
- [ ] Verify selected count: "3 customer(s) selected"
- [ ] Enter message: "Your loyalty rewards are expiring soon!"
- [ ] Verify credit cost preview: "This will cost 6 credits (2 per customer × 3)"
- [ ] Ensure credit balance >= 6 credits
- [ ] Click Send button
- [ ] Verify progress indicator and summary toast
- [ ] Verify credit balance decreased by 6 credits (or actual sent count if partial failure)
- [ ] Verify all 3 customers received SMS (check phones)

**Expected Result**: Bulk SMS sent to 3 customers via Termii, 6 credits deducted

#### 5.3. Bulk Send with Partial Failures
- [ ] Create test scenario with 5 customers:
  - [ ] 3 customers with valid emails
  - [ ] 2 customers with invalid/missing emails (edit in database temporarily)
- [ ] Open SendMessageDialog in Multiple Customers mode
- [ ] Select channel: Email
- [ ] Attempt to select all 5 customers
- [ ] Verify only 3 with valid emails are selectable (2 disabled)
- [ ] If forcing selection via database/API to test failure handling:
  - [ ] Verify partial failure summary: "Successfully sent to 3 customers, 2 failed. 3 credits used."
  - [ ] Verify failed messages section appears with:
    - [ ] Customer names
    - [ ] Error reasons: "Customer email not found" or similar
  - [ ] Verify "Retry Failed" button visible
  - [ ] Click "Retry Failed" button
  - [ ] Verify failed customers repopulated in selection
  - [ ] Fix customer emails and retry
  - [ ] Verify retry succeeds

**Expected Result**: Partial failures handled gracefully with clear error messages and retry option

#### 5.4. Bulk Send with Insufficient Credits
- [ ] Set credit balance to 3 credits (via database)
- [ ] Open SendMessageDialog in Multiple Customers mode
- [ ] Select channel: Email (1 credit each)
- [ ] Select 5 customers
- [ ] Verify credit cost preview: "This will cost 5 credits (1 per customer × 5)"
- [ ] Verify insufficient credits alert: "Insufficient credits. Required: 5, Available: 3."
- [ ] Verify "Purchase Credits" link visible
- [ ] Verify Send button disabled

**Expected Result**: Cannot send bulk message without sufficient credits for all recipients

---

### 6. Message History

#### 6.1. View Message History on Customer Detail Page
**Location**: Customer detail dialog → Messages tab

- [ ] Navigate to customer detail dialog for a customer with sent messages
- [ ] Click "Messages" tab
- [ ] Verify message list displays with newest first (sorted by created_at DESC)
- [ ] Verify each message shows:
  - [ ] Channel icon (Mail/Phone/MessageSquare) with color coding
  - [ ] Message preview (subject or first 100 chars)
  - [ ] Timestamp in readable format (e.g., "Mar 29, 2026 3:45 PM")
  - [ ] Status badge (Sent/Failed/Pending) with color coding
  - [ ] Credits used
- [ ] Click message row to expand
- [ ] Verify expanded view shows:
  - [ ] Full message content
  - [ ] Template variables (if WhatsApp)
  - [ ] Error message (if failed)
  - [ ] Sent at timestamp
  - [ ] Status
- [ ] Click again to collapse
- [ ] Verify message collapses

**Expected Result**: Message history displays all messages with expandable details

#### 6.2. Filter Message History by Channel
- [ ] In Messages tab, verify Filters button visible
- [ ] Click Filters button
- [ ] Verify filter section expands with channel dropdown and date range pickers
- [ ] Select channel filter: "Email"
- [ ] Verify only email messages displayed
- [ ] Verify filter badge indicator shows active filters
- [ ] Change filter to "SMS"
- [ ] Verify only SMS messages displayed
- [ ] Select "All" channel
- [ ] Verify all messages displayed again

**Expected Result**: Channel filter works correctly

#### 6.3. Filter Message History by Date Range
- [ ] In Filters section, click "From Date" picker
- [ ] Select date 7 days ago
- [ ] Click "To Date" picker
- [ ] Select today's date
- [ ] Verify only messages within date range displayed
- [ ] Verify filter badge indicates active filters
- [ ] Set invalid range: From Date = today, To Date = yesterday
- [ ] Verify error message or validation prevents invalid range
- [ ] Click "Clear Filters" button
- [ ] Verify all filters cleared
- [ ] Verify all messages displayed
- [ ] Verify filter badge disappears

**Expected Result**: Date range filter works correctly with validation

#### 6.4. Empty State
- [ ] Navigate to customer with no messages sent
- [ ] Click Messages tab
- [ ] Verify empty state displayed:
  - [ ] MessageSquare icon
  - [ ] Message: "No messages sent yet"
- [ ] Apply filters that match no messages
- [ ] Verify empty state adapts: "No messages match your filters"

**Expected Result**: Empty state displayed appropriately

---

### 7. Reactivation Campaign with Termii WhatsApp

#### 7.1. Create Reactivation Campaign with Termii WhatsApp
**Location**: `/campaigns` or relevant campaign management page

**Pre-requisite**: Approved WhatsApp template exists with appropriate variables

- [ ] Navigate to campaign creation page
- [ ] Create new reactivation campaign with:
  - [ ] Campaign name: "Test Termii WhatsApp Campaign"
  - [ ] Channel: WhatsApp
  - [ ] WhatsApp Provider: Termii (not Meta)
  - [ ] Select approved template
  - [ ] Configure template variables with campaign-specific values or placeholders
  - [ ] Set target audience (e.g., customers inactive for 30 days)
- [ ] Verify campaign saves with whatsapp_provider='termii'
- [ ] Verify termii_template_id stored
- [ ] Trigger campaign execution
- [ ] Verify messages sent via Termii WhatsApp API (check message_logs.provider='termii_whatsapp')
- [ ] Verify credits deducted: 2 credits per recipient
- [ ] Verify message_logs entries have initiated_by='salon'
- [ ] Verify recipients receive WhatsApp messages (check phones)

**Expected Result**: Campaign uses Termii WhatsApp provider, credits deducted correctly

#### 7.2. Reactivation Campaign with Meta WhatsApp (Backward Compatibility)
- [ ] Create campaign with WhatsApp Provider: Meta (or NULL for existing campaigns)
- [ ] Verify campaign uses existing Meta WhatsApp API
- [ ] Verify messages sent successfully
- [ ] Verify message_logs.provider='meta_whatsapp'
- [ ] Verify credits deducted: 2 credits per recipient
- [ ] Verify backward compatibility maintained

**Expected Result**: Existing Meta WhatsApp campaigns continue to work

---

### 8. System Messages (Credit-Free)

#### 8.1. Verify System Messages Don't Consume Credits
**Channels**: Appointment notifications, invoices, staff invitations, password resets, email verifications

##### 8.1.1. Appointment Notification
- [ ] Create or reschedule an appointment
- [ ] Verify appointment confirmation email sent to customer
- [ ] Check message_logs for appointment notification entry:
  - [ ] Verify provider='resend'
  - [ ] Verify initiated_by='system'
  - [ ] Verify credits_used=0
- [ ] Verify credit balance unchanged after system email

**Expected Result**: Appointment notification sent without consuming credits

##### 8.1.2. Invoice Email
- [ ] Generate and send an invoice to a customer
- [ ] Verify invoice email sent
- [ ] Check message_logs:
  - [ ] Verify initiated_by='system'
  - [ ] Verify credits_used=0
- [ ] Verify credit balance unchanged

**Expected Result**: Invoice email sent without consuming credits

##### 8.1.3. Staff Invitation
- [ ] Invite new staff member via admin panel
- [ ] Verify invitation email sent
- [ ] Check message_logs:
  - [ ] Verify initiated_by='system'
  - [ ] Verify credits_used=0
- [ ] Verify credit balance unchanged

**Expected Result**: Staff invitation sent without consuming credits

##### 8.1.4. Password Reset
- [ ] Request password reset for a user
- [ ] Verify password reset email sent
- [ ] Check message_logs:
  - [ ] Verify initiated_by='system'
  - [ ] Verify credits_used=0
- [ ] Verify credit balance unchanged

**Expected Result**: Password reset email sent without consuming credits

##### 8.1.5. Email Verification
- [ ] Trigger email verification for new user
- [ ] Verify verification email sent
- [ ] Check message_logs:
  - [ ] Verify initiated_by='system'
  - [ ] Verify credits_used=0
- [ ] Verify credit balance unchanged

**Expected Result**: Email verification sent without consuming credits

---

### 9. Salon-Initiated Messages (Credit-Consuming)

#### 9.1. Verify Salon-Initiated Messages Consume Credits Correctly
**Channels**: Manual messages, reactivation campaigns, bulk messages

- [ ] Send manual email (1 credit)
- [ ] Check message_logs:
  - [ ] Verify initiated_by='salon'
  - [ ] Verify credits_used=1
- [ ] Verify credit balance decreased by 1
- [ ] Send manual SMS (2 credits)
- [ ] Verify credits_used=2, balance decreased by 2
- [ ] Send manual WhatsApp (2 credits)
- [ ] Verify credits_used=2, balance decreased by 2
- [ ] Send bulk message to 3 customers via email (3 credits total)
- [ ] Verify each message_logs entry has credits_used=1, initiated_by='salon'
- [ ] Verify total balance decreased by 3
- [ ] Execute reactivation campaign with 5 recipients via SMS (10 credits total)
- [ ] Verify each message_logs entry has credits_used=2, initiated_by='salon'
- [ ] Verify total balance decreased by 10

**Expected Result**: All salon-initiated messages consume credits correctly

---

### 10. Edge Cases and Error Handling

#### 10.1. Missing Termii Configuration
- [ ] Clear Termii device ID in settings (set to NULL in database)
- [ ] Attempt to send WhatsApp message
- [ ] Verify error message: "Termii device ID not configured. Please configure in settings."
- [ ] Verify Send button disabled or error toast displayed
- [ ] Configure device ID in settings
- [ ] Retry sending WhatsApp message
- [ ] Verify success

**Expected Result**: Clear error message when Termii not configured

#### 10.2. Unapproved WhatsApp Template
- [ ] Attempt to send WhatsApp message with pending template (via API or database manipulation)
- [ ] Verify error message: "Template not approved. Please wait for approval or contact support."
- [ ] Verify message status updated to 'failed' with error message
- [ ] Verify credits not deducted

**Expected Result**: Cannot send WhatsApp message with unapproved template

#### 10.3. Invalid Phone Number Format
- [ ] Update customer phone number to invalid format (e.g., "12345")
- [ ] Attempt to send SMS
- [ ] Verify error message indicates invalid phone format
- [ ] Verify message status 'failed'
- [ ] Verify credits not deducted
- [ ] Update phone to valid international format (e.g., 2347880234567)
- [ ] Retry sending SMS
- [ ] Verify success

**Expected Result**: Invalid phone numbers rejected with clear error

#### 10.4. API Rate Limiting (429 Response)
**Note**: May require high-volume testing or API simulation

- [ ] Send many messages rapidly to trigger Termii rate limit (if applicable)
- [ ] Verify error handling for 429 status code
- [ ] Verify error message: "Rate limit exceeded. Please try again later."
- [ ] Verify message status 'failed'
- [ ] Verify credits not deducted for failed messages
- [ ] Wait and retry after rate limit window
- [ ] Verify success

**Expected Result**: Rate limit errors handled gracefully

#### 10.5. Provider API Downtime (500/502/503)
**Note**: Requires API simulation or testing during maintenance window

- [ ] Simulate Termii API returning 500/502/503 error
- [ ] Attempt to send message
- [ ] Verify error message: "Provider error. Please try again later."
- [ ] Verify message status 'failed' with error details
- [ ] Verify credits not deducted
- [ ] When API recovers, retry sending
- [ ] Verify success

**Expected Result**: Provider errors handled gracefully without credit loss

#### 10.6. Long Message Content
- [ ] Compose SMS with 200 characters (exceeds 160 plain limit)
- [ ] Attempt to send
- [ ] Verify validation error or warning about character limit
- [ ] If sent, verify message truncated or split appropriately
- [ ] Compose SMS with unicode characters (emojis) exceeding 70 char limit
- [ ] Verify validation error or warning about unicode character limit

**Expected Result**: Long messages handled with validation or truncation

#### 10.7. Concurrent Credit Purchases
**Note**: Requires testing with multiple sessions or API calls

- [ ] Open two browser tabs with same tenant
- [ ] Initiate credit purchase in Tab 1
- [ ] Immediately initiate same package purchase in Tab 2
- [ ] Verify idempotency: Only one purchase completes or both complete with separate transactions
- [ ] Verify wallet balance decreased correctly (once or twice as appropriate)
- [ ] Verify credit balance increased correctly

**Expected Result**: Concurrent purchases handled correctly with idempotency

---

## Regression Testing

### 11. Verify Existing Functionality Unchanged

#### 11.1. Customer Management
- [ ] Create new customer
- [ ] Edit customer details
- [ ] Delete customer
- [ ] Verify all operations work as before

#### 11.2. Appointment Management
- [ ] Create appointment
- [ ] Reschedule appointment
- [ ] Cancel appointment
- [ ] Complete appointment
- [ ] Verify appointment notifications sent (system messages, credit-free)

#### 11.3. Invoice Management
- [ ] Generate invoice
- [ ] Send invoice email
- [ ] Verify invoice email sent as system message (credit-free)

#### 11.4. Staff Management
- [ ] Invite staff member
- [ ] Verify invitation email sent as system message (credit-free)

#### 11.5. Salon Wallet
- [ ] Fund wallet via Paystack
- [ ] Verify wallet balance increases
- [ ] Use wallet for credit purchase
- [ ] Verify wallet ledger entries correct

---

## Performance Testing

### 12. Performance Benchmarks

#### 12.1. Bulk Message Performance
- [ ] Send bulk message to 50 customers via email
- [ ] Measure time to completion
- [ ] Verify all messages sent successfully
- [ ] Verify no timeouts or errors
- [ ] Send bulk SMS to 100 customers (max Termii batch size)
- [ ] Verify batching handled correctly
- [ ] Measure time to completion

**Expected Result**: Bulk operations complete within reasonable time (< 60 seconds for 100 recipients)

#### 12.2. Template List Performance
- [ ] Create 50+ WhatsApp templates
- [ ] Navigate to Messaging Settings page
- [ ] Verify template list loads within 2 seconds
- [ ] Apply filters by status and provider
- [ ] Verify filtering responsive (< 1 second)

**Expected Result**: Template management remains responsive with large datasets

#### 12.3. Message History Performance
- [ ] Generate 100+ messages for a single customer
- [ ] Open customer Messages tab
- [ ] Verify messages load within 3 seconds
- [ ] Scroll through message list
- [ ] Verify smooth scrolling (no lag)
- [ ] Apply date range filter
- [ ] Verify filtering responsive

**Expected Result**: Message history remains performant with large message counts

---

## Security Testing

### 13. Security Checks

#### 13.1. Tenant Isolation
- [ ] Create two test tenants with separate data
- [ ] Authenticate as Tenant A user
- [ ] Attempt to access Tenant B's messaging settings via URL manipulation or API
- [ ] Verify 403 Forbidden or data not visible
- [ ] Attempt to send message to Tenant B customer
- [ ] Verify error or permission denied
- [ ] Verify message_logs and manual_messages filtered by tenant_id

**Expected Result**: Complete tenant isolation enforced

#### 13.2. Role-Based Access Control
- [ ] Authenticate as staff user (not owner)
- [ ] Verify cannot access admin-only features (if any)
- [ ] Verify can send messages (if permitted by role)
- [ ] Authenticate as owner
- [ ] Verify can access all messaging features
- [ ] Verify can configure Termii settings

**Expected Result**: Role-based permissions enforced correctly

#### 13.3. API Authentication
- [ ] Call send-manual-message edge function without JWT token
- [ ] Verify 401 Unauthorized response
- [ ] Call with invalid/expired JWT token
- [ ] Verify 401 Unauthorized response
- [ ] Call with valid JWT but wrong tenant
- [ ] Verify 403 Forbidden response

**Expected Result**: All API endpoints require valid authentication

#### 13.4. Input Validation
- [ ] Attempt to create template with SQL injection in template_name: `"; DROP TABLE tenants; --`
- [ ] Verify input sanitized and rejected or escaped
- [ ] Attempt to send message with XSS in message content: `<script>alert('XSS')</script>`
- [ ] Verify input sanitized before storing/sending
- [ ] Attempt to create manual_message with invalid channel: "invalid_channel"
- [ ] Verify 400 Bad Request with validation error

**Expected Result**: All inputs validated and sanitized

---

## Post-Deployment Verification

### 14. Production Readiness Checklist

#### 14.1. Environment Variables
- [ ] Verify TERMII_API_KEY set in production Supabase Edge Functions
- [ ] Verify RESEND_API_KEY set in production
- [ ] Verify all environment variables match expected format

#### 14.2. Database Migrations
- [ ] Verify all migrations deployed to production database
- [ ] Verify tenants table has termii_device_id and termii_sender_id columns
- [ ] Verify message_logs table has provider, initiated_by, termii_message_id columns
- [ ] Verify whatsapp_templates table exists with all columns and indexes
- [ ] Verify manual_messages table exists with all columns and indexes
- [ ] Verify customer_reactivation_campaigns table has whatsapp_provider, termii_template_id, termii_device_id columns

#### 14.3. Edge Functions
- [ ] Verify send-manual-message function deployed and active
- [ ] Verify send-bulk-message function deployed and active
- [ ] Verify manage-whatsapp-templates function deployed and active
- [ ] Verify purchase-credits-from-purse function deployed and active
- [ ] Verify send-reactivation-campaign function updated and deployed
- [ ] Verify system message functions updated and deployed

#### 14.4. Frontend Build
- [ ] Verify salon-admin app builds without errors: `pnpm build`
- [ ] Verify no TypeScript errors: Check build output
- [ ] Verify no critical lint errors: `pnpm lint`
- [ ] Verify MessagingSettingsPage route accessible at `/salon/settings/messaging`
- [ ] Verify all new components render correctly in production build

#### 14.5. Documentation
- [ ] Verify AGENTS.md updated with Termii integration patterns (if applicable)
- [ ] Verify README or docs updated with messaging feature overview
- [ ] Verify QA checklist (this document) available in tasks/ directory

---

## Sign-Off

### Test Execution Summary

**Tested By**: _________________________  
**Date**: _________________________  
**Environment**: [ ] Staging [ ] Production  

**Test Results**:
- [ ] All critical tests passed
- [ ] All high-priority tests passed
- [ ] Known issues documented below

**Known Issues**:
1. _______________________________________________________________
2. _______________________________________________________________
3. _______________________________________________________________

**Approval for Release**:
- [ ] QA Engineer: _________________________ Date: _____________
- [ ] Product Owner: _________________________ Date: _____________
- [ ] Engineering Lead: _________________________ Date: _____________

---

## Notes and Observations

_Use this section to document any additional findings, observations, or recommendations during testing._

---

**End of Checklist**
