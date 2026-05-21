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
  /** Native pairing URL — base is the Daytona server, used for iOS/Android/desktop QR and copy */
  pairingUrl: string;
  /** Web pairing URL — opens app.trifecta.belweave.com with ?server= for browser-based access */
  webPairingUrl: string;
  pairingToken: string | null;
  status: string;
}
