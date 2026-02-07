
# Payment Flow, Notifications & Import/Export Enhancement Plan

## Summary of Issues

1. **Payment flow bypasses gateway selection** - Directly redirects to Paystack instead of showing Stripe/Paystack options with the PaymentStep UI
2. **Missing post-payment notifications** - Customer doesn't receive invoice/receipt, salon doesn't get email or in-app notification after successful payment
3. **Booking status message styling** - Border should use brand highlight color instead of default
4. **Import functions lack modals** - No modal with XLS templates showing expected data format
5. **Export format selection** - No CSV/XLS format selector dropdown
6. **Swapped import/export icons** - Download icon used for import, Upload icon used for export (should be reversed)

---

## Part 1: Payment Gateway Selection & Flow

### Current Problem
The `BookingWizard.tsx` creates a booking and immediately calls `create-payment-session` which auto-detects the gateway based on region and redirects to the payment URL. The `PaymentStep.tsx` component exists but is never rendered in the wizard.

### Solution
Add a "payment" step to the wizard that shows the `PaymentStep` component, allowing users to select Stripe or Paystack before proceeding. Only after selection should the payment session be created with the chosen gateway.

### Changes to BookingWizard.tsx

```typescript
// Add "payment" step after "review"
type WizardStep = "cart" | "scheduling" | "booker" | "gifts" | "review" | "payment" | "confirmation";

// Track selected gateway
const [selectedGateway, setSelectedGateway] = useState<"stripe" | "paystack">("stripe");

// Update step config to include payment step when payment is required
if (amountDueNow > 0) {
  steps.push({ key: "payment", label: "Payment", icon: <CreditCard /> });
}

// In review step, instead of directly calling payment session:
// Change "Pay X" button to go to payment step first
if (step === "review" && amountDueNow > 0) {
  setStep("payment");
  return;
}

// In payment step, call create-payment-session with preferredGateway
const paymentResponse = await supabase.functions.invoke("create-payment-session", {
  body: {
    ...existingPayload,
    preferredGateway: selectedGateway, // Pass user's selection
  },
});
```

### Render PaymentStep in wizard

```tsx
{step === "payment" && (
  <PaymentStep
    amountDue={amountDueNow}
    currency={salon.currency}
    country={salon.country || "US"}
    onGatewaySelect={setSelectedGateway}
    onSubmit={handlePaymentSubmit}
    isSubmitting={isSubmitting}
    brandColor={brandColor}
  />
)}
```

---

## Part 2: Post-Payment Notifications (Webhook Enhancement)

### Current Problem
The `payment-webhook` function updates the appointment and creates an in-app notification for "payment_received", but:
1. Does NOT send email confirmation to customer
2. Does NOT send email notification to salon
3. Does NOT generate invoice/receipt
4. In-app notification is only for payment, not for "new_booking"

### Solution
Enhance the webhook to trigger comprehensive notifications after successful payment:

### Changes to payment-webhook/index.ts

After payment success, add:

```typescript
// 1. Send confirmation email to customer
const appointmentNotifResponse = await fetch(
  `${supabaseUrl}/functions/v1/send-appointment-notification`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appointmentId: appointmentId,
      action: "scheduled",
    }),
  }
);

// 2. Create urgent in-app notification for salon (new booking)
await supabase.from("notifications").insert({
  tenant_id: appointment.tenant_id,
  type: "new_booking",
  title: "New Paid Booking",
  description: `${customer.full_name} completed payment of ${formatCurrency(amount)} for their booking`,
  entity_type: "appointment",
  entity_id: appointmentId,
  urgent: true, // Mark as urgent for paid bookings
});

// 3. Send email to salon owners/managers
await sendSalonNotificationEmail(supabase, appointment, amount);

// 4. Generate and send invoice/receipt to customer
await generateAndSendReceipt(supabase, appointmentId, amount);
```

### New Helper Functions in payment-webhook

