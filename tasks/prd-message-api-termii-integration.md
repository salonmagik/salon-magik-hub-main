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
- [ ] `sendTermiiSMS()` function implements:
  - HTTP Method: POST
  - Endpoint: `https://api.ng.termii.com/api/sms/send`
  - Request body: `{ api_key, to, from, sms, type, channel }`
  - `to`: Phone number in international format (e.g., "2347880234567") or array for bulk (max 100)
  - `from`: Alphanumeric sender ID (3-11 chars) from tenant.termii_sender_id
  - `sms`: Message text content
  - `type`: "plain" (default) or "unicode" (for special characters)
  - `channel`: "generic" (promotional, DND-restricted, time-restricted 8PM-8AM in Nigeria) or "dnd" (transactional, bypasses DND)
  - Returns: `{ code: "ok", message_id, balance, message, user }`
- [ ] `sendTermiiWhatsAppTemplate()` function implements:
  - HTTP Method: POST
  - Endpoint: `https://api.ng.termii.com/api/send/template` (no media) or `https://api.ng.termii.com/api/send/template/media` (with media)
  - Request body: `{ api_key, phone_number, device_id, template_id, data, media? }`
  - `phone_number`: Single recipient in international format (e.g., "2347880234567")
  - `device_id`: Tenant's Termii WhatsApp device ID (from tenant.termii_device_id)
  - `template_id`: Pre-approved template ID from Termii
  - `data`: Object with variable replacements (e.g., `{ "1": "John", "2": "3PM" }` for `{{1}}` and `{{2}}`)
  - `media` (optional): `{ caption: "Image" | "Document" | "Video" | "Location", url: "https://..." }` - URL must be publicly accessible and downloadable
  - Returns: `{ code: "ok", message_id, balance, message, user }`
  - Note: Authentication templates (OTP) cannot use media, only `data: { otp: "123456" }`
- [ ] `sendTermiiBulkSMS()` function implements:
  - HTTP Method: POST
  - Endpoint: `https://api.ng.termii.com/api/sms/send/bulk`
  - Request body: `{ api_key, to: ["234...", "234..."], from, sms, type, channel }`
  - `to`: Array of phone numbers (max 100 per request)
  - Same parameters as single SMS otherwise
- [ ] Functions throw descriptive errors on API failures:
  - 400: "Invalid Sender ID" or "Insufficient balance" or "Device not found"
  - 401: "Unauthorized - check API key"
  - 403: "Service not active on account"
  - 429: "Rate limit exceeded"
  - 500: "Termii service temporarily unavailable"
- [ ] Response includes Termii `message_id` and `message_id_str` for tracking
- [ ] TypeScript interfaces exported: `TermiiSMSRequest`, `TermiiWhatsAppTemplateRequest`, `TermiiBulkSMSRequest`, `TermiiResponse`
- [ ] Unit tests verify error handling and request formatting

**Technical Notes:**
- **SMS Endpoint:** `POST https://api.ng.termii.com/api/sms/send`
- **WhatsApp Template (No Media):** `POST https://api.ng.termii.com/api/send/template`
- **WhatsApp Template (With Media):** `POST https://api.ng.termii.com/api/send/template/media`
- **Bulk SMS:** `POST https://api.ng.termii.com/api/sms/send/bulk`
- **Channel Routing:**
  - `generic`: Promotional messages, subject to DND and time restrictions (8PM-8AM Nigeria)
  - `dnd`: Transactional messages, bypasses DND restrictions, requires whitelisted Sender ID
