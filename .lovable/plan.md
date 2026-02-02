
# Calendar & Date Input Improvements

## Overview
This plan addresses two key issues:
1. Date input text spilling out of the button on small screens
2. Calendar views need better mobile UX with wider columns, horizontal scrolling, click-to-view details, and hover summaries

---

## Issue 1: Date Picker Text Overflow

### Problem
The DatePicker button displays dates in `PPP` format (e.g., "February 2, 2026") which can overflow on narrow mobile screens, causing text to spill outside the button.

### Solution
Add CSS text containment properties to prevent overflow:
- `overflow-hidden` to clip overflowing content
- `text-overflow: ellipsis` to show `...` when truncated  
- `whitespace-nowrap` to prevent text wrapping
- Use a shorter date format for display (e.g., `MMM d, yyyy` = "Feb 2, 2026")

### File Changes
**`src/components/ui/date-picker.tsx`**
- Change format from `PPP` (February 2nd, 2026) to `MMM d, yyyy` (Feb 2, 2026)
- Add `truncate` class to the button text content
- Ensure button has proper flex/min-width constraints

---

## Issue 2: Calendar Mobile Enhancements

### Requirements
1. Wider day columns with horizontal scrolling on mobile
2. Click on appointment items to show details dialog
3. Hover on appointment items shows summary tooltip with "view more" CTA
4. Apply to Day, Week, and Month views

### Solution Architecture

#### A. Horizontal Scrolling with Fixed-Width Columns
- Wrap calendar grids in a scroll container
- Set minimum widths per column:
  - **Day View**: No change needed (already full-width)
  - **Week View**: Each day column gets `min-w-[140px]` (total 980px minimum, scrollable)
  - **Month View**: Each day cell gets `min-w-[100px]` (total 700px minimum, scrollable)
- Parent container uses `overflow-x-auto` to enable horizontal scroll

#### B. Appointment Details Dialog
- Create a new `AppointmentDetailsDialog` component for viewing appointment info
- State management: `selectedAppointment` and `detailsDialogOpen`
- Shows: Customer name, phone, services, scheduled time, status, notes
- Includes a "Go to Appointment" button to navigate to the Appointments page

#### C. Hover Summary with Tooltip
- Use the existing `HoverCard` component from Radix UI
- On hover (desktop only), show a compact summary:
  - Customer name
  - Service name
  - Start time
  - Status badge
  - Underlined "View more" CTA that opens the details dialog
- On mobile, only click interaction is available (no hover)

### File Changes

**New: `src/components/dialogs/AppointmentDetailsDialog.tsx`**
- Read-only dialog showing full appointment information
- Props: `open`, `onOpenChange`, `appointment: CalendarAppointment`
- Displays:
  - Customer name and phone
  - Service(s) and duration
  - Scheduled date/time
  - Status with color badge
  - Notes (if any)
- Footer with "Close" and "Go to Appointments" buttons

**Updated: `src/pages/salon/CalendarPage.tsx`**
- Import the new `AppointmentDetailsDialog`
- Add state for `selectedAppointment` and `detailsDialogOpen`
- Update `AppointmentBlock` component to:
  - Accept `onClick` handler
  - Wrap content in `HoverCard` for hover tooltip
  - Show summary card on hover with "View more" link
- Update `DayView` to pass click handler to AppointmentBlock
- Update `WeekView`:
  - Change grid container to have scrollable wrapper with `min-w-[980px]`
  - Pass click handler to AppointmentBlock
- Update `MonthView`:
  - Change grid container to have scrollable wrapper with `min-w-[700px]`  
  - Pass click handler to appointment items
  - Add hover cards to month view items

---

## Technical Details

### AppointmentBlock Component Changes
```text
Current: Simple div with appointment info
New: 
  - Wrapped in HoverCard for desktop hover
  - onClick handler to open details dialog
  - cursor-pointer for clickable indication
```

### Week View Grid Structure
```text
Current: grid-cols-7 (7 equal columns, shrinks on mobile)
New:
  <div className="overflow-x-auto">
    <div className="min-w-[980px] grid grid-cols-7">
      {/* Day columns with min-w-[140px] each */}
    </div>
  </div>
```

### Month View Grid Structure
```text
Current: grid-cols-7 (7 equal columns, squished on mobile)
New:
  <div className="overflow-x-auto">
    <div className="min-w-[700px]">
      {/* Header and weeks grid with min-w-[100px] cells */}
    </div>
  </div>
```

### HoverCard Content
```text
- Customer: {name}
- Service: {service_name}
- Time: {formatted_time}
- Status: {badge}
- [View more] (underlined link)
```

---

## Implementation Order
1. Fix DatePicker text overflow
2. Create AppointmentDetailsDialog component
3. Update AppointmentBlock with click handler and HoverCard
4. Update WeekView with horizontal scroll and min-widths
5. Update MonthView with horizontal scroll and min-widths
6. Update DayView (minimal changes, mainly click handling)
7. Add dialog state management to CalendarPage
