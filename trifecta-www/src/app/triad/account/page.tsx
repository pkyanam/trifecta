import { auth } from '@clerk/nextjs/server';
import AccountClient from './AccountClient';

export default async function TriadAccountPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: '/triad/account' });
  return <AccountClient />;
}
