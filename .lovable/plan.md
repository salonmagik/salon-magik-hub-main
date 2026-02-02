

# Fix Date/Time Input Sizing on Mobile

## Problem Analysis

Looking at the current `ScheduleAppointmentDialog.tsx` code (lines 189-222), I can see the issues:

1. **Date and Time inputs are too wide on mobile**: The `grid-cols-1 sm:grid-cols-3` causes inputs to take full width on mobile devices
2. **No explicit height control**: While the base `Input` component has `h-10`, native date/time pickers on mobile (especially iOS) tend to override this
3. **Duration is separated but still using full width**: The Duration input is in its own div but takes up the entire row width

## Root Cause

The issue is that native date and time inputs on mobile browsers (especially Safari iOS) tend to:
- Expand their height beyond the specified `h-10`
- Take full width when in a single-column grid
- Have inconsistent sizing compared to text inputs

## Solution

### Step 1: Restructure the Layout

Keep Date and Start Time together in a 2-column grid that persists even on mobile, then have Duration in a separate section. This prevents date/time from being full-width on mobile:

```text
Current layout on mobile:
[    Date (full width)     ]
[    Time (full width)     ]
[    Duration (full width) ]

Proposed layout on mobile:
[ Date      ] [ Time      ]
[    Duration (full width) ]
```

### Step 2: Apply Explicit Height and Width Constraints

Add explicit classes to the date and time inputs:
- `h-10` - Enforce consistent height
- `text-sm` - Keep text size consistent
- Optionally `max-w-full` to prevent overflow

### Step 3: Apply Same Pattern to Other Dialogs

Check and fix similar issues in:
- `AppointmentActionsDialog.tsx` (lines 162-180 for reschedule date/time)
- Any other dialogs with date/time inputs

---

## Technical Implementation

### ScheduleAppointmentDialog.tsx Changes

**Lines 189-222** will be refactored to:

```tsx
{/* Date & Time Row - 2 columns even on mobile for compact sizing */}
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label>
      Date <span className="text-destructive">*</span>
    </Label>
    <Input
      type="date"
      className="h-10 text-sm"
      value={formData.date}
      onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
      min={new Date().toISOString().split("T")[0]}
    />
  </div>
  <div className="space-y-2">
    <Label>
      Start time <span className="text-destructive">*</span>
    </Label>
    <Input
      type="time"
      className="h-10 text-sm"
      value={formData.startTime}
      onChange={(e) => setFormData((prev) => ({ ...prev, startTime: e.target.value }))}
    />
  </div>
</div>

{/* Duration - Separate section */}
<div className="space-y-2">
  <Label>Duration (mins)</Label>
  <Input
    type="number"
    className="h-10 text-sm"
    value={formData.duration}
    onChange={(e) => setFormData((prev) => ({ ...prev, duration: e.target.value }))}
    min="15"
    step="15"
  />
</div>
```

### AppointmentActionsDialog.tsx Changes

Apply the same `h-10 text-sm` classes to the reschedule date/time inputs at lines 162-190.

---

## Files to Modify

1. `src/components/dialogs/ScheduleAppointmentDialog.tsx`
   - Restructure Date/Time grid to `grid-cols-2` (persistent on all screens)
   - Keep Duration in separate div (already done, just needs height constraint)
   - Add `h-10 text-sm` to all three inputs

2. `src/components/dialogs/AppointmentActionsDialog.tsx`
   - Add `h-10 text-sm` to date, time, and duration inputs in reschedule section

---

## Expected Result

After implementation:
- Date and Time inputs will be side-by-side even on mobile (more compact)
- All inputs will have consistent `h-10` height that overrides native picker stretching
- Duration will be visually separated in its own row
- The form will look consistent across all device sizes

