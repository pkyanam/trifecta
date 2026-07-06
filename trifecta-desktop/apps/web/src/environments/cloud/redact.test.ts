import { describe, expect, it } from "vitest";

import { maskSecret, redactForLog, redactUrlSecrets } from "./redact";

describe("maskSecret", () => {
  it("preserves a short prefix and redacts the remainder", () => {
    expect(maskSecret("bw_supersecretvalue")).toBe("bw_[redacted]");
    expect(maskSecret("bwtr_credential")).toBe("bwtr_[redacted]");
  });

  it("redacts values without a recognizable prefix", () => {
    expect(maskSecret("plaintoken")).toBe("[redacted]");
  });

  it("handles empty values", () => {
    expect(maskSecret("")).toBe("[redacted]");
    expect(maskSecret(null)).toBe("[redacted]");
    expect(maskSecret(undefined)).toBe("[redacted]");
  });
});

describe("redactUrlSecrets", () => {
  it("strips hosted port token and fragment credentials", () => {
    const redacted = redactUrlSecrets(
      "https://env-abc.env.belweave.ai/pair?_token=box-token&keep=1#token=pairing",
    );
    expect(redacted).not.toContain("box-token");
    expect(redacted).not.toContain("pairing");
    expect(redacted).toContain("keep=1");
  });

  it("drops fragments from non-URL strings", () => {
    expect(redactUrlSecrets("not a url#token=secret")).toBe("not a url");
  });
});

describe("redactForLog", () => {
  it("redacts known sensitive keys at any depth", () => {
    const result = redactForLog({
      apiKey: "bw_secret",
      environment: {
        pairingCredential: "bwtr_secret",
        pairingUrl: "https://env.belweave.ai/pair#token=secret",
        httpBaseUrl: "https://env.belweave.ai",
        label: "trifecta-dev",
      },
      sandboxes: [{ token: "abc", name: "keep" }],
    });

    expect(result).toEqual({
      apiKey: "[redacted]",
      environment: {
        pairingCredential: "[redacted]",
        pairingUrl: "[redacted]",
        httpBaseUrl: "https://env.belweave.ai/",
        label: "trifecta-dev",
      },
      sandboxes: [{ token: "[redacted]", name: "keep" }],
    });
  });
});
