# PRD: Message API - Termii Integration

**Feature Name:** Message API Implementation with Termii WhatsApp and SMS Integration  
**Created:** 2026-03-29  
**Status:** Draft  
**Owner:** Development Team  

---

## 1. Introduction/Overview

This feature enhances the salon management platform's messaging infrastructure by integrating Termii's WhatsApp and SMS APIs, enabling salons to send messages directly to customers through multiple channels. The feature includes credit-based billing where salons can purchase messaging credits from their wallets or via Paystack, with seamless credit burn implementation for all salon-initiated messages.

**Current State:**
- Email messaging via Resend (fully operational)
- Basic Termii SMS integration (reactivation campaigns only)
- Meta WhatsApp integration (reactivation campaigns only)
- Credit system exists with wallet and Paystack purchase options
- 30 free monthly credits per tenant

**Target State:**
- Full Termii WhatsApp template-based messaging (alongside Meta for system messages)
- Enhanced Termii SMS messaging
- Manual one-off messages to customers via email, SMS, WhatsApp
- Bulk message sending to multiple customers
- WhatsApp template management with approval tracking
- Proper credit burn distinction (system messages free, salon-initiated paid)

---

## 2. Goals

1. **Enable Multi-Channel Customer Communication:** Allow salons to send messages to customers via email, SMS, and WhatsApp from a single interface
2. **Monetize Messaging:** Generate revenue through credit purchases while providing 30 free monthly credits
3. **Simplify WhatsApp Messaging:** Provide template-based WhatsApp messaging through Termii's approved workflow
4. **Improve Customer Engagement:** Enable salons to send personalized messages, promotions, and follow-ups
5. **Maintain Cost Transparency:** Clear credit costs displayed before sending messages

---

## 3. User Stories

### Epic 1: Database & Schema

#### US-001: Add Termii Configuration Fields
**As a** system administrator  
**I want** Termii configuration stored at the tenant level  
**So that** each salon can have their own Termii device ID and sender ID  

**Acceptance Criteria:**
- [ ] `tenants` table has `termii_device_id` TEXT column
- [ ] `tenants` table has `termii_sender_id` TEXT column with default 'SalonMagik'
- [ ] Migration runs successfully on existing database
- [ ] Existing tenants get default sender ID value

**Technical Notes:**
- Migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_termii_messaging_support.sql`

---

#### US-002: Extend Message Logs for Provider Tracking
**As a** developer  
**I want** to track which provider sent each message  
**So that** we can debug issues and analyze provider performance  

**Acceptance Criteria:**
- [ ] `message_logs` table has `provider` TEXT column with CHECK constraint ('resend', 'termii_sms', 'termii_whatsapp', 'meta_whatsapp')
- [ ] `message_logs` table has `termii_message_id` TEXT column
- [ ] `message_logs` table has `termii_device_id` TEXT column
- [ ] `message_logs` table has `initiated_by` TEXT column with CHECK constraint ('system', 'salon')
- [ ] All new inserts include provider value
- [ ] Existing rows can be NULL for backward compatibility

---

#### US-003: Create WhatsApp Templates Table
**As a** salon owner  
**I want** my WhatsApp templates stored in the system  
**So that** I can manage and track template approvals  

**Acceptance Criteria:**
- [ ] `whatsapp_templates` table created with columns:
  - id (UUID, primary key)
  - tenant_id (UUID, foreign key)
  - template_name (TEXT, not null)
  - template_id (TEXT, Termii template ID)
  - template_content (JSONB, template structure)
  - variables (JSONB, dynamic variables)
  - status (TEXT, enum: pending/approved/rejected)
  - provider (TEXT, enum: termii/meta)
  - created_at, updated_at (TIMESTAMPTZ)
- [ ] UNIQUE constraint on (tenant_id, template_name)
- [ ] Index on tenant_id for performance
- [ ] RLS policies allow tenants to CRUD their own templates

---

#### US-004: Create Manual Messages Table
**As a** salon staff member  
**I want** to track all manual messages I send to customers  
**So that** I can see message history and status  

**Acceptance Criteria:**
- [ ] `manual_messages` table created with columns:
  - id (UUID, primary key)
  - tenant_id (UUID, foreign key)
  - customer_id (UUID, foreign key)
  - channel (TEXT, enum: email/sms/whatsapp)
  - subject (TEXT, nullable for email)
  - message (TEXT, not null)
  - template_id (UUID, nullable, foreign key to whatsapp_templates)
  - template_variables (JSONB, nullable)
  - status (TEXT, enum: pending/sent/failed)
  - sent_by_user_id (UUID, foreign key to auth.users)
  - sent_at (TIMESTAMPTZ, nullable)
  - error_message (TEXT, nullable)
  - credits_used (INTEGER, nullable)
  - created_at, updated_at (TIMESTAMPTZ)
- [ ] Indexes on tenant_id, customer_id, status
- [ ] RLS policies allow staff to create/read for their tenant
- [ ] Foreign key constraints properly cascade

---

### Epic 2: Backend - Termii Integration

#### US-005: Create Termii Client Helper Module
**As a** developer  
**I want** a reusable Termii API client  
**So that** all edge functions can send messages consistently  

**Acceptance Criteria:**
- [ ] File created at `supabase/functions/_shared/termii-client.ts`
- [ ] `sendTermiiSMS()` function accepts apiKey, to, from, message, channel
- [ ] `sendTermiiWhatsApp()` function accepts apiKey, phoneNumber, deviceId, templateId, data, optional media
- [ ] Functions throw descriptive errors on API failures
- [ ] Response includes Termii message_id for tracking
- [ ] TypeScript interfaces exported: `TermiiSMSRequest`, `TermiiWhatsAppRequest`
- [ ] Unit tests verify error handling and request formatting

**Technical Notes:**
- SMS endpoint: `https://api.ng.termii.com/api/sms/send`
- WhatsApp endpoint: `https://api.ng.termii.com/api/send/template`
- WhatsApp with media: `https://api.ng.termii.com/api/send/template/media`

