import { useMemo, useState } from "react";

import type { ServerProvider } from "@belweave/contracts";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { ensureLocalApi } from "../../localApi";
import {
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { useServerProviders } from "../../rpc/serverState";
import { getDriverOption } from "./providerDriverMeta";
import { getProviderSummary, PROVIDER_STATUS_STYLES } from "./providerStatus";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  useRelativeTimeTick,
} from "./settingsLayout";

function parseCheckedAt(checkedAt: string): number {
  return Date.parse(checkedAt);
}

function relativeTimeLabel(checkedAtMs: number, nowMs: number): string {
  if (checkedAtMs <= 0) return "Not checked yet";
  const diffMs = nowMs - checkedAtMs;
  if (diffMs < 60_000) return "Just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface RateLimitInfo {
  readonly planType: string | null;
  readonly limitName: string | null;
  readonly usedPercent: number | null;
  readonly resetsAt: number | null;
  readonly rateLimitReached: string | null;
  readonly windowDurationMins: number | null;
}

function extractRateLimitInfo(rateLimits: unknown): RateLimitInfo | null {
  const record = asRecord(rateLimits);
  if (!record) return null;

  const planType = asString(record.planType);
  const limitName = asString(record.limitName);
  const rateLimitReached = asString(record.rateLimitReachedType);

  const primary = asRecord(record.primary);
  const primaryUsedPercent = asFiniteNumber(primary?.usedPercent);
  const primaryResetsAt = asFiniteNumber(primary?.resetsAt);
  const primaryWindowMins = asFiniteNumber(primary?.windowDurationMins);

  const secondary = asRecord(record.secondary);
  const secondaryUsedPercent = asFiniteNumber(secondary?.usedPercent);

  const usedPercent =
    primaryUsedPercent ?? secondaryUsedPercent ?? asFiniteNumber(record.usedPercent) ?? null;

  const resetsAt =
    primaryResetsAt ??
    asFiniteNumber(record.resetsAt) ??
    asFiniteNumber(secondary?.resetsAt) ??
    null;

  const windowDurationMins = primaryWindowMins ?? asFiniteNumber(record.windowDurationMins) ?? null;

  if (planType === null && limitName === null && usedPercent === null && resetsAt === null) {
    return null;
  }

  return { planType, limitName, usedPercent, resetsAt, rateLimitReached, windowDurationMins };
}

