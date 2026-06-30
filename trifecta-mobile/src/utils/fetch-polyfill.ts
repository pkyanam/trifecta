// This MUST be first to ensure that `fetch` is defined in the React Native environment.
import "react-native/Libraries/Core/InitializeCore";
// Ensure fetch is installed before adding our fetch polyfill to ensure Headers and Request are available globally.
import "whatwg-fetch";
// This MUST be imported to ensure URL is installed.
import "expo";
// This file configures the runtime environment to increase compatibility with WinterCG.
// https://wintercg.org/
import Constants from "expo-constants";
import { Platform } from "react-native";

import { fetch as expoFetch } from "expo/fetch";

interface ExpoExtraRouterConfig {
  router?: {
    origin?: any;
    generatedOrigin?: any;
  };
}

const manifest = Constants.expoConfig;

const polyfillSymbol = Symbol.for("expo.polyfillFetchWithWindowLocation");

export function wrapFetchWithWindowLocation(
  fetch: Function & { [polyfillSymbol]?: boolean },
) {
  if (fetch[polyfillSymbol]) {
    return fetch;
  }

  const _fetch = (...props: any[]) => {
    if (props[0] && typeof props[0] === "string" && props[0].startsWith("/")) {
      props[0] = new URL(props[0], getOrigin()).toString();
    } else if (props[0] && typeof props[0] === "object") {
      if (
        props[0].url &&
        typeof props[0].url === "string" &&
        props[0].url.startsWith("/")
      ) {
        props[0].url = new URL(props[0].url, getOrigin()).toString();
      }
    }

    return fetch(...props);
  };

  _fetch[polyfillSymbol] = true;

  return _fetch;
}

const extra = manifest?.extra as ExpoExtraRouterConfig | null;

function getOrigin() {
  assertOrigin();
  return window.location?.origin;
}

function assertOrigin() {
  // We use the dev server in development but should attempt to warn early if the origin will be disabled in production.
  if (extra?.router?.origin === false) {
    throw new Error(
      "The server origin cannot be false in the app.json. Setup server deployments to ensure production fetch requests work https://docs.expo.dev/router/reference/api-routes/#native-deployment",
    );
  }
  if (typeof window !== "undefined" && !window.location) {
    throw new Error(
      "window.location is not defined. Setup server deployments to ensure relative fetch requests work in production https://docs.expo.dev/router/reference/api-routes/#native-deployment",
    );
  }
}

// Defer the assertion in release builds so the app doesn't crash instantly.
if (__DEV__) assertOrigin();

// On web, route relative URLs through expo/fetch + window.location.
// On native, keep React Native's built-in fetch so ATS Info.plist settings apply
// (expo/fetch's URLSession was rejecting cleartext HTTP to LAN/Tailscale servers).
// This is achieved by setting EXPO_PUBLIC_USE_RN_FETCH=1 at build time, which
// prevents expo's runtime.native.ts from installing expo/fetch as globalThis.fetch.
if (Platform.OS === "web" && typeof window !== "undefined") {
  Object.defineProperty(globalThis, "fetch", {
    value: wrapFetchWithWindowLocation(expoFetch),
  });
}