---

#### US-006: Create Send Manual Message Edge Function
**As a** salon staff member  
**I want** to send a manual message to a customer  
**So that** I can communicate important information or promotions  

**Acceptance Criteria:**
- [ ] Function created at `supabase/functions/send-manual-message/index.ts`
- [ ] Accepts `messageId` (UUID) in request body
- [ ] Verifies user has permission for tenant
- [ ] Fetches message from `manual_messages` table with joins to customer and tenant
- [ ] Checks credit balance before sending
- [ ] Returns 400 error if insufficient credits
- [ ] Sends email via Resend if channel='email'
- [ ] Sends SMS via Termii if channel='sms'
- [ ] Sends WhatsApp via Termii if channel='whatsapp'
- [ ] Deducts credits from `communication_credits`
- [ ] Inserts row into `message_logs` with provider and termii_message_id
- [ ] Updates `manual_messages` status to 'sent' and sets sent_at
- [ ] On failure, updates status to 'failed' with error_message
- [ ] Returns success response with credits_used
- [ ] CORS headers properly configured
- [ ] Auth required via JWT

---

#### US-007: Update Reactivation Campaign for Termii WhatsApp
**As a** salon owner  
**I want** to use Termii WhatsApp templates for campaigns  
**So that** I have an alternative to Meta WhatsApp  

**Acceptance Criteria:**
- [ ] `customer_reactivation_campaigns` table has `whatsapp_provider` TEXT column (enum: 'meta'/'termii')
- [ ] `customer_reactivation_campaigns` table has `termii_template_id` TEXT column
- [ ] `customer_reactivation_campaigns` table has `termii_device_id` TEXT column
- [ ] `send-reactivation-campaign/index.ts` checks whatsapp_provider field
- [ ] If provider='termii', uses `sendTermiiWhatsApp()` with template
- [ ] If provider='meta', uses existing Meta API
- [ ] Template variables populated from campaign.template_json
- [ ] Credits deducted properly (2 credits for WhatsApp)
- [ ] `message_logs` includes correct provider value
- [ ] Existing campaigns default to 'meta' for backward compatibility

---

#### US-008: Create WhatsApp Template Management Function
**As a** salon owner  
**I want** to manage WhatsApp templates via API  
**So that** I can create and track template approvals  

