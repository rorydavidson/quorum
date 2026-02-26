import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect('/dashboard');
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-snomed-grey">Admin</h1>
      <p className="mt-2 text-sm text-snomed-grey/70">
        Space and calendar configuration — Phase 7.
      </p>
    </main>
  );
}
