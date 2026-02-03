
## Goal
Stop the “Maximum update depth exceeded” crash that happens **on page load** (especially on `/salon/appointments`) and eliminate the related **“Function components cannot be given refs”** warnings.

## What the evidence points to
1. You confirmed the crash happens **on page load** (before interacting with Walk-in / Draw).
2. Your console warnings consistently mention:
   - `AlertDialogContent` (from `src/components/ui/alert-dialog.tsx`)
   - `InactivityGuard` (from `src/components/session/InactivityGuard.tsx`)
3. The runtime error stack includes `setRef` and `Array.map` inside Radix’s ref-composition utilities, which is a classic signature of:
   - A ref callback being re-created repeatedly, causing Radix to re-run a `setState` inside a ref handler, which triggers another render, which triggers the ref again, etc.

Given the warnings and the fact this happens on page load, the most likely trigger is the **two AlertDialogs rendered on every page** inside `InactivityGuard` (which is mounted by `SalonSidebar` around all salon pages).

## Root causes to address
### A) AlertDialog components mount even when “closed”
`InactivityGuard` always renders both `<AlertDialog ...>` trees, even when `showWarning` and `showLogout` are false. Depending on Radix/React behavior, parts of the dialog subtree can still mount/measure/compose refs, which can trigger the ref loop.

### B) `InactivityGuard` re-renders extremely frequently
Right now, the activity listeners can call `setLastActivity(Date.now())` on mousemove/click/etc (even if guarded by `showWarning/showLogout`), which can cause rapid re-renders. This doesn’t directly create “maximum update depth” by itself, but it can amplify any ref-related loop and makes debugging harder.

### C) `AlertDialog` wrapper likely has a ref-forwarding mismatch in practice
Even though `src/components/ui/alert-dialog.tsx` uses `forwardRef`, the runtime warning indicates some component in that render path is still receiving a `ref` but is not ref-forwarding the way Radix expects. We should harden this file to match the stable shadcn/radix patterns.

---

## Implementation plan (what I will change)

### 1) Make `InactivityGuard` dialogs “mount only when needed”
Change `InactivityGuard` so the dialogs are rendered only when they are actually visible.

**Before (current):**
- Dialog trees always rendered; `open` just toggles state.

**After (planned):**
- Render Warning dialog only when `showWarning === true`
- Render Logout dialog only when `showLogout === true`

This prevents any Radix dialog/ref machinery from running on initial page load when both are false.

**Behavior detail**
- When `showWarning` flips true, the dialog mounts and shows.
- When the dialog closes (outside click/escape/button), it calls `setShowWarning(false)` and unmounts.

### 2) Refactor inactivity tracking to avoid state updates on every activity event
Replace `lastActivity` **state** with `lastActivityRef` (a `useRef`), so mousemove/keydown does not cause React re-renders.

Planned changes:
- `const lastActivityRef = useRef(Date.now())`
- Event handler updates `lastActivityRef.current = Date.now()` instead of `setLastActivity(...)`
- The “check inactivity” interval reads from `lastActivityRef.current`

This makes the app stable/performance-friendly and removes a major “re-render pressure” source.

### 3) Prevent repeated state setting once logout state is active
Currently, once inactive time passes `logoutMs`, the “check inactivity” interval will keep running every second and can keep doing:
- `setShowLogout(true)`
- `setCountdown(60)`

Even if React bails out on `setShowLogout(true)` (same value), `setCountdown(60)` can keep forcing renders and can conflict with the countdown-decrement effect.

Planned logic:
- When `showLogout` is already true, don’t re-trigger the “enter logout mode” logic.
- Only initialize countdown to 60 **once** when transitioning into logout mode.

### 4) Harden `src/components/ui/alert-dialog.tsx` to eliminate ref warnings
Even if conditional mounting fixes the crash, we also want to remove the underlying “refs” warning.

I will:
- Ensure every exported wrapper that Radix may ref (Overlay, Content, Action, Cancel) is `forwardRef` and passes `ref` to the Radix primitive consistently.
- Align the structure with the already-working `src/components/ui/dialog.tsx` pattern (Portal → Overlay → Content with children rendered explicitly).
- Confirm we are not accidentally passing refs to any non-ref component in this file.

### 5) Verification steps (regression testing)
After implementing:
1. Hard refresh the app and load `/salon/appointments`:
   - No blank screen
   - No “Maximum update depth exceeded”
   - No “Function components cannot be given refs” warning
2. Navigate across several pages (Dashboard, Customers, Services, Appointments) to confirm stability.
3. Force-test the dialogs by temporarily setting (locally in code) `warningMinutes`/`logoutMinutes` to very small numbers (e.g., 0.01 and 0.02) to verify:
   - Warning dialog opens
   - “Stay Logged In” closes it and resets timers
   - Logout dialog opens and countdown decreases (and doesn’t reset back to 60 every second)
4. Confirm opening Walk-in + Draw still works (to ensure the earlier DrawingCanvas fix remains good).

---

## Files that will be modified
- `src/components/session/InactivityGuard.tsx`
  - Conditional mount dialogs
  - Replace lastActivity state with ref
  - Fix interval logic to avoid repeated state resets
  - Use stable callbacks for handlers
- `src/components/ui/alert-dialog.tsx`
  - Ref-forwarding hardening + structural alignment to proven dialog wrapper patterns

---

## Why this plan should work
- The crash signature (setRef → dispatchSetState → nested updates) strongly suggests a ref-driven render loop.
- The ref warning specifically calls out the AlertDialog path.
- By **removing the dialog subtree from initial render** and **reducing re-render pressure**, we eliminate the conditions required for this loop to occur, and also fix the root ref warning so it does not return later.