**Acceptance Criteria:**
- [ ] Function created at `supabase/functions/manage-whatsapp-templates/index.ts`
- [ ] Supports POST /create: Creates new template record with status='pending'
- [ ] Supports GET /list: Returns all templates for tenant
- [ ] Supports PUT /update/:id: Updates template (only if status='pending' or 'rejected')
- [ ] Supports DELETE /:id: Soft deletes template
- [ ] Supports GET /status/:id: Fetches template approval status from Termii API (if applicable)
- [ ] Validates template_name uniqueness per tenant
- [ ] Validates template_content structure (must be valid JSONB)
- [ ] Requires authentication via JWT
- [ ] Returns 403 if user not authorized for tenant
- [ ] Logs all operations in audit_logs table

---

#### US-009: Update System Message Functions to Skip Credits
**As a** system  
**I want** system-generated messages to not consume credits  
**So that** salons are only charged for messages they actively send  

**Acceptance Criteria:**
- [ ] `send-appointment-notification/index.ts` sets initiated_by='system', credits_used=0
- [ ] `send-invoice/index.ts` sets initiated_by='system', credits_used=0 (first send only)
- [ ] `send-staff-invitation/index.ts` sets initiated_by='system', credits_used=0
- [ ] `send-password-reset/index.ts` sets initiated_by='system', credits_used=0
- [ ] `send-email-verification/index.ts` sets initiated_by='system', credits_used=0
- [ ] Functions do NOT deduct from `communication_credits.balance`
- [ ] `message_logs` entries clearly marked as system-initiated
- [ ] Existing reactivation campaigns marked as initiated_by='salon', credits_used=2 (or 1 for email)

---

### Epic 3: Frontend - Manual Messaging UI

#### US-010: Create Send Message Dialog Component
**As a** salon staff member  
**I want** a dialog to compose and send messages  
**So that** I can easily communicate with customers  

**Acceptance Criteria:**
- [ ] Component created at `apps/salon-admin/src/components/messaging/SendMessageDialog.tsx`
- [ ] Props: `open`, `onOpenChange`, `customerId` (optional)
- [ ] Channel selection: Radio buttons for Email, SMS, WhatsApp
- [ ] Customer selection: Searchable dropdown (if customerId not provided)
- [ ] Subject field shown only for email channel
- [ ] Message textarea for email and SMS
- [ ] WhatsApp template selector for WhatsApp channel
- [ ] Template variable inputs shown dynamically based on selected template
- [ ] Credit cost preview displayed: "This will cost X credits"
- [ ] Shows current credit balance
- [ ] Disables send button if insufficient credits
- [ ] "Purchase Credits" link navigates to billing page
- [ ] Send button calls `supabase.functions.invoke('send-manual-message')`
- [ ] Shows loading state while sending
- [ ] Displays success toast on send
- [ ] Displays error toast on failure
- [ ] Closes dialog on success

---

#### US-011: Create useManualMessages Hook
**As a** developer  
**I want** a React hook for manual messages  
**So that** components can fetch and send messages easily  

**Acceptance Criteria:**
- [ ] Hook created at `apps/salon-admin/src/hooks/useManualMessages.ts`
- [ ] Accepts options: `customerId` (optional), `tenantId` (required)
- [ ] Returns: `messages`, `isLoading`, `error`, `sendMessage`, `refetch`
- [ ] `sendMessage()` creates manual_messages record then invokes send-manual-message function
- [ ] Uses React Query for caching and auto-refresh
- [ ] Filters by customerId if provided
- [ ] Sorts messages by created_at DESC
- [ ] Handles authentication errors gracefully

---

#### US-012: Create Message History Component
**As a** salon staff member  
**I want** to see all messages sent to a customer  
**So that** I can track communication history  

**Acceptance Criteria:**
- [ ] Component created at `apps/salon-admin/src/components/messaging/MessageHistory.tsx`
- [ ] Props: `customerId` (required)
- [ ] Fetches from `manual_messages` and `message_logs` tables
- [ ] Displays in timeline/list format with newest first
- [ ] Shows: channel icon, message preview, timestamp, status badge
- [ ] Status badges: Sent (green), Failed (red), Pending (yellow)
- [ ] Click message to expand full content
- [ ] Shows credits used per message
- [ ] Filter by channel (All, Email, SMS, WhatsApp)
- [ ] Filter by date range
- [ ] Empty state: "No messages sent yet"
- [ ] Loading skeleton while fetching

