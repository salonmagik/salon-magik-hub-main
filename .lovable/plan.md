
# Appointment Details Modal Scrollability Fix

Adding this fix to the existing Booking Platform Polish plan.

---

## Problem

The `AppointmentDetailsDialog` uses `ScrollArea` (line 181) but scrolling doesn't work because:

1. The `ScrollArea` with `flex-1` needs `min-h-0` to allow it to shrink below its content size in a flex container
2. Radix ScrollArea's viewport needs the parent to have a constrained height

---

## Solution

Update the `ScrollArea` wrapper to include `min-h-0` and `overflow-hidden`:

**Current (line 181):**
```tsx
<ScrollArea className="flex-1 pr-4">
```

**Fixed:**
```tsx
<ScrollArea className="flex-1 min-h-0 overflow-hidden">
  <div className="pr-4">
    {/* content */}
  </div>
</ScrollArea>
```

The `min-h-0` is crucial - in flexbox, the default `min-height: auto` prevents flex items from shrinking below their content size. By setting `min-h-0`, we allow the ScrollArea to shrink and enable scrolling.

Also move `pr-4` (padding-right) inside the content div so the scrollbar isn't offset.

---

## File to Update

| File | Change |
|------|--------|
| `src/components/dialogs/AppointmentDetailsDialog.tsx` | Add `min-h-0` to ScrollArea, restructure padding |

---

## Combined with Booking Platform Polish

This fix will be implemented alongside the other booking platform improvements:
1. Apply brand color to UI elements
2. Fix "No available times" bug
3. Redesign item cards to square-like layout
4. Add search, sort, and "All" tab
5. **Fix AppointmentDetailsDialog scrollability** (this item)
