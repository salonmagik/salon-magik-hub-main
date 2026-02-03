
# Implementation Plan: Payments Page Tabs, Settings Toggles & Functional Audit

This plan addresses all non-functional areas identified in the salon platform, making all features fully operational with real backend interactions.

---

## Summary of Issues Found

| Issue | Location | Status |
|-------|----------|--------|
| Payments page tabs (All, Revenue, Refunds, Purse) - no dedicated TabsContent | `PaymentsPage.tsx` | Needs TabsContent structure |
| "Require deposits for bookings" shows Badge not Toggle | `SettingsPage.tsx` line 787-789 | Convert to Switch |
| Notifications settings - Save button disabled, doesn't save to backend | `SettingsPage.tsx` line 567 | Integrate `useNotificationSettings` hook |
| Integrations tab shows "coming soon" | `SettingsPage.tsx` line 1027 | Placeholder (acceptable for now) |
| Date range filter in Payments page is non-functional | `PaymentsPage.tsx` | Make filter work |

---

## Phase 1: Payments Page - Define TabsContent for Each Tab

**Current Issue:** The tabs work by filtering `filteredTransactions` but there's no dedicated `TabsContent` component for each tab. The UI is functional but lacks proper tab structure.

**Solution:** Restructure to use proper `TabsContent` components for cleaner organization and potentially add tab-specific features.

### Changes to `PaymentsPage.tsx`:
1. Wrap content in proper `TabsContent` components
2. Add specific empty states for each tab type
3. Make date range filter functional

```tsx
// Add state for date filter
const [dateFilter, setDateFilter] = useState("all-time");

// Compute date range based on filter
const getDateRange = () => {
  const now = new Date();
  switch (dateFilter) {
    case "today":
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { start: today, end: now };
    case "week":
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      return { start: weekStart, end: now };
    case "month":
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - 1);
      return { start: monthStart, end: now };
    default:
      return null;
  }
};

// Apply date filtering
const dateRange = getDateRange();
const dateFilteredTransactions = transactions.filter((txn) => {
  if (!dateRange) return true;
  const txnDate = new Date(txn.created_at);
  return txnDate >= dateRange.start && txnDate <= dateRange.end;
});

// Then filter by tab type
```

### Tab-Specific Empty States:
- **All:** "No transactions found"
- **Revenue:** "No payments recorded yet"
- **Refunds:** "No refunds processed"
- **Purse:** "No purse activity yet"

---

## Phase 2: Deposits Toggle in Settings

**Current Issue (line 780-790):**
```tsx
<div className="flex items-center justify-between py-2">
  <div>
    <p className="font-medium">Deposits</p>
    <p className="text-sm text-muted-foreground">
      Require deposits for bookings
    </p>
  </div>
  <Badge variant="outline" className="text-success">
    {currentTenant?.deposits_enabled ? "Enabled" : "Disabled"}
  </Badge>
</div>
```

**Solution:** Replace Badge with Switch (like Pay at Salon toggle):
```tsx
<Switch
  checked={currentTenant?.deposits_enabled || false}
  onCheckedChange={async (checked) => {
    if (!currentTenant?.id) return;
    try {
      const { error } = await supabase
        .from("tenants")
        .update({ deposits_enabled: checked })
        .eq("id", currentTenant.id);
      if (error) throw error;
      await refreshTenants();
      toast({ title: "Saved", description: `Deposits ${checked ? "enabled" : "disabled"}` });
    } catch (err) {
      console.error("Error updating deposits:", err);
      toast({ title: "Error", description: "Failed to update setting", variant: "destructive" });
    }
  }}
/>
```

---

## Phase 3: Make Notifications Settings Functional

**Current Issues:**
1. Settings page uses local `notificationSettings` state but doesn't load from or save to database
2. Save button is `disabled` (line 567)
3. `useNotificationSettings` hook exists but isn't used in SettingsPage

**Solution:**

