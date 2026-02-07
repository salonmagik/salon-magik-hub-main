

# Appointments Enhancement & Staff Invitation Fix Plan (Updated v2)

## Summary of All Changes

1. **Date range filter with dropdown** - Replace "Today" text in card with dropdown, upgrade DatePicker to date range (two pickers)
2. **Unscheduled view: "Schedule" vs "Reschedule"** - Change action label for unscheduled appointments
3. **Unscheduled view status cards** - Add Paid, Unpaid, Partial, Gifted cards with horizontal scroll
4. **Combined status filter with submenus** - Single dropdown with Bookings/Payments categories, multi-select checkboxes
5. **Amount Due column and stat card** - Add to scheduled view
6. **Staff invitation RLS fix** - Create edge function for token validation
7. **Custom email verification** - Replace Supabase/Lovable default with Salon Magik branding

---

## Part 1: Date Range Filter with Dropdown in Card

### Replace "Today" Text with Dropdown
Keep the card structure, only change the text to a dropdown:

```tsx
<Card className="bg-primary/5 border-primary/20">
  <CardContent className="p-4">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-primary/10">
        <Calendar className="w-5 h-5 text-primary" />
      </div>
      <div>
        {/* Dropdown replaces static "Today" text */}
        <Select value={dateRangePreset} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-auto border-0 p-0 text-xs text-muted-foreground font-normal bg-transparent shadow-none focus:ring-0 w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_60_days">Last 60 Days</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xl font-semibold">{rangeStats.count}</p>
      </div>
    </div>
  </CardContent>
</Card>
```

### Upgrade Date Filter to Date Range Picker
Replace single DatePicker with two pickers (start - end):

```tsx
{/* Search stays above filters */}
<Input placeholder="Search appointments..." value={searchQuery} onChange={...} />

{/* Date Range Filter */}
<div className="flex items-center gap-2">
  <DatePicker
    value={stringToDate(startDate)}
    onChange={(date) => {
      setStartDate(dateToString(date) || "");
      setDateRangePreset(undefined); // Clear preset on manual change
    }}
    placeholder="Start date"
  />
  <span className="text-muted-foreground">—</span>
  <DatePicker
    value={stringToDate(endDate)}
    onChange={(date) => {
      setEndDate(dateToString(date) || "");
      setDateRangePreset(undefined);
    }}
    placeholder="End date"
    minDate={stringToDate(startDate)}
  />
</div>
```

### Preset Change Handler
Syncs dropdown selection with date range pickers:

```typescript
const handlePresetChange = (preset: DateRangePreset) => {
  setDateRangePreset(preset);
  const now = new Date();
  
  switch (preset) {
    case "today":
      const today = format(now, "yyyy-MM-dd");
      setStartDate(today);
      setEndDate(today);
      break;
    case "this_week":
      setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      break;
    case "this_month":
      setStartDate(format(startOfMonth(now), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(now), "yyyy-MM-dd"));
      break;
    case "last_60_days":
      setStartDate(format(subDays(now, 60), "yyyy-MM-dd"));
      setEndDate(format(now, "yyyy-MM-dd"));
      break;
  }
};

// Initialize with "this_week" on mount
useEffect(() => {
  handlePresetChange("this_week");
}, []);
```

---

## Part 2: Combined Status Filter with Submenus (NEW)

### Current State
A single Select dropdown with booking statuses only.

### New Implementation
Replace the Select with a DropdownMenu containing two subcategories (Bookings, Payments) with multi-select checkboxes:

```tsx
// State for multi-select filters
const [bookingStatuses, setBookingStatuses] = useState<Set<string>>(new Set(["all"]));
const [paymentStatuses, setPaymentStatuses] = useState<Set<string>>(new Set(["all"]));

// Toggle handlers
const toggleBookingStatus = (status: string) => {
  const newSet = new Set(bookingStatuses);
  if (status === "all") {
    newSet.clear();
    newSet.add("all");
  } else {
    newSet.delete("all");
    if (newSet.has(status)) {
      newSet.delete(status);
      if (newSet.size === 0) newSet.add("all");
    } else {
      newSet.add(status);
    }
  }
  setBookingStatuses(newSet);
};

const togglePaymentStatus = (status: string) => {
  const newSet = new Set(paymentStatuses);
  if (status === "all") {
    newSet.clear();
    newSet.add("all");
  } else {
    newSet.delete("all");
    if (newSet.has(status)) {
      newSet.delete(status);
      if (newSet.size === 0) newSet.add("all");
    } else {
      newSet.add(status);
    }
  }
  setPaymentStatuses(newSet);
};
```

