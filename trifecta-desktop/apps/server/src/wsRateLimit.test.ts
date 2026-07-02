import { describe, expect, it } from "vitest";

import { checkMessageSize, MAX_MESSAGE_SIZE_BYTES } from "./wsRateLimit.ts";

describe("checkMessageSize", () => {
  it("allows requests without content-length", () => {
    expect(checkMessageSize({})).toBe(true);
  });

  it("allows requests with content-length under the limit", () => {
    expect(checkMessageSize({ "content-length": "1024" })).toBe(true);
    expect(checkMessageSize({ "content-length": String(MAX_MESSAGE_SIZE_BYTES) })).toBe(true);
  });

  it("rejects requests with content-length over the limit", () => {
    expect(checkMessageSize({ "content-length": String(MAX_MESSAGE_SIZE_BYTES + 1) })).toBe(false);
    expect(checkMessageSize({ "content-length": "999999999" })).toBe(false);
  });

  it("allows requests with non-numeric content-length", () => {
    expect(checkMessageSize({ "content-length": "abc" })).toBe(true);
  });

  it("allows requests with content-length of 0", () => {
    expect(checkMessageSize({ "content-length": "0" })).toBe(true);
  });

  it("supports custom max size", () => {
    expect(checkMessageSize({ "content-length": "500" }, 1000)).toBe(true);
    expect(checkMessageSize({ "content-length": "1500" }, 1000)).toBe(false);
  });
});
