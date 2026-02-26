import { redirect } from 'next/navigation';

// Root: redirect authenticated users to dashboard, unauthenticated to login.
// The real auth check happens in middleware.ts — this is just a landing redirect.
export default function RootPage() {
  redirect('/dashboard');
}
