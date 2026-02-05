
# Fix BackOffice 2FA Setup - QR Code and TOTP Validation

## Issues Identified

1. **No QR Code Displayed**: The setup page has a placeholder comment but never renders an actual QR code image
2. **Invalid Secret Key**: The secret generation and TOTP verification are broken:
   - The current TOTP implementation uses a fake algorithm (simple hash sum) instead of proper HMAC-SHA1
   - Google Authenticator requires RFC 6238 compliant TOTP

## Solution

### 1. Add QR Code Image Generation

Use a QR code API service to generate the QR code from the `otpauth://` URL. The QR Code API service (`api.qrserver.com`) is free, reliable, and doesn't require authentication.

**Changes to `BackofficeSetup2FAPage.tsx`:**
- Generate proper 16-character base32 secret (standard for TOTP)
- Create QR code image using the `otpauth://` URL
- Display the QR code image with proper loading state

### 2. Fix TOTP Verification (Edge Function)

Replace the broken verification logic with the `otpauth` library which is available in Deno.

**Changes to `verify-backoffice-totp/index.ts`:**
- Import `otpauth` library from npm
- Use proper HMAC-SHA1 based TOTP verification
- Support time window drift (±1 step) for better UX

---

## Technical Implementation

### Frontend Changes (`BackofficeSetup2FAPage.tsx`)

```tsx
// Improved secret generation - exactly 16 characters for compatibility
function generateSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (const byte of array) {
    secret += chars[byte % 32];
  }
  return secret;
}

// QR Code URL using free API service
const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

// Render actual QR code image
<img 
  src={qrCodeUrl} 
  alt="Scan with authenticator app"
  className="mx-auto w-48 h-48"
/>
```

### Edge Function Changes (`verify-backoffice-totp/index.ts`)

```typescript
import * as OTPAuth from "npm:otpauth";

// Proper TOTP verification
const totp = new OTPAuth.TOTP({
  issuer: "SalonMagik",
  label: user.email,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  secret: OTPAuth.Secret.fromBase32(backofficeUser.totp_secret),
});

// Validate with 1-step window for clock drift
const delta = totp.validate({ token, window: 1 });
const isValid = delta !== null;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/backoffice/BackofficeSetup2FAPage.tsx` | Add QR code image, fix secret length to 16 chars |
| `supabase/functions/verify-backoffice-totp/index.ts` | Replace fake TOTP with proper `otpauth` library |

---

## Security Considerations

- The QR code API only receives the otpauth URL (no secret stored server-side in the API)
- The `otpauth` library is RFC 6238 compliant
- Time window of ±1 step (30 seconds each) allows for minor clock drift
