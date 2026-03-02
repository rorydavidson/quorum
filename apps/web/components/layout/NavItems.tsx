'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FolderOpen,
  Search,
  Settings,
  ChevronLeft,
  FileText,
  Calendar,
  Folder,
  type LucideIcon,
} from 'lucide-react';
import type { SpaceConfig } from '@snomed/types';
import { getSpaceMeta } from '@/lib/api-client';

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
  const [spaceConfig, setSpaceConfig] = useState<SpaceConfig | null>(null);

  // Detect if we're inside a space and extract its ID from the pathname
  const spaceMatch = pathname.match(/^\/spaces\/([^/]+)/);
  const currentSpaceId = spaceMatch?.[1] ?? null;

  useEffect(() => {
    if (!currentSpaceId) {
      setSpaceConfig(null);
      return;
    }
    let cancelled = false;
    getSpaceMeta(currentSpaceId)
      .then((space) => { if (!cancelled) setSpaceConfig(space); })
      .catch(() => { if (!cancelled) setSpaceConfig(null); });
    return () => { cancelled = true; };
  }, [currentSpaceId]);

  const isOverview  = pathname === `/spaces/${currentSpaceId}`;
  const isDocuments = !!currentSpaceId && pathname.startsWith(`/spaces/${currentSpaceId}/documents`);
  const isCalendar  = pathname === `/spaces/${currentSpaceId}/calendar`;
  const hasCalendar = !!(spaceConfig?.calendarId || spaceConfig?.icalUrl);

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

      {/* Space navigation — shown when inside a /spaces/[spaceId] route */}
      {currentSpaceId && (
        <div className="mt-5 pt-4 border-t border-snomed-border">
          <p className="px-4 mb-2 text-[10px] font-semibold tracking-widest uppercase text-snomed-grey/40 select-none">
            Current Space
          </p>

          {/* Back to all spaces */}
          <Link
            href="/spaces"
            onClick={onNavigate}
            className="flex items-center gap-1.5 px-4 min-h-[36px] text-xs text-snomed-grey/50 hover:text-snomed-blue hover:bg-gray-50 rounded-lg transition-colors"
          >
            <ChevronLeft size={13} aria-hidden="true" />
            All Spaces
          </Link>

          {/* Space name */}
          {spaceConfig && (
            <div className="mt-1 mb-2 px-4 flex items-center gap-2.5">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-snomed-blue-light flex items-center justify-center">
                <FolderOpen size={14} className="text-snomed-blue" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-snomed-grey leading-tight truncate">
                {spaceConfig.name}
              </p>
            </div>
          )}

          {/* Space links */}
          <ul className="space-y-0.5">
            <SpaceNavLink
              href={`/spaces/${currentSpaceId}`}
              active={isOverview}
              icon={<FolderOpen size={16} />}
              label="Overview"
              onClick={onNavigate}
            />

            <SpaceNavLink
              href={`/spaces/${currentSpaceId}/documents`}
              active={isDocuments}
              icon={<FileText size={16} />}
              label="Documents"
              onClick={onNavigate}
            />

            {/* Section sub-links */}
            {spaceConfig?.sections && spaceConfig.sections.length > 0 && (
              <ul className="ml-4 space-y-0.5 border-l border-snomed-border pl-2.5 pt-0.5 pb-1">
                {spaceConfig.sections.map((section) => {
                  const active = pathname === `/spaces/${currentSpaceId}/documents/${section.id}`;
                  return (
                    <li key={section.id}>
                      <Link
                        href={`/spaces/${currentSpaceId}/documents/${section.id}`}
                        onClick={onNavigate}
                        className={[
                          'flex items-center gap-2 px-2 min-h-[36px] text-xs rounded-md transition-all duration-150 truncate',
                          active
                            ? 'bg-snomed-blue-light text-snomed-blue font-medium'
                            : 'text-snomed-grey/65 hover:text-snomed-grey hover:bg-gray-50',
                        ].join(' ')}
                      >
                        <Folder size={13} className="flex-shrink-0" aria-hidden="true" />
                        <span className="truncate">{section.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Calendar — only shown when space has a calendar configured */}
            {hasCalendar && (
              <SpaceNavLink
                href={`/spaces/${currentSpaceId}/calendar`}
                active={isCalendar}
                icon={<Calendar size={16} />}
                label="Calendar"
                onClick={onNavigate}
              />
            )}
          </ul>
        </div>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SpaceNavLinkProps {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function SpaceNavLink({ href, active, icon, label, onClick }: SpaceNavLinkProps) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className={[
          'relative flex items-center gap-2.5 px-4 min-h-[40px] text-sm rounded-lg transition-all duration-150',
          active
            ? 'bg-snomed-blue-light text-snomed-blue font-medium'
            : 'text-snomed-grey hover:bg-gray-50',
        ].join(' ')}
      >
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-snomed-blue rounded-r-full"
            aria-hidden="true"
          />
        )}
        <span
          className={[
            'flex-shrink-0 transition-colors',
            active ? 'text-snomed-blue' : 'text-snomed-grey/50',
          ].join(' ')}
          aria-hidden="true"
        >
          {icon}
        </span>
        {label}
      </Link>
    </li>
  );
}
