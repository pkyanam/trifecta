import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";

import {
  decodeHermesSetSessionConfigOptionResponse,
  normalizeHermesSessionConfigOptions,
} from "./HermesAcpWire.ts";

describe("HermesAcpWire", () => {
  it("normalizes loose ACP config options from Hermes", () => {
    const options = normalizeHermesSessionConfigOptions([
      {
        id: "model",
        label: "Model",
        category: "model",
        current_value: "auto",
        options: [
          { value: "auto", label: "Auto" },
          {
            group: "nous",
            name: "Nous",
            options: [{ value: "hermes-4", label: "Hermes 4" }],
          },
        ],
      },
      {
        id: "fast",
        name: "Fast",
        type: "boolean",
        current_value: "true",
      },
    ]);

    expect(options).toEqual([
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "auto",
        options: [
          { value: "auto", name: "Auto" },
          { value: "hermes-4", name: "Hermes 4" },
        ],
      },
      {
        id: "fast",
        name: "Fast",
        type: "boolean",
        currentValue: true,
      },
    ]);
  });

  it("decodes loose session/set_config_option responses", async () => {
    const decoded = await Effect.runPromise(
      decodeHermesSetSessionConfigOptionResponse({
        config_options: [
          {
            configId: "model",
            label: "Model",
            category: "model",
            currentValue: "hermes-4",
            options: [{ value: "hermes-4", title: "Hermes 4" }],
          },
        ],
      }),
    );

    expect(decoded.configOptions[0]).toMatchObject({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: "hermes-4",
    });
  });
});
