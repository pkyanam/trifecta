<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Trifecta desktop server. The project already had a custom PostHog analytics service (`AnalyticsService`) built with Effect's HttpClient that sends events to PostHog's batch API. This integration adds 12 new events across 6 files, filling coverage gaps in auth, thread lifecycle, VCS, SSH, and server startup.

Environment variables `BELWEAVE_POSTHOG_KEY` and `BELWEAVE_POSTHOG_HOST` have been set in `apps/server/.env` with the correct project token and host.

| Event | Description | File |
|---|---|---|
| `auth.session.created` | Client successfully exchanges a bootstrap credential for a session token | `apps/server/src/auth/http.ts` |
| `auth.session.bearer_created` | Bearer (non-cookie) session is issued via /bootstrap/bearer | `apps/server/src/auth/http.ts` |
| `auth.client.revoked` | Owner revokes a specific client session | `apps/server/src/auth/http.ts` |
| `auth.clients.revoked_all` | Owner revokes all other active client sessions at once | `apps/server/src/auth/http.ts` |
| `auth.pairing_link.revoked` | Pairing link is revoked by an owner session | `apps/server/src/auth/http.ts` |
| `auth.pairing_credential.issued` | New pairing credential/token is issued | `apps/server/src/auth/http.ts` |
| `thread.deleted` | Thread is deleted and cleanup (provider session stop, terminal close) runs | `apps/server/src/orchestration/Layers/ThreadDeletionReactor.ts` |
| `thread.turn.start.failed` | Provider turn start fails, capturing provider and failure detail | `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` |
| `vcs.repository.initialized` | New VCS repository is provisioned/initialized | `apps/server/src/vcs/VcsProvisioningService.ts` |
| `ssh.session.opened` | New SSH session is successfully opened | `apps/server/src/ssh/Layers/SshSessionManagerLive.ts` |
| `ssh.session.closed` | SSH session is closed (by user, timeout, or error) | `apps/server/src/ssh/Layers/SshSessionManagerLive.ts` |
| `server.startup.completed` | Server fully completes startup (HTTP listening + ready event published) | `apps/server/src/serverRuntimeStartup.ts` |

## Next steps

We recommend creating an "Analytics basics" dashboard in your PostHog project with insights covering:

1. **Server startups over time** — trend of `server.startup.completed` grouped by `mode` (desktop vs server/cli)
2. **Auth session creation funnel** — `auth.session.created` + `auth.session.bearer_created` as conversion funnel entry point
3. **Session revocation rate** — `auth.client.revoked` and `auth.clients.revoked_all` over time (churn signal)
4. **Turn failure rate** — `thread.turn.start.failed` as a ratio over `provider.turn.sent` (quality metric)
5. **SSH usage** — `ssh.session.opened` vs `ssh.session.closed` by reason (user / timeout / error)

Navigate to your PostHog project to build these:
https://us.posthog.com/project/435266/dashboard

The existing events tracked before this integration include:
- `server.boot.heartbeat` (with `threadCount` and `projectCount`)
- `provider.session.started/stopped/recovered`
- `provider.turn.sent/interrupted`
- `provider.request.responded`
- `provider.conversation.rolled_back`
- `provider.sessions.stopped_all`

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
