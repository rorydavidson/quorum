'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Spaces',    href: '/spaces',    icon: FolderOpen },
  { label: 'Search',    href: '/search',    icon: Search },
  { label: 'Admin',     href: '/admin',     icon: Settings, adminOnly: true },
];

interface NavItemsProps {
  isAdmin: boolean;
  onNavigate?: () => void;
}

export function NavItems({ isAdmin, onNavigate }: NavItemsProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation">
      <p className="px-4 mb-2 text-[10px] font-semibold tracking-widest uppercase text-snomed-grey/40 select-none">
        Navigation
      </p>
      <ul className="space-y-0.5">
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={[
                  'group relative flex items-center gap-3 px-4 min-h-[44px] text-sm font-medium rounded-lg transition-all duration-150',
                  isActive
                    ? 'bg-snomed-blue-light text-snomed-blue'
                    : 'text-snomed-grey hover:bg-gray-50 active:bg-gray-100',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Active left-edge accent */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-snomed-blue rounded-r-full"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  size={18}
                  className={[
                    'flex-shrink-0 transition-colors',
                    isActive ? 'text-snomed-blue' : 'text-snomed-grey/50 group-hover:text-snomed-grey/80',
                  ].join(' ')}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