```typescript
async function sendSalonNotificationEmail(supabase, appointment, amount) {
  // Fetch salon email settings
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, contact_email")
    .eq("id", appointment.tenant_id)
    .single();

  // Fetch owner emails
  const { data: owners } = await supabase
    .from("user_roles")
    .select("profiles(email)")
    .eq("tenant_id", appointment.tenant_id)
    .eq("role", "owner");

  // Send email via Resend to each owner
  for (const owner of owners) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: owner.profiles.email,
        subject: `New Paid Booking at ${tenant.name}`,
        html: buildNewBookingEmailHtml(appointment, amount),
      }),
    });
  }
}

async function generateAndSendReceipt(supabase, appointmentId, amount) {
  // Create invoice record
  const { data: invoice } = await supabase
    .from("invoices")
    .insert({
      tenant_id: appointment.tenant_id,
      customer_id: appointment.customer_id,
      appointment_id: appointmentId,
      invoice_number: await generateInvoiceNumber(appointment.tenant_id),
      subtotal: amount,
      total: amount,
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // Send invoice email
  await fetch(`${supabaseUrl}/functions/v1/send-invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invoiceId: invoice.id }),
  });
}
```

---

## Part 3: Booking Status Message Brand Color

### Current Problem
In `SalonHeader.tsx`, the booking status message uses a generic border:
```tsx
<div className="p-4 rounded-lg bg-muted border">
```

### Solution
Apply the brand color to the border:

```tsx
{salon.booking_status_message && (
  <div 
    className="p-4 rounded-lg bg-muted"
    style={{ 
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: salon.brand_color || "#2563EB" 
    }}
  >
    <p className="text-sm text-muted-foreground">{salon.booking_status_message}</p>
  </div>
)}
```

---

## Part 4: Import Functions with Modal & XLS Templates

### Files to Update (All 4 Platforms)

| Platform | File | Import Location |
|----------|------|-----------------|
| Salon | `CustomersPage.tsx` | Import Customers |
| Salon | `ServicesPage.tsx` | Import Catalog Items |
| Salon | `JournalPage.tsx` | Import Journal Entries |
| Backoffice | `WaitlistPage.tsx` | Import Waitlist Leads |
| Backoffice | `TenantsPage.tsx` | Import Tenants |
| Client | N/A | No import needed |

### New Component: ImportDialog.tsx

```tsx
interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  templateColumns: { header: string; example: string; required: boolean }[];
  onImport: (file: File) => Promise<void>;
  templateFileName: string;
}

