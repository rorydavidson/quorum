'use client';

import { useCallback, useState } from 'react';
import type { SpaceConfig, SpaceSection } from '@snomed/types';
import { AdminHeader } from './AdminHeader';
import { AuditLogView } from './AuditLogView';
import { CategoryOrderView } from './CategoryOrderView';
import { MetricsPanel } from './MetricsPanel';
import { NotificationsView } from './NotificationsView';
import { SectionForm } from './SectionForm';
import { SpaceForm } from './SpaceForm';
import { SpacesList } from './SpacesList';
import { useToast } from './useToast';

type View = 'list' | 'space-form' | 'section-form' | 'audit-log' | 'category-order' | 'analytics' | 'notifications';

const TABS: ReadonlyArray<{ key: View; label: string }> = [
  { key: 'list', label: 'Spaces' },
  { key: 'category-order', label: 'Category Order' },
  { key: 'audit-log', label: 'Audit Log' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'notifications', label: 'Notifications' },
];

interface Props {
  initialSpaces: SpaceConfig[];
}

/**
 * Admin dashboard. Owns the list of spaces and which view is showing; each
 * view component owns its own data loading and actions.
 */
export function AdminShell({ initialSpaces }: Props) {
  const [spaces, setSpaces] = useState<SpaceConfig[]>(initialSpaces);
  const [expandedSpaceId, setExpandedSpaceId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');

  // Which space / section a form is editing (null = creating).
  const [editingSpace, setEditingSpace] = useState<SpaceConfig | null>(null);
  const [editingSection, setEditingSection] = useState<SpaceSection | null>(null);
  const [editingSectionSpaceId, setEditingSectionSpaceId] = useState<string>('');

  const { showToast, toastElement } = useToast();

  const refreshSpaces = useCallback(async () => {
    const res = await fetch('/api/admin/spaces');
    if (res.ok) {
      setSpaces((await res.json()) as SpaceConfig[]);
    }
  }, []);

  const backToList = () => setView('list');

  const tabs = TABS.map((tab) => (
    <button
      key={tab.key}
      onClick={() => setView(tab.key)}
      className={`pb-2 border-b-2 transition-all ${
        view === tab.key
          ? 'border-snomed-blue text-snomed-blue'
          : 'border-transparent text-snomed-grey/50 hover:text-snomed-grey'
      }`}
    >
      <h2 className="text-base font-semibold whitespace-nowrap">{tab.label}</h2>
    </button>
  ));

  let content: React.ReactNode;
  switch (view) {
    case 'space-form':
      content = (
        <SpaceForm
          space={editingSpace}
          onSaved={async () => {
            await refreshSpaces();
            setView('list');
          }}
          onCancel={backToList}
          showToast={showToast}
        />
      );
      break;

    case 'section-form':
      content = (
        <SectionForm
          spaceId={editingSectionSpaceId}
          spaceName={spaces.find((s) => s.id === editingSectionSpaceId)?.name}
          section={editingSection}
          onSaved={async () => {
            await refreshSpaces();
            setExpandedSpaceId(editingSectionSpaceId);
            setView('list');
          }}
          onCancel={backToList}
          showToast={showToast}
        />
      );
      break;

    case 'category-order':
      content = <CategoryOrderView tabs={tabs} showToast={showToast} />;
      break;

    case 'audit-log':
      content = <AuditLogView tabs={tabs} showToast={showToast} />;
      break;

    case 'analytics':
      content = (
        <div>
          <AdminHeader tabs={tabs} />
          <MetricsPanel spaceNames={Object.fromEntries(spaces.map((s) => [s.id, s.name]))} />
        </div>
      );
      break;

    case 'notifications':
      content = <NotificationsView tabs={tabs} spaces={spaces} showToast={showToast} />;
      break;

    case 'list':
    default:
      content = (
        <SpacesList
          tabs={tabs}
          spaces={spaces}
          expandedSpaceId={expandedSpaceId}
          onToggleExpand={setExpandedSpaceId}
          refreshSpaces={refreshSpaces}
          onCreateSpace={() => {
            setEditingSpace(null);
            setView('space-form');
          }}
          onEditSpace={(space) => {
            setEditingSpace(space);
            setView('space-form');
          }}
          onCreateSection={(spaceId) => {
            setEditingSectionSpaceId(spaceId);
            setEditingSection(null);
            setView('section-form');
          }}
          onEditSection={(spaceId, section) => {
            setEditingSectionSpaceId(spaceId);
            setEditingSection(section);
            setView('section-form');
          }}
          showToast={showToast}
        />
      );
  }

  return (
    <div>
      {content}
      {toastElement}
    </div>
  );
}
