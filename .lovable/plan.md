
# Custom Date & Time Pickers for iOS Compatibility

## Problem Summary

Native HTML5 `<input type="date">` and `<input type="time">` elements on iOS Safari have inherent styling limitations that cannot be fully overridden with CSS. Despite applying `h-10` and `text-sm` classes, iOS renders these inputs with larger heights and inconsistent widths due to its native picker UI controls.

## Solution

Replace native date and time inputs with custom Shadcn-based components that provide complete styling control across all devices:

1. **Date Picker**: Use a Button + Popover + Calendar (already exists in the project)
2. **Time Picker**: Create a simple time dropdown using Select component

This approach ensures pixel-perfect control over height, width, and visual consistency on iPhone and all other devices.

---

## Files to Create

### 1. `src/components/ui/date-picker.tsx`

A reusable date picker component using:
- `Button` as the trigger (styled to match input fields)
- `Popover` + `PopoverContent` to contain the calendar
- `Calendar` component with `pointer-events-auto` for dialog compatibility
- Uses `date-fns` for formatting (already installed)

### 2. `src/components/ui/time-picker.tsx`

A reusable time picker component using:
- `Select` component with time slot options (every 15 or 30 minutes)
- Generate options from 00:00 to 23:45
- Returns value in "HH:mm" format for compatibility with existing logic

---

## Files to Modify

### 1. `src/components/dialogs/ScheduleAppointmentDialog.tsx`

Replace native inputs with custom pickers:
- Change `<Input type="date">` to `<DatePicker>`
- Change `<Input type="time">` to `<TimePicker>`
- Keep the same grid layout and labels
- Maintain the form state logic (Date stored as string, Time stored as "HH:mm")

### 2. `src/components/dialogs/AppointmentActionsDialog.tsx`

Apply the same changes for the reschedule section:
- Replace `<Input type="date">` with `<DatePicker>`
- Replace `<Input type="time">` with `<TimePicker>`

### 3. `src/components/dialogs/AddCustomerDialog.tsx`

Replace the Date of Birth native input with `<DatePicker>`:
- Remove the Calendar icon overlay (now built into the component)
- Allow past dates for DOB

### 4. `src/pages/salon/AppointmentsPage.tsx`

Replace the filter date input with `<DatePicker>` for consistency across the app.

### 5. `src/components/ui/calendar.tsx`

Add `pointer-events-auto` to ensure the calendar is clickable inside dialogs (per Shadcn best practice).

---

## Technical Implementation Details

### DatePicker Component API

```text
interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;         // For "no past dates" use case
  maxDate?: Date;         // For "no future dates" use case (DOB)
  className?: string;
}
```

### TimePicker Component API

```text
interface TimePickerProps {
  value?: string;          // "HH:mm" format
  onChange: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  step?: number;           // Minutes between options (default 15)
  className?: string;
}
```

### Form State Handling

The existing form data stores:
- `date` as `"YYYY-MM-DD"` string
- `startTime` as `"HH:mm"` string

The new components will:
- **DatePicker**: Convert between `Date` objects and `"YYYY-MM-DD"` strings
- **TimePicker**: Work directly with `"HH:mm"` strings (no conversion needed)

---

## Visual Consistency

Both custom pickers will use:
- `h-10` height to match other form inputs
- Same border, background, focus ring styles as the Input component
- Calendar icon for date picker, Clock icon for time picker
- Consistent text sizing (`text-sm`)

---

## Expected Outcome

After implementation:
- Date and Time fields will have exact `40px` height on all devices including iPhone
- Width will respect the grid layout without overflow
- Visual appearance will match other form fields perfectly
- The calendar/time dropdowns will work smoothly inside dialogs
- No more iOS Safari rendering quirks
