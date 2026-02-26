'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  FolderOpen,
  FileText,
  Calendar,
  Folder,
} from 'lucide-react';
import type { SpaceConfig } from '@snomed/types';

interface Props {
  space: SpaceConfig | null;
  spaceId: string;
}

export function SpaceNav({ space, spaceId }: Props) {
  const pathname = usePathname();

  const isOverview  = pathname === `/spaces/${spaceId}`;
  const isDocuments = pathname.startsWith(`/spaces/${spaceId}/documents`);
  const isCalendar  = pathname === `/spaces/${spaceId}/calendar`;
  const hasCalendar = !!(space?.calendarId || space?.icalUrl);

  return (
    <aside
      className="hidden lg:flex flex-col w-52 flex-shrink-0 sticky top-0 h-screen border-r border-snomed-border bg-white overflow-y-auto"
      aria-label="Space navigation"
    >
      {/* Space header */}
      <div className="px-3 pt-4 pb-3 border-b border-snomed-border flex-shrink-0">
        <Link
          href="/spaces"
          className="flex items-center gap-1.5 text-xs text-snomed-grey/50 hover:text-snomed-blue transition-colors min-h-[32px] px-2 rounded-lg hover:bg-gray-50"
        >
          <ChevronLeft size={13} aria-hidden="true" />
          All Spaces
        </Link>

        <div className="mt-2.5 px-2 flex items-center gap-2.5">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-snomed-blue-light flex items-center justify-center">
            <FolderOpen size={15} className="text-snomed-blue" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-snomed-grey leading-tight truncate">
            {space?.name ?? spaceId}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {/* Overview */}
        <SpaceNavLink
          href={`/spaces/${spaceId}`}
          active={isOverview}
          icon={<FolderOpen size={16} />}
          label="Overview"
        />

        {/* Documents */}
        <SpaceNavLink
          href={`/spaces/${spaceId}/documents`}
          active={isDocuments}
          icon={<FileText size={16} />}
          label="Documents"
        />

        {/* Section sub-links */}
        {space?.sections && space.sections.length > 0 && (
          <ul className="ml-4 space-y-0.5 border-l border-snomed-border pl-2.5 pt-0.5 pb-1">
            {space.sections.map((section) => {
              const active = pathname === `/spaces/${spaceId}/documents/${section.id}`;
              return (
                <li key={section.id}>
                  <Link
                    href={`/spaces/${spaceId}/documents/${section.id}`}
                    className={[
                      'flex items-center gap-2 px-2 min-h-[36px] text-xs rounded-md transition-all duration-150 truncate',
                      active
                        ? 'bg-snomed-blue-light text-snomed-blue font-medium'
                        : 'text-snomed-grey/65 hover:text-snomed-grey hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <Folder
                      size={13}
                      className="flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{section.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* Calendar */}
        {hasCalendar && (
          <SpaceNavLink
            href={`/spaces/${spaceId}/calendar`}
            active={isCalendar}
            icon={<Calendar size={16} />}
            label="Calendar"
          />
        )}
      </nav>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Internal nav link
// ---------------------------------------------------------------------------

interface NavLinkProps {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}

function SpaceNavLink({ href, active, icon, label }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={[
        'relative flex items-center gap-2.5 px-3 min-h-[40px] text-sm rounded-lg transition-all duration-150',
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
  );
}