### Dropdown Menu UI

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" className="w-[180px] justify-between">
      <span>All statuses</span>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="w-[200px]">
    {/* Bookings Submenu */}
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Calendar className="w-4 h-4 mr-2" />
        Bookings
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuCheckboxItem
          checked={bookingStatuses.has("all")}
          onCheckedChange={() => toggleBookingStatus("all")}
        >
          All Bookings
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={bookingStatuses.has("scheduled")}
          onCheckedChange={() => toggleBookingStatus("scheduled")}
        >
          Scheduled
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={bookingStatuses.has("started")}
          onCheckedChange={() => toggleBookingStatus("started")}
        >
          In Progress
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={bookingStatuses.has("paused")}
          onCheckedChange={() => toggleBookingStatus("paused")}
        >
          Paused
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={bookingStatuses.has("completed")}
          onCheckedChange={() => toggleBookingStatus("completed")}
        >
          Completed
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={bookingStatuses.has("cancelled")}
          onCheckedChange={() => toggleBookingStatus("cancelled")}
        >
          Cancelled
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={bookingStatuses.has("no_show")}
          onCheckedChange={() => toggleBookingStatus("no_show")}
        >
          No Show
        </DropdownMenuCheckboxItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>

    {/* Payments Submenu */}
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <DollarSign className="w-4 h-4 mr-2" />
        Payments
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuCheckboxItem
          checked={paymentStatuses.has("all")}
          onCheckedChange={() => togglePaymentStatus("all")}
        >
          All Payments
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={paymentStatuses.has("paid")}
          onCheckedChange={() => togglePaymentStatus("paid")}
        >
          Full
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={paymentStatuses.has("partial")}
          onCheckedChange={() => togglePaymentStatus("partial")}
        >
          Partial
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={paymentStatuses.has("unpaid")}
          onCheckedChange={() => togglePaymentStatus("unpaid")}
        >
          None
        </DropdownMenuCheckboxItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  </DropdownMenuContent>
</DropdownMenu>
```

### Trigger Display Logic
Show selected filters in the trigger button:

```tsx
const getFilterLabel = () => {
  const bookingLabel = bookingStatuses.has("all") 
    ? "" 
    : `${bookingStatuses.size} booking${bookingStatuses.size > 1 ? "s" : ""}`;
  const paymentLabel = paymentStatuses.has("all") 
    ? "" 
    : `${paymentStatuses.size} payment${paymentStatuses.size > 1 ? "s" : ""}`;
  
  if (!bookingLabel && !paymentLabel) return "All statuses";
  return [bookingLabel, paymentLabel].filter(Boolean).join(", ");
};
```

---

## Part 3: Schedule vs Reschedule Action

Update `getAvailableActions` to pass `isUnscheduled` flag:

```typescript
const getAvailableActions = (status: AppointmentStatus, isUnscheduled: boolean) => {
  const actions: string[] = [];
  switch (status) {
    case "scheduled":
      actions.push("start", "reminder");
      if (canCancelReschedule) {
        actions.push(isUnscheduled ? "schedule" : "reschedule", "cancel");
      }
      break;
    // ... other cases
  }
  return actions;
};
```

In dropdown menu:
```tsx
{actions.includes("schedule") && (
  <DropdownMenuItem onClick={() => handleAction("schedule", apt)}>
    <Calendar className="w-4 h-4 mr-2" />
    Schedule
  </DropdownMenuItem>
)}
{actions.includes("reschedule") && (
  <DropdownMenuItem onClick={() => handleAction("reschedule", apt)}>
    <RotateCcw className="w-4 h-4 mr-2" />
    Reschedule
  </DropdownMenuItem>
)}
```

---

## Part 4: Unscheduled View - Payment Status Cards

Replace 2-card grid with 5-card horizontal scrollable container:

```tsx
{activeTab === "unscheduled" && (
  <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
    {/* Total */}
    <Card className="bg-muted border-border min-w-[140px] flex-shrink-0">...</Card>
    
    {/* Paid */}
    <Card className="bg-success/5 border-success/20 min-w-[140px] flex-shrink-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success/10">
            <Check className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-xl font-semibold">{unscheduledStats.paidCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
    
    {/* Unpaid */}
    <Card className="bg-destructive/5 border-destructive/20 min-w-[140px] flex-shrink-0">...</Card>
    
    {/* Partial */}
    <Card className="bg-amber-500/5 border-amber-500/20 min-w-[140px] flex-shrink-0">...</Card>
    
    {/* Gifted */}
    <Card className="bg-purple-500/5 border-purple-500/20 min-w-[140px] flex-shrink-0">...</Card>
  </div>
)}
```

---

## Part 5: Scheduled View - Amount Due Column & Card

### Amount Due Stat Card
```tsx
<Card className="bg-destructive/5 border-destructive/20 min-w-[160px] flex-shrink-0">
  <CardContent className="p-4">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-destructive/10">
        <DollarSign className="w-5 h-5 text-destructive" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Amount Due</p>
        <p className="text-xl font-semibold">{formatCurrency(scheduledStats.amountDue, currency)}</p>
      </div>
    </div>
  </CardContent>
</Card>
```

### Amount Due Table Column
```tsx
<TableHead>Amount Due</TableHead>