---

#### US-013: Update Customer Detail Page with Send Message Button
**As a** salon staff member  
**I want** a quick action to message a customer from their detail page  
**So that** I can communicate without navigating away  

**Acceptance Criteria:**
- [ ] File updated: `apps/salon-admin/src/pages/Customers/CustomerDetail.tsx`
- [ ] "Send Message" button added to page header actions
- [ ] Button opens `SendMessageDialog` with customerId pre-filled
- [ ] Button shows message icon (MessageSquare from lucide-react)
- [ ] Button disabled if customer has no email AND no phone
- [ ] Tooltip on hover: "Send Email, SMS, or WhatsApp"
- [ ] After sending, MessageHistory component auto-refreshes

---

### Epic 4: Frontend - WhatsApp Template Management

#### US-014: Create WhatsApp Template Manager Component
**As a** salon owner  
**I want** to manage my WhatsApp templates  
**So that** I can create and track template approvals  

**Acceptance Criteria:**
- [ ] Component created at `apps/salon-admin/src/components/messaging/WhatsAppTemplateManager.tsx`
- [ ] Lists all templates in table format
- [ ] Columns: Name, Status, Variables, Provider, Created, Actions
- [ ] Status badges: Pending (yellow), Approved (green), Rejected (red)
- [ ] "Create Template" button opens dialog
- [ ] Create dialog has: Name, Content (textarea), Variables (dynamic inputs), Provider selector
- [ ] Template content uses placeholder syntax: `{{1}}`, `{{2}}` for variables
- [ ] Variables field is JSON array of variable names
- [ ] Edit button (only for pending/rejected templates)
- [ ] Delete button with confirmation modal
- [ ] "Check Status" action fetches latest approval status from Termii
- [ ] Empty state: "No templates yet. Create your first template."
- [ ] Loading state while fetching templates

---

#### US-015: Create useWhatsAppTemplates Hook
**As a** developer  
**I want** a React hook for WhatsApp templates  
**So that** components can manage templates easily  

**Acceptance Criteria:**
- [ ] Hook created at `apps/salon-admin/src/hooks/useWhatsAppTemplates.ts`
- [ ] Accepts `tenantId` (required)
- [ ] Returns: `templates`, `isLoading`, `error`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `checkStatus`, `refetch`
- [ ] `createTemplate()` calls manage-whatsapp-templates function with POST
- [ ] `updateTemplate()` calls function with PUT
- [ ] `deleteTemplate()` calls function with DELETE
- [ ] `checkStatus()` fetches approval status from Termii API
- [ ] Uses React Query for caching
- [ ] Filters templates by provider if specified
- [ ] Handles validation errors from API

---

#### US-016: Create Messaging Settings Page
**As a** salon owner  
**I want** a settings page for messaging configuration  
**So that** I can configure Termii and manage templates  

**Acceptance Criteria:**
- [ ] Page created at `apps/salon-admin/src/pages/MessagingSettings.tsx`
- [ ] Route: `/settings/messaging`
- [ ] Section 1: Termii Configuration
  - Device ID input (for WhatsApp)
  - Sender ID input (for SMS, alphanumeric 3-11 chars)
  - Save button updates tenant record
  - Link to Termii documentation for obtaining device ID
- [ ] Section 2: WhatsApp Templates
  - Embeds `WhatsAppTemplateManager` component
- [ ] Section 3: Credit Balance & History
  - Shows current credit balance (large number)
  - "Purchase Credits" button opens CreditPurchaseDialog
  - Shows recent credit purchases in table (last 10)
  - Shows recent credit usage (last 20 messages with credits_used)
- [ ] Breadcrumb: Settings > Messaging
- [ ] Only accessible by salon owner or admin roles

---

### Epic 5: Frontend - Bulk Messaging

#### US-017: Add Bulk Customer Selection to Send Message Dialog
**As a** salon staff member  
**I want** to select multiple customers to send the same message  
**So that** I can efficiently send promotions or announcements  

