# FINDING-016 — Stripe webhook timestamp replay protection missing

| Field | Value |
|-------|-------|
| Severity | Medium |
| Category | Webhook Security |
| Component | trifecta-www/src/app/api/billing/webhook/route.ts |
| Status | Fixed |

## Description

The Stripe webhook signature verification checked the HMAC signature
correctly using `crypto.timingSafeEqual`, but did not validate the timestamp
embedded in the signature. This allowed an attacker to replay old valid
webhook events indefinitely.

## Attack scenario

1. Attacker captures a valid Stripe webhook event (e.g.
   `customer.subscription.created` for a paid plan)
2. Attacker replays the webhook days or weeks later
3. The HMAC signature is still valid (timestamp is part of the signed
   payload, but the timestamp itself is never checked for freshness)
4. The user's subscription is re-activated or upgraded without payment

## Fix

Added timestamp validation with a 5-minute tolerance window (Stripe's
recommended value). The webhook is rejected if the timestamp is more than
300 seconds old or in the future:

```typescript
const timestampNum = Number.parseInt(timestamp, 10);
if (!Number.isInteger(timestampNum)) return false;
const now = Math.floor(Date.now() / 1000);
const TOLERANCE_SECONDS = 300;
if (Math.abs(now - timestampNum) > TOLERANCE_SECONDS) return false;
```
