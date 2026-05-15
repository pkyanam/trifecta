import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS ssh_host_profiles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      hostname TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      auth_method TEXT NOT NULL,
      expected_fingerprint TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(hostname, port, username)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_ssh_host_profiles_label
    ON ssh_host_profiles(label)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS ssh_known_hosts (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      port INTEGER NOT NULL,
      key_type TEXT NOT NULL,
      fingerprint_sha256 TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE(hostname, port)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS ssh_audit_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      actor_session_id TEXT NOT NULL,
      host_id TEXT,
      hostname TEXT,
      port INTEGER,
      username TEXT,
      auth_method TEXT,
      ssh_session_id TEXT,
      message TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_ssh_audit_events_occurred_at
    ON ssh_audit_events(occurred_at DESC)
  `;
});