**Acceptance Criteria:**
- [ ] `SendMessageDialog` component updated
- [ ] Toggle switch: "Single Customer" / "Multiple Customers"
- [ ] In multiple mode, shows customer list with checkboxes
- [ ] Search/filter customers by name, email, phone
- [ ] Select all / Deselect all buttons
- [ ] Shows selected count: "X customers selected"
- [ ] Credit cost preview multiplies by customer count: "This will cost X credits (Y per customer)"
- [ ] Warns if credit balance insufficient for all recipients
- [ ] Send button creates separate manual_messages record for each customer
- [ ] Progress indicator while sending (X of Y sent)
- [ ] Summary toast: "Successfully sent to X customers, Y failed"
- [ ] Failed messages listed with customer names and error reasons
- [ ] Option to retry failed messages

---

#### US-018: Create Bulk Message Sending Function
**As a** developer  
**I want** a function to send messages to multiple customers  
**So that** bulk operations are efficient and atomic  

**Acceptance Criteria:**
- [ ] Function created at `supabase/functions/send-bulk-message/index.ts`
- [ ] Accepts: `customerIds` (UUID[]), `channel`, `message`, `subject` (optional), `templateId` (optional), `templateVariables` (optional)
- [ ] Validates all customerIds exist and belong to tenant
- [ ] Calculates total credits required: customerIds.length * CREDIT_COST[channel]
- [ ] Checks credit balance before processing
- [ ] Returns 400 if insufficient credits
- [ ] Creates manual_messages record for each customer with status='pending'
- [ ] Processes messages in batches of 10 (to avoid timeouts)
- [ ] For each message, calls appropriate send function (email/SMS/WhatsApp)
- [ ] Updates status to 'sent' or 'failed' individually
- [ ] Deducts credits only for successfully sent messages
- [ ] Returns summary: `{ sent: number, failed: number, creditsUsed: number, failedMessages: { customerId, error }[] }`
- [ ] Logs bulk operation in audit_logs

---

### Epic 6: Payment Integration (Already Exists - Verification)

#### US-019: Verify Credit Purchase from Wallet
**As a** salon owner  
**I want** to purchase credits using my salon wallet balance  
**So that** I don't need to use a card each time  

**Acceptance Criteria:**
- [ ] Function verified at `supabase/functions/purchase-credits-from-purse/index.ts`
- [ ] Accepts `tenantId`, `packageId` (pack_50, pack_100, pack_250, pack_500)
- [ ] Validates wallet has sufficient balance
- [ ] Creates `messaging_credit_purchases` record with paid_via='salon_purse'
- [ ] Calls `debit_salon_purse` RPC with entry_type='salon_purse_debit_credit_purchase'
- [ ] Increments `communication_credits.balance`
- [ ] Returns new credit balance
- [ ] Transaction is atomic (if any step fails, entire purchase rolls back)

**Testing:**
- [ ] Test purchase with sufficient wallet balance
- [ ] Test purchase with insufficient balance (should fail)
- [ ] Verify wallet balance decreases correctly
- [ ] Verify credit balance increases correctly

---

#### US-020: Verify Credit Purchase via Paystack
**As a** salon owner  
**I want** to purchase credits using Paystack  
**So that** I can use card or bank transfer when wallet is empty  

**Acceptance Criteria:**
- [ ] `create-payment-session/index.ts` handles intentType='messaging_credit_purchase'
- [ ] Accepts: `tenantId`, `amount`, `currency`, `credits`
- [ ] Creates payment_intent with intent_type='messaging_credit_purchase'
- [ ] Metadata includes credits value
- [ ] Redirects to Paystack checkout
- [ ] `payment-webhook/index.ts` handles successful payment
- [ ] On success, creates `messaging_credit_purchases` record with paid_via='paystack'
- [ ] Increments `communication_credits.balance` by credits amount
- [ ] Sends confirmation email via Resend

**Testing:**
- [ ] Test purchase with NGN currency
- [ ] Test purchase with GHS currency
- [ ] Test webhook handling for successful payment
- [ ] Test webhook handling for failed payment
- [ ] Verify credit balance increases after payment
- [ ] Verify confirmation email sent

