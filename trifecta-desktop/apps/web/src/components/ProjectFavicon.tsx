import type { EnvironmentId } from "@t3tools/contracts";
import { FolderIcon } from "lucide-react";
import { useState } from "react";
import { resolveEnvironmentHttpUrl } from "../environments/runtime";

const loadedProjectFaviconSrcs = new Set<string>();

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as Record<string, unknown>;
  return typeof win.__TRIFECTA_SESSION_TOKEN__ === "string"
    ? (win.__TRIFECTA_SESSION_TOKEN__ as string)
    : null;
}

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  className?: string;
}) {
  const src = (() => {
    try {
      const baseUrl = resolveEnvironmentHttpUrl({
        environmentId: input.environmentId,
        pathname: "/api/project-favicon",
        searchParams: { cwd: input.cwd },
      });
      // In iframe/webview mode, cookies are blocked — pass session token as query param
      const token = getSessionToken();
      return token ? `${baseUrl}&token=${encodeURIComponent(token)}` : baseUrl;
    } catch {
      return null;
    }
  })();
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(() =>
    src && loadedProjectFaviconSrcs.has(src) ? "loaded" : "loading",
  );

  if (!src) {
    return (
      <FolderIcon
        className={`size-3.5 shrink-0 text-muted-foreground/50 ${input.className ?? ""}`}
      />
    );
  }

  return (
    <>
      {status !== "loaded" ? (
        <FolderIcon
          className={`size-3.5 shrink-0 text-muted-foreground/50 ${input.className ?? ""}`}
        />
      ) : null}
      <img
        src={src}
        alt=""
        className={`size-3.5 shrink-0 rounded-sm object-contain ${status === "loaded" ? "" : "hidden"} ${input.className ?? ""}`}
        onLoad={() => {
          loadedProjectFaviconSrcs.add(src);
          setStatus("loaded");
        }}
        onError={() => setStatus("error")}
      />
    </>
  );
}
