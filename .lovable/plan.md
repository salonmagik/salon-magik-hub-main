
# Catalog Modals & Booking Experience Enhancement Plan

## Overview

This plan addresses four key issues:
1. **View Details/Edit modals** - Create modals for catalog items with proper button state management
2. **Booking date/time picker** - Replace the wide calendar with DatePicker + TimePicker components (matching appointment reschedule UI)
3. **Phone input with country code** - Use the PhoneInput component in booking forms
4. **Fix "No available times"** - Debug and fix the slot availability logic

---

## Part 1: Catalog Item Modals (View Details & Edit)

### Current State
- `SelectableItemCard` has a three-dot menu with "View Details" and "Edit" options
- These menu items currently do nothing (no onClick handlers)
- Existing `ServiceDetailDialog`, `ProductDetailDialog`, `PackageDetailDialog` exist but aren't wired up
- No Edit dialogs exist for updating items

### Implementation

#### 1.1 Create Edit Dialogs for Each Item Type

**New Components:**

| File | Purpose |
|------|---------|
| `src/components/dialogs/EditServiceDialog.tsx` | Edit existing service with pre-filled form |
| `src/components/dialogs/EditProductDialog.tsx` | Edit existing product with pre-filled form |
| `src/components/dialogs/EditPackageDialog.tsx` | Edit existing package with pre-filled form |
| `src/components/dialogs/EditVoucherDialog.tsx` | Edit existing voucher with pre-filled form |

**Edit Dialog Pattern:**
```tsx
interface EditServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceData;
  onSuccess?: () => void;
}

export function EditServiceDialog({ open, onOpenChange, service, onSuccess }) {
  // Track original values for change detection
  const [originalData] = useState(service);
  const [formData, setFormData] = useState({...service});
  
  // Determine if any changes have been made
  const hasChanges = useMemo(() => {
    return formData.name !== originalData.name ||
           formData.price !== originalData.price ||
           formData.duration_minutes !== originalData.duration_minutes ||
           // ... other field comparisons
  }, [formData, originalData]);
  
  return (
    <Dialog>
      {/* Form fields pre-filled with service data */}
      <DialogFooter>
        <Button disabled={!hasChanges || isSubmitting}>
          Update Service
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
```

#### 1.2 Update Create Dialogs with Disabled State

Modify existing Add dialogs to disable submit button until required fields are filled:

**AddServiceDialog.tsx:**
```tsx
const isFormValid = useMemo(() => {
  return formData.name.trim() !== "" && 
         formData.price !== "" && 
         parseFloat(formData.price) > 0 &&
         formData.duration !== "" &&
         parseInt(formData.duration) > 0;
}, [formData]);

<Button type="submit" disabled={isSubmitting || !isFormValid}>
  Create Service
</Button>
```

Apply same pattern to AddProductDialog, AddPackageDialog, AddVoucherDialog.

#### 1.3 Wire Up SelectableItemCard Menu Actions

Update `ServicesPage.tsx` to:
1. Track selected item for viewing/editing
2. Pass callbacks to SelectableItemCard
3. Open appropriate dialog based on item type

```tsx
// State for detail/edit dialogs
const [viewDetailItem, setViewDetailItem] = useState<CatalogItem | null>(null);
const [editItem, setEditItem] = useState<CatalogItem | null>(null);

// Handler functions
const handleViewDetails = (item: CatalogItem) => {
  setViewDetailItem(item);
};

const handleEdit = (item: CatalogItem) => {
  setEditItem(item);
};

// In SelectableItemCard usage:
<SelectableItemCard
  item={item}
  onViewDetails={() => handleViewDetails(item)}
  onEdit={canEdit ? () => handleEdit(item) : undefined}
/>
```

#### 1.4 Update Hook Methods for Updates

Add update methods to hooks:

**useServices.tsx:**
```tsx
const updateService = async (id: string, data: Partial<ServiceData>) => {
  const { error } = await supabase
    .from("services")
    .update(data)
    .eq("id", id);
  // Handle error/success
};
```

Apply to `useProducts`, `usePackages`, `useVouchers`.

---

## Part 2: Booking Date/Time Picker Redesign