---

#### US-021: Verify CreditPurchaseDialog UI
**As a** salon owner  
**I want** a seamless UI to purchase credits  
**So that** I can easily add credits when needed  

**Acceptance Criteria:**
- [ ] Component verified at `apps/salon-admin/src/components/billing/CreditPurchaseDialog.tsx`
- [ ] Shows 4 packages: 50, 100, 250, 500 credits
- [ ] Displays price in tenant's currency (NGN or GHS)
- [ ] Shows price per credit
- [ ] "Most Popular" badge on pack_100
- [ ] Payment method selection: Wallet or Paystack
- [ ] Shows current wallet balance
- [ ] Disables wallet option if balance insufficient
- [ ] Alert shown if balance insufficient
- [ ] Purchase button calls appropriate function based on payment method
- [ ] Redirects to Paystack if paystack selected
- [ ] Closes dialog and shows success toast if wallet selected

**Testing:**
- [ ] Test purchasing with wallet (sufficient balance)
- [ ] Test purchasing with wallet (insufficient balance)
- [ ] Test purchasing with Paystack
- [ ] Test dialog opening/closing
- [ ] Test toast notifications

---

### Epic 7: Testing & Validation

#### US-022: Create Integration Tests for Message Sending
**As a** QA engineer  
**I want** automated tests for message sending  
**So that** we can verify the full flow works  

**Acceptance Criteria:**
- [ ] Test file created: `supabase/functions/send-manual-message/index.test.ts`
- [ ] Test: Send email message successfully
- [ ] Test: Send SMS message successfully
- [ ] Test: Send WhatsApp message successfully
- [ ] Test: Fail when insufficient credits
- [ ] Test: Fail when customer not found
- [ ] Test: Fail when invalid channel
- [ ] Test: Credits deducted correctly
- [ ] Test: message_logs entry created
- [ ] Test: manual_messages status updated to 'sent'
- [ ] Mock Termii API calls
- [ ] Mock Resend API calls

---

#### US-023: Create Integration Tests for Credit Purchase
**As a** QA engineer  
**I want** automated tests for credit purchasing  
**So that** payment flows are verified  

**Acceptance Criteria:**
- [ ] Test file created: `supabase/functions/purchase-credits-from-purse/index.test.ts`
- [ ] Test: Purchase with sufficient wallet balance
- [ ] Test: Fail with insufficient wallet balance
- [ ] Test: Credits added to communication_credits
- [ ] Test: Wallet balance decreased correctly
- [ ] Test: messaging_credit_purchases record created
- [ ] Test: Idempotency (duplicate purchase prevented)
- [ ] Mock Supabase RPC calls

---

#### US-024: Manual QA Testing Checklist
**As a** QA engineer  
**I want** a manual testing checklist  
**So that** all user flows are validated before release  

**Acceptance Criteria:**
- [ ] Checklist document created: `tasks/qa-message-api-testing.md`
- [ ] Test: Create WhatsApp template and submit for approval
- [ ] Test: Send manual email to customer
- [ ] Test: Send manual SMS to customer
- [ ] Test: Send manual WhatsApp message to customer
- [ ] Test: Send bulk message to 5 customers
- [ ] Test: Purchase credits from wallet
- [ ] Test: Purchase credits via Paystack
- [ ] Test: View message history on customer detail page
- [ ] Test: Configure Termii device ID and sender ID
- [ ] Test: Check WhatsApp template approval status
- [ ] Test: Send reactivation campaign with Termii WhatsApp
- [ ] Test: Verify system messages don't consume credits
- [ ] Test: Verify salon-initiated messages consume credits correctly
- [ ] Test: Insufficient credits error handling

---

## 4. Functional Requirements

### Messaging

**FR-1:** System shall support sending messages via Email (Resend), SMS (Termii), and WhatsApp (Termii template-based)

**FR-2:** System shall allow sending one-to-one manual messages to individual customers

**FR-3:** System shall allow sending bulk messages to multiple selected customers

**FR-4:** System shall support WhatsApp template creation with dynamic variables

**FR-5:** System shall track WhatsApp template approval status (pending/approved/rejected)

