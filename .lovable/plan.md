

# Landing Page Content Updates

## Overview
Update the landing page to reflect that Salon Magik is a global platform open to everyone, remove fake statistics and testimonials since there are no customers yet, and update messaging to be honest about the early-stage nature of the product.

---

## Changes Required

### 1. Remove Components (Delete)

| Component | Reason |
|-----------|--------|
| `TestimonialsSection.tsx` | No real customers yet - fake testimonials would be dishonest |
| `StatsBar.tsx` | Contains fabricated statistics ("500+ partners", "15,000+ appointments") |

### 2. Update Hero Section
**File:** `src/components/landing/LandingHero.tsx`

| Current | Updated |
|---------|---------|
| "The booking software built for Africa" | "The booking software built for beauty professionals" |

### 3. Update Benefits Section
**File:** `src/components/landing/BenefitsSection.tsx`

| Current | Updated |
|---------|---------|
| Heading: "Why salon owners choose us" | "Why you should sign up" |
| Subtext: "We built Salon Magik specifically for African beauty businesses..." | "Simple, powerful tools designed for modern salons, spas, and barbershops. Everything you need to run your business." |
| Benefit: "African payment methods included" | "Multiple payment methods supported" |

### 4. Regenerate Images with Diverse Representation
**Files:** All images in `src/assets/landing/`

| Image | Description |
|-------|-------------|
| `salon-hero.jpg` | Diverse team of stylists working in a modern salon (mix of ethnicities) |
| `salon-category.jpg` | Hair salon with diverse clientele |
| `barber-category.jpg` | Barbershop showing diverse barbers and clients |
| `nails-category.jpg` | Nail studio with diverse nail technicians |
| `spa-category.jpg` | Spa/wellness setting with diverse staff |

### 5. Update Landing Page Composition
**File:** `src/pages/marketing/LandingPage.tsx`

Remove imports and usage of:
- `StatsBar`
- `TestimonialsSection`

### 6. Update Index Exports
**File:** `src/components/landing/index.ts`

Remove exports for deleted components.

---

## Technical Details

### Files to Delete
- `src/components/landing/TestimonialsSection.tsx`
- `src/components/landing/StatsBar.tsx`

### Files to Modify
1. `src/components/landing/LandingHero.tsx` - Update headline
2. `src/components/landing/BenefitsSection.tsx` - Update heading, subtext, and one benefit
3. `src/pages/marketing/LandingPage.tsx` - Remove StatsBar and TestimonialsSection
4. `src/components/landing/index.ts` - Remove deleted exports

### Images to Regenerate
All 5 landing images with diverse representation:
- `src/assets/landing/salon-hero.jpg`
- `src/assets/landing/salon-category.jpg`
- `src/assets/landing/barber-category.jpg`
- `src/assets/landing/nails-category.jpg`
- `src/assets/landing/spa-category.jpg`

---

## Updated Page Flow

```text
LandingNav
    |
LandingHero (with diverse hero image)
    |
BusinessTypes (with diverse category images)
    |
FeaturesSection
    |
BenefitsSection (renamed: "Why you should sign up")
    |
CTASection
    |
LandingFooter
```