### Current State (SchedulingStep.tsx)
- Uses full Calendar component with wide display
- Time slots shown as button grid after date selection
- Users see "No available times for this date" issue

### Target State
- Use compact DatePicker (popover-based) matching `ScheduleAppointmentDialog`
- Use TimePicker dropdown for time selection
- Side-by-side layout matching appointment reschedule UI

### Implementation

**Update SchedulingStep.tsx:**
```tsx
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";

// Replace Calendar with DatePicker + TimePicker layout:
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label>Select Date</Label>
    <DatePicker
      value={selectedDate}
      onChange={onDateChange}
      minDate={new Date()}
      disabled={(date) => isClosedDay(date)}
      placeholder="Pick a date"
    />
  </div>
  <div className="space-y-2">
    <Label>Select Time</Label>
    <TimePicker
      value={selectedTime}
      onChange={onTimeChange}
      placeholder="Select time"
      disabled={!selectedDate}
      // Custom slots based on availability
    />
  </div>
</div>
```

**Custom Time Picker for Booking:**

Create a booking-specific time picker that filters available slots:

```tsx
function BookingTimePicker({
  availableSlots,
  selectedTime,
  onChange,
  isLoading
}) {
  const availableTimes = availableSlots?.filter(s => s.available) || [];
  
  return (
    <Select value={selectedTime} onValueChange={onChange}>
      <SelectTrigger>
        <Clock className="h-4 w-4 mr-2" />
        <SelectValue placeholder="Select time" />
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <div className="p-2 text-sm text-muted-foreground">Loading...</div>
        ) : availableTimes.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">No times available</div>
        ) : (
          availableTimes.map((slot) => (
            <SelectItem key={slot.time} value={slot.time}>
              {formatTimeDisplay(slot.time)}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
```

---

## Part 3: Phone Input with Country Code

### Current State (BookerInfoStep.tsx)
- Uses plain `<Input type="tel">` for phone
- No country code selector

### Implementation

**Update BookerInfoStep.tsx:**
```tsx
import { PhoneInput } from "@/components/ui/phone-input";

// Replace plain Input with PhoneInput:
<div className="space-y-2">
  <Label>Phone</Label>
  <PhoneInput
    value={info.phone}
    onChange={(value) => updateField("phone", value)}
    placeholder="Phone number"
    defaultCountry="NG" // Or derive from salon location
  />
</div>
```

**GiftRecipientsStep.tsx** (if applicable):
Apply same change to any phone inputs in gift recipient forms.

---

## Part 4: Fix "No Available Times" Issue

### Root Cause Analysis

The `useAvailableSlots` hook has several potential issues:

1. **Opening time parsing** - The hook accesses `location.opening_time` and `location.closing_time` which are stored as `time without time zone` in PostgreSQL but retrieved as strings. These may be in format `"09:00:00"` (with seconds) not `"09:00"`.

2. **Anonymous user access** - The RLS policy for appointments requires the tenant to have `online_booking_enabled = true`, but the query may be failing silently.

3. **Date format issues** - Timezone mismatches between browser and database.

### Implementation Fixes

**useAvailableSlots.tsx:**
```tsx
// Fix 1: Handle time format with seconds
const openingTime = (location.opening_time || "09:00:00").substring(0, 5);
const closingTime = (location.closing_time || "18:00:00").substring(0, 5);

// Fix 2: Add error handling and debug logging
const { data: appointments, error } = await supabase
  .from("appointments")
  .select("scheduled_start, scheduled_end, status")
  .eq("tenant_id", tenantId)
  .eq("location_id", location.id)
  .gte("scheduled_start", dayStart)
  .lte("scheduled_start", dayEnd)
  .in("status", ["scheduled", "started", "paused"]);

if (error) {
  console.error("Error fetching appointments for slots:", error);
  // Return all slots as available if we can't fetch appointments
  // (better UX than showing "no times available")
}

// Fix 3: Always generate slots even if appointments query fails
if (!appointments || appointments.length === 0) {
  // Generate all slots as available
}
```

**useAvailableDays.tsx:**
Apply same time format fix.

