export interface SandboxRecord {
  id: string;
  user_id: string;
  name: string;
  tier: string;
  daytona_sandbox_id: string | null;
  status: string;
  pairing_token: string | null;
  volume_id: string | null;
  trifecta_url: string | null;
  terminal_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionInfoResponse {
  trifectaUrl: string;
  pairingUrl: string;
  pairingToken: string | null;
  status: string;
}