### 3.1 Import and use the existing hook:
```tsx
import { useNotificationSettings } from "@/hooks/useNotificationSettings";

// Inside component:
const { 
  settings: dbNotificationSettings, 
  isLoading: notificationsLoading, 
  isSaving: notificationsSaving, 
  saveSettings: saveNotificationSettings 
} = useNotificationSettings();
```

### 3.2 Initialize local state from hook data:
```tsx
// Sync local state with database on load
useEffect(() => {
  if (dbNotificationSettings) {
    setNotificationSettings({
      emailAppointmentReminders: dbNotificationSettings.email_appointment_reminders,
      smsAppointmentReminders: dbNotificationSettings.sms_appointment_reminders,
      emailNewBookings: dbNotificationSettings.email_new_bookings,
      emailCancellations: dbNotificationSettings.email_cancellations,
      emailDailyDigest: dbNotificationSettings.email_daily_digest,
    });
  }
}, [dbNotificationSettings]);
```

### 3.3 Create save handler:
```tsx
const handleNotificationsSave = async () => {
  await saveNotificationSettings({
    email_appointment_reminders: notificationSettings.emailAppointmentReminders,
    sms_appointment_reminders: notificationSettings.smsAppointmentReminders,
    email_new_bookings: notificationSettings.emailNewBookings,
    email_cancellations: notificationSettings.emailCancellations,
    email_daily_digest: notificationSettings.emailDailyDigest,
  });
};
```

### 3.4 Update the Save button (line 566-571):
```tsx
<Button onClick={handleNotificationsSave} disabled={notificationsSaving}>
  {notificationsSaving ? (
    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
  ) : (
    <Save className="w-4 h-4 mr-2" />
  )}
  Save preferences
</Button>
```

---

## Phase 4: Audit and Fix Other Non-Functional Areas

### 4.1 Settings - Integrations Tab
**Current:** Shows "This section is coming soon."
**Decision:** Leave as placeholder - integrations (like Google Calendar, WhatsApp) are future roadmap items.

### 4.2 Settings - Roles Tab
**Current:** Display-only, says "Custom roles are not yet supported"
**Decision:** Leave as display-only - role management is informational for now.

### 4.3 Settings - Subscription "Upgrade Now" Button
**Current:** Button exists but no action
**Decision:** Leave as-is - Stripe subscription management is a separate feature.

### 4.4 Payments Page Export Button
**Current:** Export button exists but no functionality
**Solution:** Implement CSV export like in Reports page:
```tsx
const handleExport = () => {
  const csvContent = [
    ["Date", "Customer", "Type", "Method", "Amount", "Status"],
    ...filteredTransactions.map((txn) => [
      format(new Date(txn.created_at), "yyyy-MM-dd HH:mm"),
      txn.customer?.full_name || "Guest",
      txn.type,
      txn.method,
      Number(txn.amount).toFixed(2),
      txn.status,
    ]),
  ]
    .map((row) => row.join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/salon/PaymentsPage.tsx` | Add TabsContent structure, functional date filter, export functionality |
| `src/pages/salon/SettingsPage.tsx` | Deposits toggle, notifications backend integration |

---

## Implementation Order

| Step | Task | Priority |
|------|------|----------|
| 1 | Convert Deposits setting to toggle | High |
| 2 | Integrate useNotificationSettings into SettingsPage | High |
| 3 | Make date range filter functional in PaymentsPage | Medium |
| 4 | Add proper TabsContent structure to PaymentsPage | Medium |
| 5 | Add CSV export to PaymentsPage | Medium |

---

## Technical Notes

### Notification Settings Database Mapping

| Local State Key | Database Column |
|-----------------|-----------------|
| `emailAppointmentReminders` | `email_appointment_reminders` |
| `smsAppointmentReminders` | `sms_appointment_reminders` |
| `emailNewBookings` | `email_new_bookings` |
| `emailCancellations` | `email_cancellations` |
| `emailDailyDigest` | `email_daily_digest` |

### Date Filter Logic
The date filter will use client-side filtering since transactions are already fetched. For large datasets, this could be moved to the `useTransactions` hook with server-side filtering.