**Debug verification:**
Add console logs to identify exact failure point during testing.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/dialogs/EditServiceDialog.tsx` | CREATE | Edit service modal with change detection |
| `src/components/dialogs/EditProductDialog.tsx` | CREATE | Edit product modal with change detection |
| `src/components/dialogs/EditPackageDialog.tsx` | CREATE | Edit package modal with change detection |
| `src/components/dialogs/EditVoucherDialog.tsx` | CREATE | Edit voucher modal with change detection |
| `src/components/dialogs/AddServiceDialog.tsx` | EDIT | Add form validation for disabled button state |
| `src/components/dialogs/AddProductDialog.tsx` | EDIT | Add form validation for disabled button state |
| `src/components/dialogs/AddPackageDialog.tsx` | EDIT | Add form validation for disabled button state |
| `src/components/dialogs/AddVoucherDialog.tsx` | EDIT | Add form validation for disabled button state |
| `src/pages/salon/ServicesPage.tsx` | EDIT | Wire up view/edit menu actions, add dialog state |
| `src/pages/booking/components/SchedulingStep.tsx` | EDIT | Replace Calendar with DatePicker + TimePicker |
| `src/pages/booking/components/BookerInfoStep.tsx` | EDIT | Use PhoneInput component |
| `src/hooks/booking/useAvailableSlots.tsx` | EDIT | Fix time parsing and error handling |
| `src/hooks/booking/useAvailableDays.tsx` | EDIT | Fix time parsing |
| `src/hooks/useServices.tsx` | EDIT | Add updateService method |
| `src/hooks/useProducts.tsx` | EDIT | Add updateProduct method |
| `src/hooks/usePackages.tsx` | EDIT | Add updatePackage method |
| `src/hooks/useVouchers.tsx` | EDIT | Add updateVoucher method |

---

## UI Comparison

### Before (Booking Scheduling)
```
+------------------------------------------+
| Select Date                              |
|                                          |
| [    Full Calendar Display     ]         |
| [  January 2026                ]         |
| [ Su Mo Tu We Th Fr Sa         ]         |
| [  1  2  3  4  5  6  7         ]         |
| [  ...                         ]         |
|                                          |
| Select Time                              |
| [09:00] [09:30] [10:00] [10:30]         |
| [11:00] [11:30] ...                      |
+------------------------------------------+
```

### After (Booking Scheduling)
```
+------------------------------------------+
| Select Date              Select Time     |
| +------------------+   +---------------+ |
| | 📅 Jan 15, 2026  |   | 🕐 10:00 AM ▼ | |
| +------------------+   +---------------+ |
|                                          |
| Leave unscheduled                        |
| [ ] Book now and schedule later          |
+------------------------------------------+
```

### Three-Dot Menu with Working Actions
```
+------------------------------------------+
| [✓] [IMG] Swedish Massage    $50.00  [⋮] |
|           60 min • Relaxing...           |
+------------------------------------------+
                                        ▼
                              +---------------+
                              | 👁 View Details|
                              | ✏️ Edit        |
                              +---------------+
                                        ▼ (Click View Details)
+------------------------------------------+
| Service Details                    [X]   |
|                                          |
| [Image]                                  |
|                                          |
| Price: $50.00        Duration: 60 min    |
| Category: Massage                        |
|                                          |
| Description:                             |
| A relaxing Swedish massage...            |
|                                          |
| [Edit] [Archive] [🗑]                    |
+------------------------------------------+
```

---

## Testing Checklist

### Modals
- [ ] "View Details" opens correct dialog for services/products/packages/vouchers
- [ ] "Edit" opens edit dialog with pre-filled data
- [ ] Update button is disabled until a change is made
- [ ] Create button is disabled until required fields are filled
- [ ] Changes save correctly and refresh list

### Booking Date/Time
- [ ] DatePicker shows in compact popover format
- [ ] TimePicker dropdown shows available times only
- [ ] Closed days are disabled in date picker
- [ ] Past dates are disabled
- [ ] Time updates when date changes

### Phone Input
- [ ] Country code selector appears
- [ ] Default country matches salon location or user region
- [ ] Phone number formats to E.164

### Availability Fix
- [ ] Available times show for open salon days
- [ ] No false "No available times" messages
- [ ] Slots correctly account for existing bookings
