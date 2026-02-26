import type { SessionUser } from '@snomed/types';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';

interface ShellProps {
  user: SessionUser | null;
  children: React.ReactNode;
}

function isAdminUser(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.groups.some((g) => g === 'portal_admin' || g === '/portal_admin');
}

export function Shell({ user, children }: ShellProps) {
  const admin = isAdminUser(user);

  return (
    <div className="flex h-screen overflow-hidden bg-snomed-grey-light">
      {/* Desktop sidebar */}
      <Sidebar user={user} />

      {/* Right side: mobile header + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile / tablet top bar */}
        <MobileHeader user={user} isAdmin={admin} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