// In row:
<TableCell>
  {(() => {
    const amountDue = (apt.total_amount || 0) - (apt.amount_paid || 0);
    if (amountDue <= 0) {
      return <Badge variant="outline" className="text-success border-success/50">Paid</Badge>;
    }
    return <span className="font-medium text-destructive">{formatCurrency(amountDue, currency)}</span>;
  })()}
</TableCell>
```

---

## Part 6: Scrollbar Hide CSS

Add to `src/index.css`:

```css
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

---

## Part 7: Hook Updates

### useAppointments
- Accept `startDate` and `endDate` for date range filtering
- Accept `bookingStatuses: string[]` for multi-select booking filter
- Accept `paymentStatuses: string[]` for multi-select payment filter

### useAppointmentStats
- Accept date range
- Return `paidCount`, `unpaidCount`, `partialCount` for unscheduled
- Return `amountDue` sum for scheduled

---

## Part 8: Staff Invitation RLS Fix

Create `validate-staff-invitation` edge function that uses service role to bypass RLS and validate tokens for anonymous users.

---

## Part 9: Custom Email Verification

Replace Supabase default emails with Salon Magik branding:
- Trigger `send-email-verification` after signup
- Create `/verify-email` route and `VerifyEmailPage`
- Create `verify-email` edge function

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/salon/AppointmentsPage.tsx` | EDIT | Add date range dropdown in card, date range pickers, combined status filter with submenus, schedule vs reschedule, amount due column, scrollable cards |
| `src/hooks/useAppointmentStats.tsx` | EDIT | Accept date range, add payment status counts, amount due |
| `src/hooks/useAppointments.tsx` | EDIT | Support date range, multi-select booking/payment filters |
| `src/index.css` | EDIT | Add `.scrollbar-hide` utility |
| `supabase/functions/validate-staff-invitation/index.ts` | CREATE | Secure token validation |
| `src/pages/auth/AcceptInvitePage.tsx` | EDIT | Use edge function for validation |
| `supabase/functions/verify-email/index.ts` | CREATE | Email verification handler |
| `src/pages/auth/VerifyEmailPage.tsx` | CREATE | Verification callback page |
| `src/pages/auth/SignupPage.tsx` | EDIT | Trigger custom verification |
| `src/App.tsx` | EDIT | Add /verify-email route |

---

## Visual Summary

### Combined Status Filter Dropdown

```
+---------------------------+
| All statuses           ▼  |
+---------------------------+
         ↓ click
+---------------------------+
| 📅 Bookings           ▶   | ───→ +-------------------+
| $ Payments            ▶   |      | ☑ All Bookings    |
+---------------------------+      | ───────────────── |
                                   | ☑ Scheduled       |
         ↓ hover Payments          | ☐ In Progress     |
+-------------------+              | ☐ Paused          |
| ☑ All Payments    |              | ☐ Completed       |
| ───────────────── |              | ☐ Cancelled       |
| ☐ Full            |              | ☐ No Show         |
| ☐ Partial         |              +-------------------+
| ☐ None            |
+-------------------+
```

### Scheduled View Cards (Horizontal Scroll)
```
+------------------+------------------+------------------+------------------+------------------+
| [📅]             | [$]              | [🎁]             | [❌]             | [🔄]             |
| This Week ▼      | Amount Due       | Gifted           | Cancelled        | Rescheduled      |
| 24               | $1,250.00        | 3                | 2                | 5                |
+------------------+------------------+------------------+------------------+------------------+
```

### Unscheduled View Cards (Horizontal Scroll)
```
+-------------+-------------+-------------+-------------+-------------+
| [📋]        | [✓]         | [✗]         | [◐]         | [🎁]        |
| Total       | Paid        | Unpaid      | Partial     | Gifted      |
| 15          | 8           | 4           | 2           | 1           |
+-------------+-------------+-------------+-------------+-------------+
```

---

## Testing Checklist

### Appointments Page
- [ ] Date range dropdown in card changes filter (Today, This Week, This Month, Last 60 Days)
- [ ] Default selection is "This Week" on page load
- [ ] Date range pickers sync with dropdown selection
- [ ] Manual date picker changes clear preset
- [ ] Combined status filter shows Bookings submenu on hover
- [ ] Combined status filter shows Payments submenu on hover
- [ ] Multiple booking statuses can be selected
- [ ] Multiple payment statuses can be selected
- [ ] Selecting "All" clears individual selections
- [ ] Stat cards reflect the selected date range
- [ ] Scheduled view shows "Amount Due" column
- [ ] Unscheduled view shows Paid, Unpaid, Partial, Gifted cards
- [ ] Cards scroll horizontally with invisible scrollbar
- [ ] Table scrolls vertically with invisible scrollbar
- [ ] Unscheduled appointments show "Schedule" action
- [ ] Scheduled appointments show "Reschedule" action

### Staff Invitation
- [ ] Invitation link works (not "Invalid or Expired")

### Email Verification
- [ ] Signup triggers Salon Magik branded email

