import { createSandbox } from '../src/lib/daytona';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Load env vars
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const nameArg = args.find(a => a.startsWith('--name='));
  const name = nameArg ? nameArg.split('=')[1] : `test-${Math.random().toString(36).substring(7)}`;
  
  console.log(`Seeding sandbox: ${name}`);
  const pairingToken = crypto.randomUUID();

  try {
    const info = await createSandbox({
      name,
      tier: 'starter',
      pairingToken,
    });
    
    console.log('Success:', info);
    console.log('Pairing Token:', pairingToken);
  } catch (e) {
    console.error('Failed:', e);
  }
}

main();