- **Character Limits:** 160 chars per SMS (plain), 70 chars per SMS (unicode with special chars like ; / ^ { } \ [ ~ ] | € ' ")
- **Phone Format:** Must be international format without + (e.g., 2347880234567 for Nigeria)
- **WhatsApp Scope:** Only template-based messages (salon → customer), no conversational/reply support
- **WhatsApp Media Formats:** Image (JPG, PNG), Audio (MP3, OGG, AMR), Document (PDF), Video (MP4 with audio)

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
- [ ] **Email channel (channel='email'):**
  - Uses Resend API
  - Credits: 1 per email
  - Provider: 'resend'
- [ ] **SMS channel (channel='sms'):**
  - Uses `sendTermiiSMS()` with:
    - `channel`: "dnd" (for critical messages) or "generic" (for promotional)
    - `type`: "plain" (default) or "unicode" (if special chars detected)
    - `from`: tenant.termii_sender_id
    - `to`: customer.phone_number in international format
  - Credits: 2 per SMS
  - Provider: 'termii_sms'
  - Handles error "Invalid Sender ID" → prompts to configure sender in settings
  - Handles error "Insufficient balance" → refers to Termii account balance, not credits
- [ ] **WhatsApp channel (channel='whatsapp'):**
  - Requires `template_id` and `template_variables` in manual_messages (no free-form messages)
  - Uses `sendTermiiWhatsAppTemplate()` with:
    - `device_id`: tenant.termii_device_id
    - `template_id`: from manual_messages.template_id
    - `data`: manual_messages.template_variables (e.g., `{"1": "John", "2": "3PM"}`)
    - `media`: optional, from manual_messages.media_attachment if present
  - Credits: 2 per WhatsApp message
  - Provider: 'termii_whatsapp'
  - Validates device_id exists, returns 400 "Device ID not configured" if missing
  - Validates template_id exists, returns 400 "WhatsApp requires approved template" if missing
  - Handles error "Device not found" → prompts to verify device ID in settings
  - Handles error "Template not approved" → shows template status
- [ ] Deducts credits from `communication_credits` ONLY on successful send
- [ ] Inserts row into `message_logs` with:
  - `provider`: 'resend' | 'termii_sms' | 'termii_whatsapp'
  - `termii_message_id`: from Termii response
  - `termii_device_id`: if WhatsApp
  - `initiated_by`: 'salon'
  - `credits_used`: 1 (email) or 2 (SMS/WhatsApp)
  - `status`: 'sent' or 'failed'
- [ ] Updates `manual_messages` status to 'sent' and sets sent_at
- [ ] On failure, updates status to 'failed' with error_message
- [ ] Returns success response with `{ success: true, message_id, credits_used, provider }`
- [ ] CORS headers properly configured
- [ ] Auth required via JWT

**Error Handling:**
- Insufficient credits (ours): `{ error: "Insufficient credits", required: X, available: Y }`
- Invalid Sender ID: `{ error: "Invalid Sender ID. Configure in Messaging Settings." }`
- Device not found: `{ error: "WhatsApp device not found. Verify Device ID in settings." }`
- Template not approved: `{ error: "WhatsApp template pending approval. Check template status." }`
- WhatsApp template required: `{ error: "WhatsApp requires approved template. Create and approve template first." }`

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
- [ ] **If provider='termii':**
  - Uses `sendTermiiWhatsAppTemplate()` from termii-client.ts
  - Endpoint: `POST https://api.ng.termii.com/api/send/template`
  - Sends to single customer per call (loop through campaign recipients)
  - Request: `{ api_key, phone_number: customer.phone_number, device_id: campaign.termii_device_id, template_id: campaign.termii_template_id, data: campaign.template_json }`
  - Template variables from campaign.template_json (e.g., `{"1": "{{customer_name}}", "2": "{{last_visit_date}}"}`), replace placeholders before sending
  - Deducts 2 credits per successful send
  - Provider logged as 'termii_whatsapp'
- [ ] **If provider='meta':**
  - Uses existing Meta WhatsApp Business API
  - No changes to existing logic
  - Provider logged as 'meta_whatsapp'
- [ ] **If provider=NULL:**
  - Defaults to 'meta' for backward compatibility
- [ ] Credits deducted properly (2 credits for WhatsApp regardless of provider)
- [ ] `message_logs` includes correct provider value ('termii_whatsapp' or 'meta_whatsapp')
- [ ] Handles Termii errors gracefully:
  - "Device not found" → logs error, marks campaign message as failed
  - "Template not approved" → logs error, marks campaign message as failed
  - "Insufficient balance" (Termii account) → logs error, pauses campaign
- [ ] Existing campaigns default to 'meta' for backward compatibility

**Technical Notes:**
- Termii WhatsApp templates must be pre-approved via Termii dashboard or API
- Template approval typically takes 24-48 hours
- OTP templates (authentication) only accept `data: { otp: "123456" }`, no other variables
- Media attachments supported via `media: { caption, url }` parameter

---

#### US-008: Create WhatsApp Template Management Function
**As a** salon owner  
**I want** to manage WhatsApp templates via API  
**So that** I can create and track template approvals  

**Acceptance Criteria:**
- [ ] Function created at `supabase/functions/manage-whatsapp-templates/index.ts`
- [ ] **POST /create:**
  - Creates new template record in `whatsapp_templates` with status='pending'
  - Request body: `{ template_name, template_content, variables, provider: 'termii' | 'meta' }`
  - template_content: Text with variable placeholders `{{1}}`, `{{2}}`, etc.
  - variables: Array of variable names (e.g., `["customer_name", "date", "time"]`)
  - Does NOT submit to Termii API (salon owner submits manually via Termii dashboard)
  - Returns: `{ success: true, template_id: <uuid> }`
- [ ] **GET /list:**
  - Returns all templates for tenant from `whatsapp_templates`
  - Query params: `?provider=termii` or `?status=approved` for filtering
  - Response: `{ templates: [{ id, template_name, status, provider, created_at, ... }] }`
- [ ] **PUT /update/:id:**
  - Updates template (only if status='pending' or 'rejected')
  - Request body: `{ template_name?, template_content?, variables? }`
  - Returns 400 if template status='approved' with message "Cannot edit approved template"
- [ ] **DELETE /:id:**
  - Soft deletes template (sets deleted_at timestamp)
  - Only allows delete if status='pending' or 'rejected'
  - Returns 400 if template status='approved' and in use
- [ ] **GET /status/:id:**
  - Returns current template status from database
  - **Note:** Termii does NOT provide an API endpoint to check template status
  - Salon owner must manually update status after Termii approval notification
  - Response: `{ template_id, status, updated_at }`
- [ ] **PATCH /approve/:id:**
  - Manually marks template as 'approved' after salon owner receives Termii confirmation
  - Request body: `{ termii_template_id: <termii_id> }` (from Termii dashboard)
  - Updates status='approved' and stores termii_template_id
  - Only callable by salon owner/admin
- [ ] Validates template_name uniqueness per tenant (UNIQUE constraint)
- [ ] Validates template_content structure (must be valid JSONB)
- [ ] Validates variable placeholders match variables array count
- [ ] Requires authentication via JWT
- [ ] Returns 403 if user not authorized for tenant
- [ ] Logs all operations in audit_logs table

**Technical Notes:**
- Termii template management is done via Termii dashboard, NOT via API
- Salon owners must:
  1. Create template in salon-magik (status='pending')
  2. Log into Termii dashboard and submit same template for approval
  3. Wait 24-48 hours for Termii approval
  4. Manually mark template as 'approved' in salon-magik with Termii template_id
- Template variable format: `{{1}}`, `{{2}}`, `{{3}}` (numeric placeholders)
- OTP templates have special rules: only `otp` variable allowed

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
- [ ] WhatsApp template selector for WhatsApp channel (required, no free-form WhatsApp messages)
- [ ] Template variable inputs shown dynamically based on selected template
- [ ] WhatsApp channel disabled if no approved templates exist with message "Create WhatsApp templates first"
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
- [ ] **SMS Bulk Processing (channel='sms'):**
  - Uses `sendTermiiBulkSMS()` for batches up to 100 recipients
  - Endpoint: `POST https://api.ng.termii.com/api/sms/send/bulk`
  - Request: `{ api_key, to: ["234...", "234..."], from: tenant.termii_sender_id, sms: message, type: "plain", channel: "generic" | "dnd" }`
  - Splits customerIds into batches of 100 if > 100 recipients
  - Processes batches sequentially to avoid rate limits
  - Deducts 2 credits per successful recipient
- [ ] **Email/WhatsApp Bulk Processing:**
  - Processes messages in batches of 10 (to avoid timeouts)
  - For each message, calls appropriate send function (Resend for email, Termii WhatsApp for WhatsApp)
  - Email: 1 credit each via Resend
  - WhatsApp: 2 credits each via `sendTermiiWhatsAppTemplate()` (single recipient per call, loop through batch)
- [ ] Updates status to 'sent' or 'failed' individually per message
- [ ] Deducts credits only for successfully sent messages (atomic per message)
- [ ] Returns summary: `{ sent: number, failed: number, creditsUsed: number, failedMessages: [{ customerId, customerName, error }] }`
- [ ] Logs bulk operation in audit_logs with summary stats
- [ ] Handles partial failures gracefully (some sent, some failed)
- [ ] Implements retry logic for transient failures (e.g., network timeout)

**Technical Notes:**
- **Termii Bulk SMS Endpoint:** `POST https://api.ng.termii.com/api/sms/send/bulk`
- Max 100 phone numbers per bulk SMS request
- Bulk SMS is cost-effective: same credit cost as individual sends but single API call
- WhatsApp does NOT have a bulk endpoint; must send individually
- Email via Resend can be batched if Resend supports (check API docs)
- Credit deduction is atomic per message to prevent double-charging on retries

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

**FR-1.1:** SMS messages shall use Termii's `generic` channel for promotional messages (subject to DND and 8PM-8AM time restrictions in Nigeria)

**FR-1.2:** SMS messages shall use Termii's `dnd` channel for transactional messages (bypasses DND restrictions, requires whitelisted Sender ID)

**FR-1.3:** WhatsApp messages shall ONLY use pre-approved templates via Termii template API (`POST /api/send/template`) - no free-form messaging

**FR-1.4:** WhatsApp template messages may include media attachments (image, document, video, location) via `POST /api/send/template/media`

**FR-2:** System shall allow sending one-to-one manual messages to individual customers

**FR-3:** System shall allow sending bulk messages to multiple selected customers
  
**FR-3.1:** Bulk SMS shall use Termii bulk endpoint (`POST /api/sms/send/bulk`) for up to 100 recipients per batch

**FR-3.2:** Bulk WhatsApp messages shall be sent individually (no bulk endpoint available)

**FR-4:** System shall support WhatsApp template creation with dynamic variables using numeric placeholders (`{{1}}`, `{{2}}`, etc.)

**FR-5:** System shall track WhatsApp template approval status (pending/approved/rejected)

**FR-5.1:** Template approval is managed via Termii dashboard (no approval API available)

**FR-5.2:** Salon owners must manually mark templates as approved after receiving Termii confirmation

**FR-6:** System shall store all sent messages in message_logs with delivery status

**FR-6.1:** Message logs shall include `provider` field: 'resend', 'termii_sms', 'termii_whatsapp', 'meta_whatsapp'

**FR-6.2:** Message logs shall include `termii_message_id` for tracking Termii message delivery

**FR-7:** System shall differentiate between system-initiated (free) and salon-initiated (paid) messages via `initiated_by` field

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

**FR-16.1:** Sender IDs must be registered and approved via Termii before use

**FR-16.2:** Sender ID registration uses `POST https://api.ng.termii.com/api/sender-id/request` endpoint

**FR-16.3:** System shall validate Sender ID format: alphanumeric, 3-11 characters, no spaces or special characters

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

**NG-3:** Two-way messaging / customer inbox for replies / conversational WhatsApp (customers cannot reply to salon messages within this feature)

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

### Termii API Specifications

#### Base URL
```
https://api.ng.termii.com
```

#### Channel Routing Strategy

| Channel | Use Case | DND Restrictions | Time Restrictions | Credit Cost | Sender ID Required |
|---------|----------|------------------|-------------------|-------------|-------------------|
| `generic` | Promotional, marketing | Blocked for DND numbers | 8PM-8AM (Nigeria MTN) | 2 credits | Yes (alphanumeric 3-11 chars) |
| `dnd` | Transactional, OTP, critical | Bypasses DND | None | 2 credits | Yes (must be whitelisted) |
| `whatsapp` (template) | Approved templates only | None | None | 2 credits | Device ID required |

#### Phone Number Format
- **Format:** International without + symbol
- **Examples:**
  - Nigeria: `2347880234567` (234 country code + 10-digit number)
  - Ghana: `233201234567` (233 country code + 9-digit number)
- **Validation:** Must start with country code, 10-15 digits total

#### SMS Character Limits
- **Plain text (`type: "plain"`):** 160 characters per SMS unit
- **Unicode (`type: "unicode"`):** 70 characters per SMS unit
- **Unicode triggers:** Special characters like `;  / ^ { } \ [ ~ ] | € ' "`
- **Multi-part:** Long messages automatically split and charged per segment

#### WhatsApp Template Requirements
- **Variable format:** `{{1}}`, `{{2}}`, `{{3}}` (numeric placeholders only, 1-indexed)
- **Data object format:** `{ "1": "John", "2": "3PM", "3": "March 30" }`
- **OTP templates:** Special case, only `{ "otp": "123456" }` allowed
- **Approval time:** 24-48 hours via Termii dashboard
- **No template editing:** Once approved, cannot be modified (must create new template)

#### WhatsApp Media Support
- **Endpoint:** `POST /api/send/template/media`
- **Media object:** `{ caption: "Image" | "Document" | "Video" | "Location", url: "https://..." }`
- **URL requirements:** Must be publicly accessible, direct download link (not Google Drive share links)
- **Supported formats:**
  - Image: JPG, JPEG, PNG
  - Audio: MP3, OGG, AMR
  - Document: PDF
  - Video: MP4 (must have audio track)
- **OTP restriction:** Authentication templates cannot use media

#### Bulk SMS Limits
- **Max recipients per request:** 100 phone numbers
- **Format:** `to: ["2347880234567", "2348012345678", ...]`
- **Batching strategy:** Split arrays >100 into multiple requests
- **Rate limiting:** Process batches sequentially with 1-second delay

#### Error Code Mapping

| HTTP Status | Termii Error Message | Salon-Magik User Message | Recommended Action |
|-------------|---------------------|--------------------------|-------------------|
| 400 | "Invalid Sender ID" | "SMS Sender ID not configured or invalid" | Configure in Messaging Settings |
| 400 | "Insufficient balance" | "Termii account balance low. Contact support." | Admin tops up Termii account |
| 400 | "Device not found" | "WhatsApp device not registered" | Verify Device ID in settings |
| 400 | "Your device has reached the daily limit" | "Daily WhatsApp message limit reached" | Wait until next day or contact support |
| 401 | "Unauthorized" | "Message service authentication failed" | Check API key in environment |
| 403 | "Your account is not active" | "Messaging service unavailable. Contact support." | Admin resolves with Termii |
| 403 | "You are not set up on this route" | "Messaging not available for this country" | Contact support to enable route |
| 403 | "No active subscription on your device" | "WhatsApp device subscription expired" | Renew subscription in Termii dashboard |
| 422 | Template-related errors | "WhatsApp requires approved template. Create template first." | Select approved WhatsApp template |
| 429 | Rate limit | "Too many messages sent. Please wait." | Retry after 60 seconds |
| 500 | "Service temporarily unavailable" | "Messaging service temporarily down. Try again later." | Retry after 5 minutes |

### Environment Variables Required

```bash
TERMII_API_KEY=your_termii_api_key
TERMII_SENDER_ID=SalonMagik  # Default sender ID for SMS
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

#### Termii Messaging APIs

**1. SMS (Single Recipient)**
- **Method:** POST
- **Endpoint:** `https://api.ng.termii.com/api/sms/send`
- **Body:** `{ api_key, to: "2347880234567", from: "SenderID", sms: "message text", type: "plain" | "unicode", channel: "generic" | "dnd" }`
- **Response:** `{ code: "ok", message_id, balance, message, user }`
- **Conditions:**
  - `channel: "generic"` → Promotional, DND-blocked, time-restricted 8PM-8AM (Nigeria MTN only)
  - `channel: "dnd"` → Transactional, bypasses DND, requires whitelisted Sender ID
  - 160 chars/SMS (plain), 70 chars/SMS (unicode)

**2. SMS (Bulk - Multiple Recipients)**
- **Method:** POST
- **Endpoint:** `https://api.ng.termii.com/api/sms/send/bulk`
- **Body:** `{ api_key, to: ["234...", "234..."], from: "SenderID", sms: "message text", type: "plain", channel: "generic" | "dnd" }`
- **Max:** 100 phone numbers per request
- **Response:** `{ code: "ok", message_id, balance, message, user }`

**3. WhatsApp (Template - No Media)**
- **Method:** POST
- **Endpoint:** `https://api.ng.termii.com/api/send/template`
- **Body:** `{ api_key, phone_number: "2347880234567", device_id: "uuid", template_id: "termii_template_id", data: {"1": "value1", "2": "value2"} }`
- **Response:** `{ code: "ok", message_id, balance, message, user }`
- **Conditions:**
  - Template must be pre-approved by Termii (24-48hr approval time)
  - Variable placeholders: `{{1}}`, `{{2}}`, `{{3}}` (numeric)
  - OTP templates: only `data: { otp: "123456" }` allowed

**4. WhatsApp (Template - With Media)**
- **Method:** POST
- **Endpoint:** `https://api.ng.termii.com/api/send/template/media`
- **Body:** `{ api_key, phone_number: "2347880234567", device_id: "uuid", template_id: "termii_template_id", data: {"1": "value1"}, media: { caption: "Image" | "Document" | "Video" | "Location", url: "https://..." } }`
- **Response:** `{ code: "ok", message_id, balance, message, user }`
- **Conditions:**
  - URL must be publicly accessible and downloadable
  - Supported formats: JPG, PNG (Image), PDF (Document), MP4 with audio (Video), MP3/OGG/AMR (Audio)
  - OTP templates do NOT support media

**Note:** WhatsApp conversational messages (no template, free-form text) are **OUT OF SCOPE** for this feature. All WhatsApp messages from salon to customer must use pre-approved templates.
- **Fetch Sender IDs:** `GET https://api.ng.termii.com/api/sender-id?api_key=...`
- **Request Sender ID:** `POST https://api.ng.termii.com/api/sender-id/request` with `{ api_key, sender_id: "CompanyName", use_case: "OTP sample", company: "Company Name" }`
- **Response:** `{ code: "ok", message: "Sender Id requested. You will be contacted by your account manager." }`

#### Common Termii Error Responses

- **400 Bad Request:**
  - "Invalid Sender ID" → Sender ID not registered or misspelled
  - "Insufficient balance" → Termii account balance low (not our credit balance)
  - "Device not found" → WhatsApp device ID not registered
  - "Your device has reached the daily limit" → Daily message quota exceeded
- **401 Unauthorized:** "Unauthorized" → Check API key and use HTTPS (not HTTP)
- **403 Forbidden:**
  - "Your account is not active" → Account disabled
  - "You are not set up on this route" → Country route not activated
  - "This service is currently not active on your account" → Feature not enabled
  - "No active subscription on your device" → WhatsApp device subscription expired
- **422 Unprocessable Entity:** "Template not approved" or "WhatsApp destination not in free-form window"
- **429 Too Many Requests:** Rate limit exceeded
- **500 Server Error:** "Service temporarily unavailable" → Termii downtime  

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

## 10. Quick Reference Tables

### Termii API Endpoint Reference

| Operation | Method | Endpoint | Request Body Keys | Success Response | Use Case |
|-----------|--------|----------|-------------------|------------------|----------|
| Send SMS (single) | POST | `/api/sms/send` | `api_key, to, from, sms, type, channel` | `{ code: "ok", message_id, balance }` | Manual single message, appointment reminders |
| Send SMS (bulk) | POST | `/api/sms/send/bulk` | `api_key, to: [], from, sms, type, channel` | `{ code: "ok", message_id, balance }` | Bulk promotions, announcements |
| Send WhatsApp (template) | POST | `/api/send/template` | `api_key, phone_number, device_id, template_id, data` | `{ code: "ok", message_id, balance }` | Template-based marketing, reminders (salon → customer only) |
| Send WhatsApp (template + media) | POST | `/api/send/template/media` | `api_key, phone_number, device_id, template_id, data, media` | `{ code: "ok", message_id, balance }` | Marketing with images/documents (salon → customer only) |
| Fetch Sender IDs | GET | `/api/sender-id?api_key=...` | N/A | `{ content: [{ sender_id, status, country }] }` | List registered sender IDs |
| Request Sender ID | POST | `/api/sender-id/request` | `api_key, sender_id, use_case, company` | `{ code: "ok", message: "..." }` | Register new sender ID |

### Message Channel Decision Tree

```
When should I use which channel?

┌─ Need to send SMS? ──────────────────────────────────────┐
│                                                            │
│  Is it promotional/marketing?                             │
│  ├─ YES → channel: "generic"                              │
│  │        (DND-blocked, 8PM-8AM restricted in Nigeria)    │
│  └─ NO  → channel: "dnd"                                  │
│           (OTP, appointment reminders, invoices)          │
│           (Requires whitelisted Sender ID)                │
└────────────────────────────────────────────────────────────┘

┌─ Need to send WhatsApp? ─────────────────────────────────┐
│                                                            │
│  Do you have an approved template?                        │
│  ├─ YES → Use template endpoint                           │
│  │        (/api/send/template or /api/send/template/media)│
│  └─ NO  → ERROR: WhatsApp requires approved template      │
│           Create and get template approved first          │
│           (No free-form WhatsApp messages in this feature)│
└────────────────────────────────────────────────────────────┘

┌─ Need to send Email? ────────────────────────────────────┐
│                                                            │
│  Always use Resend API (no restrictions)                  │
│  Credit cost: 1 credit per email                          │
└────────────────────────────────────────────────────────────┘
```

### Credit Cost Summary

| Channel | Provider | Credits | Conditions | Suggested Use |
|---------|----------|---------|------------|---------------|
| Email | Resend | 1 | None | Invoices, receipts, newsletters |
| SMS (generic) | Termii | 2 | DND-blocked, 8PM-8AM restricted | Promotions, marketing |
| SMS (dnd) | Termii | 2 | Requires whitelisted Sender ID | OTP, reminders, critical alerts |
| WhatsApp (template) | Termii | 2 | Pre-approved template required | Appointment confirmations, promotions (salon → customer only) |
| WhatsApp (system) | Meta | 0 | System-initiated only | Reactivation campaigns (existing) |

### Common Implementation Pitfalls

| Issue | Symptom | Root Cause | Solution |
|-------|---------|------------|----------|
| "Invalid Sender ID" | SMS fails to send | Sender ID not registered with Termii | Register via `/api/sender-id/request`, wait for approval |
| "Device not found" | WhatsApp fails | Device ID incorrect or not registered | Verify `termii_device_id` in tenant settings |
| "WhatsApp requires template" | WhatsApp fails | No template selected or template not approved | Create and approve WhatsApp template, then select it |
| Template not found in SendMessageDialog | Template not listed | Status not 'approved' | Manually mark template as approved after Termii confirmation |
| SMS not delivered to DND numbers | Silent failure | Using `channel: "generic"` | Switch to `channel: "dnd"` for transactional messages |
| WhatsApp media not sending | Media URL error | URL not publicly accessible | Use direct download URLs, not Google Drive/Dropbox share links |
| Bulk SMS failing | 400 error | >100 recipients in single request | Split into batches of 100 |
| Credits not deducted | Balance unchanged | `initiated_by: "system"` set incorrectly | Set `initiated_by: "salon"` for salon messages |

---

**End of PRD**
