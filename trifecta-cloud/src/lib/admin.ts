import { currentUser } from '@clerk/nextjs/server';

export const ADMIN_EMAILS: string[] = [
  'kyanam.preetham@gmail.com',
];

export async function getIsAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  const email = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  return email ? ADMIN_EMAILS.includes(email.toLowerCase()) : false;
}
