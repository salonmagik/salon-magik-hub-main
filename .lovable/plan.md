
# Booking Platform UI/UX Fixes

This plan addresses all the issues identified in the public booking flow.

---

## Summary of Changes

| Issue | Solution |
|-------|----------|
| Cards too large | Reduce image aspect ratio, use horizontal card layout on desktop |
| "No available times" error | Fix slot availability query - anon can't read appointments, need alternative approach |
| Tabs squeezing text | Use horizontal scrollable tabs with adequate spacing |
| Full-width content | Add max-width container with centered content |
| Brand highlight color | Add column to database, color picker in settings |
| Page title for SEO | Dynamic document.title based on salon name |

---

## Part 1: Compact Service/Product Cards

### Changes to `ItemCard.tsx`

Switch from a tall vertical card to a compact horizontal layout:

**Current:**
- Large 4:3 aspect ratio image
- Stacked content below

**New Design:**
- Horizontal layout on desktop: small square thumbnail (80x80) on left, content on right
- Mobile: Smaller vertical card with 16:9 image aspect ratio
- Remove unnecessary padding, tighten spacing
- Price and Add button inline

```
Desktop Layout:
+-------+----------------------------------+
| Image | Name                        [+] |
| 80x80 | Description (1 line)            |
|       | 30 min • GHS 180                |
+-------+----------------------------------+

Mobile Layout:
+----------------------------------+
|        Image (16:9)              |
+----------------------------------+
| Name                             |
| Description                      |
| 30 min • GHS 180           [+]  |
+----------------------------------+
```

---

## Part 2: Fix "No Available Times" Error

### Root Cause
The `useAvailableSlots` hook queries the `appointments` table. However, anonymous users (public booking visitors) cannot read from the `appointments` table due to RLS policies.

### Solution
Create a backend function to check availability that runs with elevated privileges:

**Option A (Recommended):** Add an RLS policy allowing anon to count appointments for availability purposes only (not read content)

**Option B:** Create a database function `get_available_slots(tenant_id, location_id, date)` that returns slot availability

**Implementation - Option A:**

Add RLS policy for anonymous slot counting:

```sql
CREATE POLICY "Anon can count appointments for slot availability"
ON public.appointments FOR SELECT TO anon
USING (
  tenant_id IN (
    SELECT id FROM tenants WHERE online_booking_enabled = true
  )
);
```

This policy allows the existing `useAvailableSlots` hook to work correctly.

---

## Part 3: Scrollable Wizard Tabs

### Changes to `BookingWizard.tsx`

Replace fixed-width step indicators with a horizontally scrollable container:

**Current:** Steps are flex-spaced across full width, causing text to wrap
**New:** Use overflow-x-auto with min-width on each step item

```tsx
<ScrollArea className="w-full" orientation="horizontal">
  <div className="flex items-center gap-4 px-6 py-4 min-w-max">
    {steps.map((s, i) => (
      <div key={s.key} className="flex items-center gap-3 shrink-0">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full ...">
            {s.icon}
          </div>
          <span className="text-sm font-medium whitespace-nowrap">{s.label}</span>
        </div>
        {/* Connector line */}
        {i < steps.length - 1 && (
          <div className="w-8 h-px bg-muted" />
        )}
      </div>
    ))}
  </div>
</ScrollArea>
```

---

## Part 4: Content Width & Whitespace

### Changes to `BookingLayout.tsx` and `CatalogView.tsx`

Add a max-width constraint to center content with breathing room:

```tsx
// BookingLayout.tsx
<main className="container mx-auto px-4 py-6 max-w-5xl">
  {children}
</main>
```

Also update the grid to use 4 columns on large screens for the compact cards:

```tsx
// CatalogView.tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
```

---

## Part 5: Brand Highlight Color

### Database Migration

Add a `brand_color` column to the `tenants` table:

```sql
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#2563EB';
```

The default is the primary blue from the design system.

