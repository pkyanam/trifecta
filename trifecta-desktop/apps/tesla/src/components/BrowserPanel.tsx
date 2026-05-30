import {
  ArrowLeftIcon,
  ArrowRightIcon,
  GlobeIcon,
  LockIcon,
  RefreshCwIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isElectron } from "~/env";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const DEFAULT_BROWSER_URL = "https://www.google.com";
const LOCAL_STORAGE_KEY = "browser_last_url";

function loadLastUrl(): string {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved && saved.startsWith("http") ? saved : DEFAULT_BROWSER_URL;
  } catch {
    return DEFAULT_BROWSER_URL;
  }
}

function saveLastUrl(url: string): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, url);
  } catch {
    // ignore
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_BROWSER_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

/** Electron webview element API subset we use. */
interface ElectronWebviewElement extends HTMLElement {
  src: string;
  goBack(): void;
  goForward(): void;
  reload(): void;
  canGoBack(): Promise<boolean>;
  canGoForward(): Promise<boolean>;
}

export default function BrowserPanel() {
  const [url, setUrl] = useState(loadLastUrl);
  const [displayUrl, setDisplayUrl] = useState(loadLastUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | ElectronWebviewElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isWebview = isElectron;

  const navigateTo = useCallback((targetUrl: string) => {
    const normalized = normalizeUrl(targetUrl);
    setUrl(normalized);
    setDisplayUrl(targetUrl.trim() || normalized);
    saveLastUrl(normalized);
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      navigateTo(displayUrl);
      inputRef.current?.blur();
    },
    [displayUrl, navigateTo],
  );

  const handleRefresh = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (isWebview) {
      (frame as ElectronWebviewElement).reload();
    } else {
      try {
        (frame as HTMLIFrameElement).contentWindow?.location.reload();
      } catch {
        (frame as HTMLIFrameElement).src = url;
      }
    }
  }, [isWebview, url]);

  const handleBack = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (isWebview) {
      (frame as ElectronWebviewElement).goBack();
    } else {
      try {
        (frame as HTMLIFrameElement).contentWindow?.history.back();
      } catch {
        // cross-origin; ignore
      }
    }
  }, [isWebview]);

  const handleForward = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (isWebview) {
      (frame as ElectronWebviewElement).goForward();
    } else {
      try {
        (frame as HTMLIFrameElement).contentWindow?.history.forward();
      } catch {
        // cross-origin; ignore
      }
    }
  }, [isWebview]);

  // Poll navigation state for both iframe and webview.
  useEffect(() => {
    const interval = setInterval(() => {
      const frame = frameRef.current;
      if (!frame) return;
      if (isWebview) {
        const webview = frame as ElectronWebviewElement;
        void webview.canGoBack().then(setCanGoBack);
        void webview.canGoForward().then(setCanGoForward);
      } else {
        try {
          const iframe = frame as HTMLIFrameElement;
          setCanGoBack(
            iframe.contentWindow?.history.length ? iframe.contentWindow.history.length > 1 : false,
          );
        } catch {
          // cross-origin
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isWebview]);

  // Listen to webview navigation events to keep address bar in sync.
  useEffect(() => {
    if (!isWebview) return;
    const webview = frameRef.current as ElectronWebviewElement | null;
    if (!webview) return;

    const onDidNavigate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && typeof detail === "object" && "url" in detail) {
        const newUrl = String(detail.url);
        setUrl(newUrl);
        setDisplayUrl(newUrl);
        saveLastUrl(newUrl);
      }
    };

    const onDidNavigateInPage = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && typeof detail === "object" && "url" in detail) {
        const newUrl = String(detail.url);
        setUrl(newUrl);
        setDisplayUrl(newUrl);
        saveLastUrl(newUrl);
      }
    };

    webview.addEventListener("did-navigate", onDidNavigate);
    webview.addEventListener("did-navigate-in-page", onDidNavigateInPage);
    return () => {
      webview.removeEventListener("did-navigate", onDidNavigate);
      webview.removeEventListener("did-navigate-in-page", onDidNavigateInPage);
    };
  }, [isWebview, url]);

  const isSecure = url.startsWith("https://");

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* Browser chrome */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={handleBack}
                disabled={!canGoBack}
                aria-label="Back"
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Back</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={handleForward}
                disabled={!canGoForward}
                aria-label="Forward"
              >
                <ArrowRightIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Forward</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={handleRefresh}
                aria-label="Refresh"
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Refresh</TooltipPopup>
        </Tooltip>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1">
          <div className="relative flex min-w-0 flex-1 items-center">
            <div className="pointer-events-none absolute left-2 flex items-center">
              {isSecure ? (
                <LockIcon className="size-3 text-emerald-600" />
              ) : (
                <GlobeIcon className="size-3 text-muted-foreground" />
              )}
            </div>
            <Input
              ref={inputRef}
              value={displayUrl}
              onChange={(e) => setDisplayUrl(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded-md border-border/60 bg-muted/50 pl-7 pr-7 text-xs"
              placeholder="Enter URL or search"
            />
            <button
              type="button"
              onClick={() => setDisplayUrl("")}
              className="absolute right-2 flex items-center text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              <XIcon className="size-3" />
            </button>
          </div>
        </form>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Bookmark">
                <StarIcon className="size-3.5" />
              </Button>
            }
          />
          <TooltipPopup side="bottom">Bookmark</TooltipPopup>
        </Tooltip>
      </div>

      {/* Viewport */}
      <div className="relative min-h-0 flex-1">
        {isWebview ? (
          <webview
            ref={frameRef as React.RefObject<ElectronWebviewElement>}
            src={url}
            className="absolute inset-0 h-full w-full border-0 bg-white"
            allowpopups
          />
        ) : (
          <iframe
            ref={frameRef as React.RefObject<HTMLIFrameElement>}
            src={url}
            title="Browser"
            className="absolute inset-0 h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
    </div>
  );
}
