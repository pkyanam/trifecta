import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { describe, expect, it } from "vitest";

import {
  BRAND_ASSET_PATHS,
  DEVELOPMENT_ICON_OVERRIDES,
  PUBLISH_ICON_OVERRIDES,
  resolveWebAssetBrandForChannel,
  resolveWebIconOverrides,
} from "./brand-assets.ts";

describe("brand-assets", () => {
  const expectPngHasAlpha = (relativePath: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const png = yield* fs.readFile(relativePath);
      expect(Array.from(png.subarray(1, 4))).toEqual([80, 78, 71]);

      const colorType = png[25];
      expect([4, 6]).toContain(colorType);
    });

  it("maps server publish web assets to production icons", () => {
    expect(PUBLISH_ICON_OVERRIDES).toEqual([
      {
        sourceRelativePath: BRAND_ASSET_PATHS.productionWebFaviconIco,
        targetRelativePath: "dist/client/favicon.ico",
      },
      {
        sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon16Png,
        targetRelativePath: "dist/client/favicon-16x16.png",
      },
      {
        sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon32Png,
        targetRelativePath: "dist/client/favicon-32x32.png",
      },
      {
        sourceRelativePath: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
        targetRelativePath: "dist/client/apple-touch-icon.png",
      },
    ]);
  });

  it("maps server build web assets to development icons", () => {
    expect(DEVELOPMENT_ICON_OVERRIDES[0]).toEqual({
      sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFaviconIco,
      targetRelativePath: "dist/client/favicon.ico",
    });
  });

  it("can target hosted web dist directly", () => {
    expect(resolveWebIconOverrides("production", "apps/web/dist")).toContainEqual({
      sourceRelativePath: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
      targetRelativePath: "apps/web/dist/apple-touch-icon.png",
    });
  });

  it("maps hosted nightly web assets to nightly icons", () => {
    expect(resolveWebIconOverrides("nightly", "apps/web/dist")).toContainEqual({
      sourceRelativePath: BRAND_ASSET_PATHS.nightlyWebFaviconIco,
      targetRelativePath: "apps/web/dist/favicon.ico",
    });
  });

  it("maps hosted release channels to web asset brands", () => {
    expect(resolveWebAssetBrandForChannel("latest")).toBe("production");
    expect(resolveWebAssetBrandForChannel("nightly")).toBe("nightly");
  });

  it("keeps macOS desktop icons transparent outside the rounded app shape", () =>
    Effect.gen(function* () {
      yield* expectPngHasAlpha(BRAND_ASSET_PATHS.productionMacIconPng);
      yield* expectPngHasAlpha(BRAND_ASSET_PATHS.nightlyMacIconPng);
      yield* expectPngHasAlpha(BRAND_ASSET_PATHS.developmentDesktopIconPng);
    }).pipe(Effect.provide(NodeServices.layer), Effect.runPromise));
});
