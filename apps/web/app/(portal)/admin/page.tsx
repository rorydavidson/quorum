import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { isAdmin } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import type { SpaceConfig } from '@snomed/types';

const BFF_URL = process.env.BFF_URL ?? 'http://localhost:3001';

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect('/dashboard');
  }

  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  let spaces: SpaceConfig[] = [];
  try {
    const res = await fetch(`${BFF_URL}/admin/spaces`, {
      headers: { cookie },
      next: { revalidate: 0 }, // always fresh in admin
    });
    if (res.ok) {
      spaces = await res.json() as SpaceConfig[];
    }
  } catch {
    // Render empty state — AdminShell handles the error gracefully
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-snomed-grey">Admin</h1>
        <p className="mt-1 text-sm text-snomed-grey/60">
          Manage document spaces, Drive folder mappings, and document sections.
        </p>
      </div>

      <AdminShell initialSpaces={spaces} />
    </div>
  );
}