function formatResetsAt(ts: number): string {
  const date = new Date(ts * 1000);
  const now = Date.now();
  const diffMs = date.getTime() - now;
  if (diffMs < 0) return "now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatPercent(value: number): string {
  if (value < 0.1) return "<0.1%";
  if (value < 10) return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(value)}%`;
}

export function QuotasSettingsPanel() {
  const serverProviders = useServerProviders();
  const nowMs = useRelativeTimeTick(10_000);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const entries = useMemo(
    () => sortProviderInstanceEntries(deriveProviderInstanceEntries(serverProviders)),
    [serverProviders],
  );

  const lastCheckedAt = useMemo(() => {
    if (entries.length === 0) return null;
    return entries.reduce((latest, entry) => {
      const entryMs = parseCheckedAt(entry.snapshot.checkedAt);
      return entryMs > latest ? entryMs : latest;
    }, parseCheckedAt(entries[0]!.snapshot.checkedAt));
  }, [entries]);

  const refreshProviders = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void ensureLocalApi()
      .server.refreshProviders()
      .finally(() => setIsRefreshing(false));
  };

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Usage"
        icon={
          isRefreshing ? (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          ) : null
        }
        headerAction={
          <button
            type="button"
            onClick={refreshProviders}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCwIcon className={cn("size-3", isRefreshing && "animate-spin opacity-50")} />
            Refresh
          </button>
        }
      >
        {entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
            No providers configured. Add a provider to see usage data.
          </div>
        ) : (
          entries.map((entry) => {
            const snapshot: ServerProvider = entry.snapshot;
            const summary = getProviderSummary(snapshot);
            const driverOption = getDriverOption(entry.driverKind);
            const ProviderIcon = driverOption?.icon;
            const statusDot =
              PROVIDER_STATUS_STYLES[snapshot.status]?.dot ?? PROVIDER_STATUS_STYLES.warning.dot;
            const checkedAtMs = parseCheckedAt(snapshot.checkedAt);
            const rateLimitInfo = extractRateLimitInfo(snapshot.rateLimits);
            const hasRateLimits =
              rateLimitInfo !== null &&
              (rateLimitInfo.usedPercent !== null ||
                rateLimitInfo.planType !== null ||
                rateLimitInfo.limitName !== null);

            return (
              <SettingsRow
                key={entry.instanceId}
                title={
                  <span className="flex items-center gap-2">
                    {ProviderIcon ? (
                      <ProviderIcon className="size-4 shrink-0 text-foreground/70" />
                    ) : null}
                    <span>{entry.displayName}</span>
                    {!entry.isDefault ? (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        ({entry.instanceId})
                      </span>
                    ) : null}
                    {snapshot.badgeLabel ? (
                      <span className="inline-flex items-center rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                        {snapshot.badgeLabel}
                      </span>
                    ) : null}
                  </span>
                }
                description={
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn("inline-block size-1.5 shrink-0 rounded-full", statusDot)}
                    />
                    {summary.headline}
                  </span>
                }
                status={`Last checked ${relativeTimeLabel(checkedAtMs, nowMs)}`}
              >
                <div className="space-y-3 pb-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <QuotaStat
                      label="Auth"
                      value={
                        snapshot.auth.status === "authenticated"
                          ? (snapshot.auth.label ?? snapshot.auth.type ?? "Authenticated")
                          : snapshot.auth.status
                      }
                    />
                    <QuotaStat label="Models" value={`${snapshot.models.length}`} />
                    {rateLimitInfo?.planType ? (
                      <QuotaStat label="Plan" value={rateLimitInfo.planType} />
                    ) : null}
                  </div>
                  {hasRateLimits ? (
                    <RateLimitDetail info={rateLimitInfo!} />
                  ) : (
                    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                      <span>
                        No quota data reported yet. Start a session with this provider to populate
                        rate-limit information.
                      </span>
                    </div>
                  )}
                </div>
              </SettingsRow>
            );
          })
        )}
      </SettingsSection>

      {lastCheckedAt !== null ? (
        <div className="text-center text-[11px] text-muted-foreground/60">
          Provider status last refreshed {relativeTimeLabel(lastCheckedAt, nowMs)}
        </div>
      ) : null}
    </SettingsPageContainer>
  );
}

function RateLimitDetail({ info }: { info: RateLimitInfo }) {
  const { usedPercent, resetsAt, limitName, rateLimitReached, windowDurationMins } = info;
  const clampedPercent = usedPercent !== null ? Math.max(0, Math.min(100, usedPercent)) : null;

  return (
    <div className="space-y-2">
      {clampedPercent !== null ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {limitName ?? "Usage"}
              {windowDurationMins !== null ? ` · ${windowDurationMins}m window` : ""}
            </span>
            <span
              className={cn(
                "font-mono font-medium",
                clampedPercent > 80 ? "text-destructive" : "text-foreground",
              )}
            >
              {formatPercent(clampedPercent)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                clampedPercent > 80
                  ? "bg-destructive"
                  : clampedPercent > 50
                    ? "bg-amber-400"
                    : "bg-success",
              )}
              style={{ width: `${clampedPercent}%` }}
            />
          </div>
          {resetsAt !== null ? (
            <div className="text-[11px] text-muted-foreground/70">
              Resets in {formatResetsAt(resetsAt)}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {limitName ?? "Usage quota tracked by provider."}
        </div>
      )}
      {rateLimitReached ? (
        <div className="rounded-md bg-destructive/15 px-2.5 py-1.5 text-xs font-medium text-destructive">
          Rate limit reached: {rateLimitReached}
        </div>
      ) : null}
    </div>
  );
}

function QuotaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
