export const SANDBOX_TIERS = {
  starter: { cpu: 1, memory: 2, disk: 10, label: 'Starter', price: '$9/mo' },
  pro: { cpu: 2, memory: 4, disk: 20, label: 'Pro', price: '$19/mo' },
  team: { cpu: 4, memory: 8, disk: 50, label: 'Team', price: '$39/mo' },
} as const;

export type SandboxTier = keyof typeof SANDBOX_TIERS;

export const config = {
  daytona: {
    apiKey: process.env.DAYTONA_API_KEY || '',
    apiUrl: process.env.DAYTONA_API_URL || 'https://app.daytona.io/api',
  },
  trifecta: {
    snapshotName: process.env.TRIFECTA_SNAPSHOT_NAME || 'trifecta-server-v1',
    npmVersion: process.env.TRIFECTA_NPM_VERSION || '0.0.35-alpha.1',
    serverPort: parseInt(process.env.TRIFECTA_SERVER_PORT || '3773', 10),
    volumeName: process.env.TRIFECTA_VOLUME_NAME || 'trifecta-persistent-data',
  },
  app: {
    // The production web app users pair with
    webAppUrl: process.env.NEXT_PUBLIC_TRIFECTA_APP_URL || 'https://app.trifecta.belweave.com',
  },
};

export function validateConfig() {
  if (!config.daytona.apiKey) {
    throw new Error('DAYTONA_API_KEY is required');
  }
}