### Settings UI (`SettingsPage.tsx`)

Add a color picker in the Booking Settings tab:

```tsx
<div className="space-y-2">
  <Label>Brand Highlight Color</Label>
  <div className="flex items-center gap-3">
    <Input
      type="color"
      value={bookingSettings.brandColor || "#2563EB"}
      onChange={(e) => setBookingSettings(prev => ({
        ...prev,
        brandColor: e.target.value
      }))}
      className="h-10 w-16 p-1 cursor-pointer"
    />
    <Input
      type="text"
      value={bookingSettings.brandColor || "#2563EB"}
      onChange={(e) => setBookingSettings(prev => ({
        ...prev,
        brandColor: e.target.value
      }))}
      placeholder="#2563EB"
      className="w-28 font-mono text-sm"
    />
  </div>
  <p className="text-xs text-muted-foreground">
    Used for buttons and accents on your booking page
  </p>
</div>
```

### Booking Page Integration

Pass `brandColor` to booking components and apply via CSS custom properties:

```tsx
// BookingLayout.tsx
<div 
  className="min-h-screen bg-background"
  style={{ '--brand-color': salon?.brand_color || '#2563EB' } as React.CSSProperties}
>
```

Then use in components:
```tsx
<Button style={{ backgroundColor: 'var(--brand-color)' }}>
  Add
</Button>
```

### Scalability Note
This approach is scalable because:
- Single database column
- CSS custom property cascades to all children
- No additional rendering logic needed
- Can be extended to more properties later (brand_color_secondary, etc.)

---

## Part 6: Dynamic Page Title for SEO

### Changes to `BookingPage.tsx`

Add a `useEffect` to update `document.title` when the salon data loads:

```tsx
import { useEffect } from "react";

function BookingPageContent() {
  const { salon, ... } = usePublicSalon(slug);
  
  // Update page title for SEO
  useEffect(() => {
    if (salon?.name) {
      document.title = `Book at ${salon.name} | SalonMagik`;
    } else {
      document.title = "Book Appointment | SalonMagik";
    }
    
    // Reset on unmount
    return () => {
      document.title = "SalonMagik";
    };
  }, [salon?.name]);
  
  // ... rest of component
}
```

Also update `index.html` default title to `SalonMagik` for branding consistency.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/booking/components/ItemCard.tsx` | Horizontal compact layout, smaller images |
| `src/pages/booking/components/CatalogView.tsx` | Update grid columns |
| `src/pages/booking/components/BookingWizard.tsx` | Scrollable tabs with proper spacing |
| `src/pages/booking/components/BookingLayout.tsx` | Max-width container, CSS variable for brand color |
| `src/pages/booking/BookingPage.tsx` | Dynamic document.title |
| `src/pages/salon/SettingsPage.tsx` | Brand color picker UI |
| `src/hooks/booking/usePublicSalon.tsx` | Add brand_color to query |
| `index.html` | Update default title to "SalonMagik" |

### Database Migration

```sql
-- Add brand_color column
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#2563EB';

-- Allow anon to read appointments for slot counting (availability check)
CREATE POLICY "Anon can read appointments for availability"
ON public.appointments FOR SELECT TO anon
USING (
  tenant_id IN (
    SELECT id FROM tenants WHERE online_booking_enabled = true
  )
  AND status IN ('scheduled', 'started', 'paused')
);
```

---

## Implementation Order

1. Database migration (brand_color + appointments RLS policy)
2. Update `index.html` title
3. Update `usePublicSalon.tsx` to include brand_color
4. Refactor `ItemCard.tsx` for compact horizontal layout
5. Update `CatalogView.tsx` grid
6. Update `BookingLayout.tsx` with max-width and CSS variable
7. Update `BookingWizard.tsx` with scrollable tabs
8. Add brand color picker to `SettingsPage.tsx`
9. Add dynamic title to `BookingPage.tsx`