export function ImportDialog({
  open,
  onOpenChange,
  title,
  templateColumns,
  onImport,
  templateFileName,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = () => {
    // Generate XLS with headers and example row
    const worksheet = XLSX.utils.aoa_to_sheet([
      templateColumns.map(c => c.header),
      templateColumns.map(c => c.example),
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, `${templateFileName}-template.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Upload an XLS or CSV file to import data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <div className="p-4 border rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-2">Need a template?</p>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download XLS Template
            </Button>
          </div>

          {/* Expected Format Table */}
          <div>
            <p className="text-sm font-medium mb-2">Expected columns:</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Example</TableHead>
                  <TableHead>Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templateColumns.map((col) => (
                  <TableRow key={col.header}>
                    <TableCell className="font-mono text-xs">{col.header}</TableCell>
                    <TableCell className="text-xs">{col.example}</TableCell>
                    <TableCell>
                      {col.required ? (
                        <Badge variant="destructive">Required</Badge>
                      ) : (
                        <Badge variant="secondary">Optional</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
              id="import-file"
            />
            <label htmlFor="import-file" className="cursor-pointer">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {file ? file.name : "Click to select file or drag and drop"}
              </p>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => file && onImport(file)} 
            disabled={!file || isImporting}
          >
            {isImporting ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Template Definitions per Import Type

**Customers:**
```typescript
const CUSTOMER_TEMPLATE = [
  { header: "full_name", example: "John Doe", required: true },
  { header: "email", example: "john@example.com", required: true },
  { header: "phone", example: "+2348012345678", required: false },
  { header: "notes", example: "VIP customer", required: false },
];
```

**Services:**
```typescript
const SERVICE_TEMPLATE = [
  { header: "name", example: "Haircut", required: true },
  { header: "description", example: "Classic mens haircut", required: false },
  { header: "price", example: "5000", required: true },
  { header: "duration_minutes", example: "30", required: true },
  { header: "category", example: "Hair", required: false },
];
```

**Journal Entries:**
```typescript
const JOURNAL_TEMPLATE = [
  { header: "occurred_at", example: "2026-02-07 10:00", required: true },
  { header: "direction", example: "inflow", required: true },
  { header: "amount", example: "15000", required: true },
  { header: "category", example: "service_payment", required: true },
  { header: "payment_method", example: "cash", required: true },
  { header: "description", example: "Payment for haircut", required: false },
];
```

---

## Part 5: Export Format Selection Dropdown

### New Component: ExportDropdown.tsx

```tsx
interface ExportDropdownProps {
  onExport: (format: "csv" | "xlsx") => void;
  disabled?: boolean;
}

export function ExportDropdown({ onExport, disabled }: ExportDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Upload className="w-4 h-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport("csv")}>
          <FileText className="w-4 h-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("xlsx")}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export as XLS
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Update Export Functions

Each page's export handler should accept a format parameter:

```typescript
const handleExport = (format: "csv" | "xlsx") => {
  const data = entries.map((entry) => ({
    Date: format(new Date(entry.occurred_at), "yyyy-MM-dd HH:mm"),
    Direction: entry.direction,
    Amount: entry.amount,
    // ... other columns
  }));

  if (format === "csv") {
    const csvContent = generateCSV(data);
    downloadFile(csvContent, "journal-export.csv", "text/csv");
  } else {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
    XLSX.writeFile(workbook, "journal-export.xlsx");
  }
};
```

---

## Part 6: Swap Import/Export Icons

### Current State (Incorrect)
- Import button uses `Upload` icon
- Export button uses `Download` icon

### Correct State
- Import button should use `Download` icon (downloading template/data INTO app)
- Export button should use `Upload` icon (uploading data OUT of app)

Wait - actually the user says "icon used for import should be used for export and vice versa" - this suggests:
- Currently: Import has Download, Export has Upload
- Desired: Import has Upload, Export has Download

Let me verify... Looking at the code:
- `CustomersPage.tsx`: Import button uses `<Upload className="w-4 h-4 mr-2" />`
- `JournalPage.tsx`: Export button uses `<Download className="w-4 h-4 mr-2" />`

So currently:
- Import = Upload icon
- Export = Download icon

User wants to swap them:
- Import = Download icon (downloading data INTO the app)
- Export = Upload icon (uploading/sending data OUT)

### Changes

**Import buttons:**
```tsx
// Before
<Upload className="w-4 h-4 mr-2" />

// After
<Download className="w-4 h-4 mr-2" />
```

**Export buttons:**
```tsx
// Before
<Download className="w-4 h-4 mr-2" />

// After
<Upload className="w-4 h-4 mr-2" />
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/booking/components/BookingWizard.tsx` | EDIT | Add "payment" step, integrate PaymentStep component |
| `supabase/functions/payment-webhook/index.ts` | EDIT | Add customer email, salon email, invoice generation |
| `src/pages/booking/components/SalonHeader.tsx` | EDIT | Apply brand color to status message border |
| `src/components/dialogs/ImportDialog.tsx` | CREATE | Reusable import modal with XLS template download |
| `src/components/ExportDropdown.tsx` | CREATE | CSV/XLS format selector dropdown |
| `src/pages/salon/CustomersPage.tsx` | EDIT | Add ImportDialog, swap icons |
| `src/pages/salon/ServicesPage.tsx` | EDIT | Add ImportDialog, swap icons |
| `src/pages/salon/JournalPage.tsx` | EDIT | Add ExportDropdown, swap icons |
| `src/pages/salon/PaymentsPage.tsx` | EDIT | Add ExportDropdown, swap icons |
| `src/pages/salon/ReportsPage.tsx` | EDIT | Add ExportDropdown, swap icons |
| `src/pages/backoffice/WaitlistPage.tsx` | EDIT | Add ImportDialog/ExportDropdown, swap icons |
| `src/pages/backoffice/TenantsPage.tsx` | EDIT | Add ImportDialog/ExportDropdown, swap icons |
| `package.json` | EDIT | Add `xlsx` package for XLS generation |

---

## Dependencies

Add the `xlsx` package for XLS file generation:
```bash
npm install xlsx
```

---

## Testing Checklist

### Payment Flow
- [ ] Review step shows "Continue to Payment" when amount due > 0
- [ ] Payment step displays Stripe and Paystack options
- [ ] Selected gateway is passed to create-payment-session
- [ ] User is redirected to correct payment provider

### Post-Payment Notifications
- [ ] Customer receives confirmation email after payment
- [ ] Customer receives invoice/receipt email
- [ ] Salon owners receive new booking email
- [ ] In-app notification marked as urgent for paid bookings

### Booking Status Message
- [ ] Border uses salon's brand color
- [ ] Falls back to primary blue if no brand color set

### Import Functions
- [ ] Import button opens modal
- [ ] Template download provides XLS with correct columns
- [ ] File upload accepts XLS and CSV
- [ ] Data imports correctly

### Export Functions
- [ ] Export button shows CSV/XLS dropdown
- [ ] CSV export downloads correctly
- [ ] XLS export downloads correctly

### Icon Swap
- [ ] Import buttons use Download icon
- [ ] Export buttons use Upload icon
