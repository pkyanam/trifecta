import * as Crypto from "expo-crypto";

/**
 * Generate a cryptographically secure random hex string of the given length.
 *
 * Uses `expo-crypto`'s CSPRNG under the hood. Use this instead of
 * `Math.random()` for any ID that is sent over the wire (command IDs,
 * message IDs, thread IDs, trace/span IDs) to prevent predictability
 * attacks.
 *
 * Note: When remote JS debugging is enabled in dev builds, `Crypto.getRandomBytes`
 * may fall back to `Math.random()` under the hood (see expo-crypto docs).
 * This only affects development — production builds (`__DEV__ === false`) use
 * the native CSPRNG and are not impacted.
 */
export function secureRandomHex(length: number): string {
  const byteLength = Math.ceil(length / 2);
  const bytes = Crypto.getRandomBytes(byteLength);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex.slice(0, length);
}

/**
 * Generate a cryptographically secure random ID (32-char hex string).
 *
 * Drop-in replacement for the legacy `randomId()` helpers that used
 * `Math.random()`.
 */
export function secureRandomId(): string {
  return secureRandomHex(32);
}
