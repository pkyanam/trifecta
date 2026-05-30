import { createSandbox } from '../src/lib/daytona';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const nameArg = args.find(a => a.startsWith('--name='));
  const name = nameArg ? nameArg.split('=')[1] : `test-${Math.random().toString(36).substring(7)}`;

  console.log(`Seeding sandbox: ${name}`);

  try {
    const info = await createSandbox({
      name,
      tier: 'launch',
    });

    console.log('Success:', info);
    console.log('Pairing Token:', info.pairingToken);
  } catch (e) {
    console.error('Failed:', e);
  }
}

main();