**FR-6:** System shall store all sent messages in message_logs with delivery status

**FR-7:** System shall differentiate between system-initiated (free) and salon-initiated (paid) messages

### Credit Management

**FR-8:** System shall charge 1 credit for email, 2 credits for SMS, 2 credits for WhatsApp

**FR-9:** System shall provide 30 free monthly credits per tenant

**FR-10:** System shall prevent sending messages when credit balance insufficient

**FR-11:** System shall allow credit purchase from salon wallet balance

**FR-12:** System shall allow credit purchase via Paystack (card/bank transfer)

**FR-13:** System shall support 4 credit packages: 50, 100, 250, 500 credits

**FR-14:** System shall price credits in NGN (Nigeria) and GHS (Ghana) based on tenant currency

### Configuration

**FR-15:** System shall store Termii device_id per tenant for WhatsApp

**FR-16:** System shall store Termii sender_id per tenant for SMS (alphanumeric, 3-11 characters)

**FR-17:** System shall allow configuration via Messaging Settings page

**FR-18:** System shall maintain backward compatibility with existing Meta WhatsApp integration

### Security & Permissions

**FR-19:** System shall require authentication for all message sending operations

**FR-20:** System shall restrict message sending to authorized staff of the tenant

**FR-21:** System shall apply RLS policies to prevent cross-tenant data access

**FR-22:** System shall log all message operations in audit_logs

---

## 5. Non-Goals

The following are explicitly **out of scope** for this PRD:

**NG-1:** Message scheduling (send at future date/time)

**NG-2:** Recurring/automated messages (e.g., birthday messages, appointment reminders)

**NG-3:** Two-way messaging / customer inbox for replies

**NG-4:** Advanced customer segmentation (e.g., filter by spending, last visit date)

**NG-5:** A/B testing of message content

**NG-6:** Message open/click tracking (beyond delivery status)

**NG-7:** Rich media messages (images, videos) except WhatsApp template media

**NG-8:** Voice messages

**NG-9:** SMS delivery reports beyond Termii's initial response

**NG-10:** Custom credit pricing per tenant

---

## 6. Technical Notes

### Architecture

- **Backend:** Supabase Edge Functions (Deno runtime)
- **Frontend:** React 18.3 + Vite, TypeScript 5.8+
- **State Management:** TanStack React Query 5.x
- **Database:** PostgreSQL (Supabase)
- **Payment Gateway:** Paystack (primary for Nigeria/Ghana)
- **Email Provider:** Resend
- **SMS Provider:** Termii (Nigeria)
- **WhatsApp Providers:** Termii (salon messages), Meta (system messages)

### Environment Variables Required

```bash
TERMII_API_KEY=your_termii_api_key
TERMII_SENDER_ID=SalonMagik
PAYSTACK_SECRET_KEY=your_paystack_secret_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=noreply@salonmagik.com
META_WHATSAPP_TOKEN=your_meta_token
META_WHATSAPP_PHONE_NUMBER_ID=your_phone_id
```

### Database Dependencies

- `tenants` table (existing)
- `customers` table (existing)
- `salon_wallets` table (existing)
- `wallet_ledger_entries` table (existing)
- `communication_credits` table (existing)
- `message_logs` table (existing - will be extended)
- `messaging_credit_purchases` table (existing)
- `customer_reactivation_campaigns` table (existing - will be extended)

### API Endpoints

**Termii SMS:** `https://api.ng.termii.com/api/sms/send`  
**Termii WhatsApp Template:** `https://api.ng.termii.com/api/send/template`  
**Termii WhatsApp with Media:** `https://api.ng.termii.com/api/send/template/media`  

### Credit Pricing

| Package | Credits | NGN Price | GHS Price | NGN/Credit | GHS/Credit |
|---------|---------|-----------|-----------|------------|------------|
| pack_50 | 50 | ₦3,500 | GH₵60 | ₦70 | GH₵1.20 |
| pack_100 | 100 | ₦6,500 | GH₵108 | ₦65 | GH₵1.08 |
| pack_250 | 250 | ₦15,000 | GH₵240 | ₦60 | GH₵0.96 |
| pack_500 | 500 | ₦27,000 | GH₵420 | ₦54 | GH₵0.84 |

