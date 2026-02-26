import Image from 'next/image';
import Link from 'next/link';
import type { SessionUser } from '@snomed/types';
import { NavItems } from './NavItems';

interface SidebarProps {
  user: SessionUser | null;
}

function userInitials(user: SessionUser): string {
  const first = user.given_name?.[0] ?? user.name?.[0] ?? '?';
  const last  = user.family_name?.[0] ?? '';
  return (first + last).toUpperCase();
}

function isAdminUser(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.groups.some((g) => g === 'portal_admin' || g === '/portal_admin');
}

export function Sidebar({ user }: SidebarProps) {
  const admin  = isAdminUser(user);
  const initials = user ? userInitials(user) : '?';

  return (
    <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 h-screen sticky top-0 bg-white border-r border-snomed-border overflow-hidden">

      {/* Logo */}
      <div className="flex items-center px-5 h-16 border-b border-snomed-border flex-shrink-0">
        <Link href="/dashboard" aria-label="Quorum home">
          <Image
            src="/snomed-logo.png"
            alt="SNOMED International"
            width={140}
            height={40}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavItems isAdmin={admin} />
      </div>

      {/* User section */}
      {user && (
        <div className="flex-shrink-0 border-t border-snomed-border px-3 py-4 space-y-3">
          <div className="flex items-center gap-3 px-2">
            {/* Avatar */}
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white select-none"
              style={{ backgroundColor: '#009FE3' }}
              aria-hidden="true"
            >
              {initials}
            </div>
            {/* Name + email */}
            <div className="min-w-0">
              <p className="text-sm font-medium text-snomed-grey truncate leading-tight">
                {user.name || user.email}
              </p>
              <p className="text-xs text-snomed-grey/60 truncate leading-tight">
                {user.email}
              </p>
            </div>
          </div>

          {/* Logout */}
          <Link
            href="/api/auth/logout"
            className="flex items-center justify-center w-full min-h-[44px] px-4 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors duration-150"
          >
            Sign out
          </Link>
        </div>
      )}
    </aside>
  );
}
