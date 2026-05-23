export interface SandboxRecord {
  id: string;
  user_id: string;
  name: string;
  tier: string;
  disk_gib: number;
  gpu_addon: string | null;
  daytona_sandbox_id: string | null;
  status: string;
  pairing_token: string | null;
  volume_id: string | null;
  trifecta_url: string | null;
  terminal_url: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudAccount {
  user_id: string;
  plan: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  runtime_credits_monthly: number;
  runtime_credits_used: number;
  gpu_usage_usd: number;
  running_sandbox_limit: number;
  stored_sandbox_limit: number;
  gpu_enabled: boolean;
  idle_timeout_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface ConnectionInfoResponse {
  trifectaUrl: string;
  /** Native pairing URL — base is the Daytona server, used for iOS/Android/desktop QR and copy */
  pairingUrl: string;
  /** Web pairing URL — opens app.trifecta.belweave.com with ?server= for browser-based access */
  webPairingUrl: string;
  pairingToken: string | null;
  status: string;
}
