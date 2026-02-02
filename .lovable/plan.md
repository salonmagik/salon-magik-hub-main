

# Mobile Responsiveness & UX Overhaul Plan

## Issues Identified

Based on the screenshot and code review, I've identified the following problems:

### 1. Dialog Modal Issues
- **Full-screen stretch on mobile**: The `DialogContent` component lacks proper mobile margin/padding. Currently it uses `w-full max-w-lg` but on mobile (smaller than `sm:` breakpoint), the modal takes the entire screen width with no margins, and there's no max-height constraint causing the form to stretch vertically
- **Desktop asymmetric margins**: The centering uses `left-[50%] translate-x-[-50%]` which should center correctly, but there may be padding issues causing visual asymmetry

### 2. Quick Create Button Hidden on Mobile
- In `SalonSidebar.tsx` line 331-342, the Quick Create button has `hidden sm:flex` which completely hides it on mobile devices
- Mobile users lose access to the quick actions functionality

### 3. Appointments Page Missing Walk-in Button
- The page only has one "New appointment" button
- Per PRD, there should be two distinct buttons: "Schedule" and "Walk-in"

### 4. Settings Page Not Responsive
- Uses fixed `w-64` sidebar navigation that doesn't adapt to mobile
- Uses static `grid-cols-2` layouts without responsive breakpoints
- On mobile, the side-by-side layout doesn't stack

### 5. Form Grid Responsiveness
- Several forms in dialogs and pages use `grid-cols-2` without `grid-cols-1 sm:grid-cols-2` pattern

---

## Implementation Plan

### Step 1: Fix DialogContent Base Component
Update `src/components/ui/dialog.tsx` to improve mobile responsiveness:
- Add horizontal margins on mobile: `mx-4` for mobile, `mx-0` for larger screens
- Add max-height with overflow scrolling: `max-h-[90vh] overflow-y-auto`
- Ensure proper rounded corners on mobile: `rounded-lg` always (not just `sm:rounded-lg`)

### Step 2: Add Quick Create FAB on Mobile
Update `src/components/layout/SalonSidebar.tsx`:
- Change the header Quick Create button to be visible on all screens (remove `hidden sm:flex`)
- OR add a floating action button (FAB) for mobile at bottom-right
- Show text label on larger screens, just icon on mobile

### Step 3: Add Walk-in Button to Appointments Page
Update `src/pages/salon/AppointmentsPage.tsx`:
- Split the single "New appointment" button into two buttons:
  - Primary: "Schedule appointment" (opens ScheduleAppointmentDialog)
  - Secondary/Outline: "Walk-in" (opens WalkInDialog)
- Add responsive layout: side-by-side on desktop, stacked on mobile

### Step 4: Make Settings Page Fully Responsive
Update `src/pages/salon/SettingsPage.tsx`:
- Convert side navigation to horizontal tabs on mobile (or collapsible accordion)
- Add responsive grid breakpoints to all form layouts
- Stack form fields vertically on mobile

### Step 5: Responsive Form Grids Across All Dialogs
Audit and fix remaining files with hardcoded `grid-cols-2`:
- `src/components/onboarding/ProfileStep.tsx`
- `src/components/onboarding/BusinessStep.tsx`
- `src/components/onboarding/LocationsStep.tsx`
- `src/components/onboarding/ReviewStep.tsx`
- `src/components/dialogs/QuickCreateDialog.tsx` (2-column grid may be fine here but should verify)

---

## Technical Details

### Dialog Component Changes
```text
Current:
fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] ... sm:rounded-lg

Updated:
fixed inset-4 sm:inset-auto sm:left-[50%] sm:top-[50%] z-50 grid w-auto sm:w-full max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg ...
```

This approach:
- On mobile: Uses `inset-4` for 16px margin on all sides, natural positioning
- On desktop: Uses the centered positioning with transforms
- Both: Proper max-height and scroll

### Quick Create Mobile Access
Two options:
1. **Floating Action Button** - Add a fixed FAB at bottom-right on mobile
2. **Always visible button** - Simply show the Quick Create button in header on all screens

I recommend Option 2 (always visible) for simplicity and discoverability.

### Settings Page Mobile Layout
```text
Current: flex gap-6 with fixed w-64 sidebar

Updated:
- Use flex-col on mobile, flex-row on lg screens
- Convert sidebar to horizontal scrollable tabs on mobile
- OR use a Select dropdown to switch between sections on mobile
```

The Select dropdown approach is cleaner for mobile and matches common mobile patterns.

---

## Files to Modify

1. `src/components/ui/dialog.tsx` - Core mobile responsiveness fix
2. `src/components/layout/SalonSidebar.tsx` - Show Quick Create on mobile
3. `src/pages/salon/AppointmentsPage.tsx` - Add Walk-in button + responsive header
4. `src/pages/salon/SettingsPage.tsx` - Full mobile layout refactor
5. `src/components/onboarding/ProfileStep.tsx` - Responsive grids
6. `src/components/onboarding/BusinessStep.tsx` - Responsive grids
7. `src/components/onboarding/LocationsStep.tsx` - Responsive grids
8. `src/components/onboarding/ReviewStep.tsx` - Responsive grids

---

## Expected Outcome

After implementation:
- Dialogs will have proper margins on mobile with scrollable content
- Quick Create will be accessible on all screen sizes
- Appointments page will have both Schedule and Walk-in buttons
- Settings page will work seamlessly on mobile devices
- All form grids will stack properly on small screens
- The entire application will feel polished on mobile devices