### Performance Considerations

- Bulk message sending processed in batches of 10 to avoid function timeouts
- Message logs table should be partitioned if volume exceeds 1M rows
- Termii API rate limits: Monitor and implement exponential backoff if needed
- Credit balance checks use database transactions to prevent race conditions

### Migration Strategy

1. Run database migration to add new tables and columns
2. Deploy edge functions (backward compatible)
3. Deploy frontend updates
4. Notify existing tenants via email about new features
5. Provide documentation for configuring Termii device ID
6. Existing reactivation campaigns continue using Meta WhatsApp by default

### Rollback Plan

- Database migrations are additive (no data loss on rollback)
- Edge functions can be rolled back independently
- Frontend can be rolled back to previous version
- Existing messaging functionality (email, basic SMS, Meta WhatsApp) remains operational

---

## 7. Success Metrics

**Adoption Metrics:**
- % of tenants who configure Termii settings (target: 40% within 3 months)
- % of tenants who send at least 1 manual message per week (target: 25%)
- Average manual messages sent per tenant per month (target: 15)

**Revenue Metrics:**
- Total credit purchases per month (NGN/GHS)
- Average credit purchase value per transaction
- % of tenants who purchase credits beyond free allocation (target: 30%)

**Engagement Metrics:**
- Message delivery success rate (target: >95%)
- Average credits consumed per tenant per month
- WhatsApp template approval rate (target: >80%)

**Technical Metrics:**
- Message send latency (target: <3 seconds p95)
- Edge function error rate (target: <1%)
- Credit deduction accuracy (target: 100%)

---

## 8. Open Questions

1. **Termii Account Setup:** Do we need separate Termii accounts for each tenant, or can we use a master account with tenant-specific device IDs?

2. **WhatsApp Template Approval Timeline:** What's the typical approval time from Termii? Should we set user expectations?

3. **SMS DND Route:** Should we enable Termii's DND (transactional) route for appointment reminders? This requires account activation.

4. **Credit Expiration:** Should purchased credits expire after a certain period (e.g., 1 year)?

5. **Free Credit Reset:** Should the 30 free monthly credits reset on calendar month or rolling 30-day window?

---

## 9. Appendix

### User Flow: Send Manual Message

1. Staff navigates to customer detail page
2. Clicks "Send Message" button
3. SendMessageDialog opens with customer pre-selected
4. Selects channel (Email, SMS, or WhatsApp)
5. If WhatsApp, selects approved template and fills variables
6. Composes message content
7. System shows credit cost preview
8. Staff clicks "Send"
9. System checks credit balance
10. If sufficient, creates manual_messages record and invokes send function
11. Message sent via appropriate provider (Resend/Termii)
12. Credits deducted, message_logs entry created
13. Success toast shown
14. Dialog closes, MessageHistory refreshes

### User Flow: Purchase Credits

1. Staff navigates to Messaging Settings or clicks "Purchase Credits" from insufficient credits warning
2. CreditPurchaseDialog opens
3. Selects credit package (50, 100, 250, or 500)
4. Selects payment method (Wallet or Paystack)
5. If Wallet selected and balance sufficient:
   - Clicks "Purchase"
   - Function debits wallet, adds credits
   - Success toast shown
6. If Paystack selected:
   - Clicks "Purchase"
   - Redirects to Paystack checkout
   - Completes payment
   - Webhook processes payment, adds credits
   - Redirects back to app with success message

### User Flow: Create WhatsApp Template

1. Owner navigates to Messaging Settings
2. Clicks "Create Template" in WhatsApp Templates section
3. Template creation dialog opens
4. Enters template name (e.g., "Appointment Reminder")
5. Enters template content with variables: "Hi {{1}}, your appointment is on {{2}} at {{3}}."
6. Defines variables: ["customer_name", "date", "time"]
7. Selects provider (Termii or Meta)
8. Clicks "Create"
9. Template saved with status='pending'
10. System shows message: "Template submitted. Approval typically takes 24-48 hours."
11. Owner receives email when template approved
12. Template becomes available in SendMessageDialog WhatsApp channel

---

**End of PRD**
