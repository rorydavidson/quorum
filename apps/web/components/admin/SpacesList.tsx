'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import type { SpaceConfig, SpaceSection } from '@snomed/types';
import { csrfFetch } from '@/lib/csrf';
import { AdminHeader } from './AdminHeader';
import type { ShowToast } from './useToast';

interface Props {
  tabs: React.ReactNode;
  spaces: SpaceConfig[];
  expandedSpaceId: string | null;
  onToggleExpand: (spaceId: string | null) => void;
  refreshSpaces: () => Promise<void>;
  onCreateSpace: () => void;
  onEditSpace: (space: SpaceConfig) => void;
  onCreateSection: (spaceId: string) => void;
  onEditSection: (spaceId: string, section: SpaceSection) => void;
  showToast: ShowToast;
}

const toolbarButtonCls =
  'flex items-center gap-2 rounded-lg border border-snomed-border bg-white px-4 py-2.5 text-sm font-medium text-snomed-grey hover:bg-gray-50 transition-colors min-h-[44px]';

/**
 * The default admin view: every configured space with its document sections,
 * plus the site-level Export / Import / Reset actions.
 */
export function SpacesList({
  tabs,
  spaces,
  expandedSpaceId,
  onToggleExpand,
  refreshSpaces,
  onCreateSpace,
  onEditSpace,
  onCreateSection,
  onEditSection,
  showToast,
}: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDeleteSpace(space: SpaceConfig) {
    if (!confirm(`Delete "${space.name}"? This will also delete all its sections. This cannot be undone.`)) return;
    setDeleting(space.id);
    try {
      const res = await csrfFetch(`/api/admin/spaces/${space.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await refreshSpaces();
      showToast(`"${space.name}" deleted.`, 'success');
    } catch {
      showToast('Delete failed.', 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function confirmDeleteSection(spaceId: string, section: SpaceSection) {
    if (!confirm(`Delete section "${section.name}"? This cannot be undone.`)) return;
    setDeleting(`${spaceId}:${section.id}`);
    try {
      const res = await csrfFetch(`/api/admin/spaces/${spaceId}/sections/${section.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await refreshSpaces();
      showToast(`Section "${section.name}" deleted.`, 'success');
    } catch {
      showToast('Delete failed.', 'error');
    } finally {
      setDeleting(null);
    }
  }

  // -------------------------------------------------------------------------
  // Backup, import, reset
  // -------------------------------------------------------------------------

  /** Downloads the site backup. Returns false (after a toast) if it failed. */
  async function exportSettings(): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snomed-spaces-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Settings exported successfully.', 'success');
      return true;
    } catch {
      showToast('Export failed.', 'error');
      return false;
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Importing settings will OVERWRITE all existing spaces and sections. Are you sure you want to proceed?')) {
      e.target.value = '';
      return;
    }

    setBusy(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      const res = await csrfFetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Import failed');
      }

      await refreshSpaces();
      showToast('Settings imported successfully.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function resetSiteSettings() {
    if (!confirm('This will DELETE all spaces, sections, and site settings. A backup will be downloaded first. Are you absolutely sure?')) {
      return;
    }
    // Second confirmation for such a destructive action
    if (!confirm('FINAL WARNING: This action is permanent (though you will have the backup file). Proceed?')) {
      return;
    }

    setBusy(true);
    try {
      // Never wipe the site without a backup in hand.
      const exported = await exportSettings();
      if (!exported) {
        showToast('Reset aborted: the backup could not be downloaded.', 'error');
        return;
      }

      const res = await csrfFetch('/api/admin/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');

      await refreshSpaces();
      showToast('Site settings cleared and backup downloaded.', 'success');
    } catch {
      showToast('An error occurred during reset.', 'error');
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div>
      <AdminHeader tabs={tabs}>
        <button onClick={exportSettings} className={toolbarButtonCls} title="Export all settings to JSON">
          <Download size={16} />
          Export
        </button>
        <div className="relative">
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            title="Import settings from JSON"
          />
          <button className={toolbarButtonCls}>
            <Upload size={16} />
            Import
          </button>
        </div>
        <button
          onClick={onCreateSpace}
          className="flex items-center gap-2 rounded-lg bg-snomed-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-snomed-dark-blue transition-colors min-h-[44px]"
        >
          <Plus size={16} />
          New Space
        </button>
        <button
          onClick={resetSiteSettings}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors min-h-[44px] disabled:opacity-50"
          title="Download backup and clear all site settings"
        >
          <RotateCcw size={16} />
          Reset Site
        </button>
      </AdminHeader>

      <div className="space-y-3">
        {spaces.length === 0 && (
          <div className="rounded-xl border border-dashed border-snomed-border bg-white p-12 text-center">
            <Settings size={32} className="mx-auto mb-3 text-snomed-grey/30" />
            <p className="text-sm text-snomed-grey/60">No spaces configured yet.</p>
            <button onClick={onCreateSpace} className="mt-3 text-sm text-snomed-blue hover:underline">
              Create your first space →
            </button>
          </div>
        )}

        {spaces.map((space) => {
          const isExpanded = expandedSpaceId === space.id;
          const isDeleting = deleting === space.id;

          return (
            <div key={space.id} className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden">
              {/* Space row */}
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() => onToggleExpand(isExpanded ? null : space.id)}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-snomed-blue-light transition-colors"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-snomed-blue" />
                  ) : (
                    <ChevronRight size={16} className="text-snomed-grey/50" />
                  )}
                </button>

                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-snomed-blue-light flex items-center justify-center">
                  <FolderOpen size={17} className="text-snomed-blue" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-snomed-grey">{space.name}</span>
                    <span className="text-[11px] font-mono bg-gray-100 text-snomed-grey/60 px-1.5 py-0.5 rounded">
                      {space.id}
                    </span>
                    <span className="text-[11px] bg-snomed-blue-light text-snomed-blue px-1.5 py-0.5 rounded">
                      {space.hierarchyCategory}
                    </span>
                    {space.sections.length > 0 && (
                      <span className="text-[11px] text-snomed-grey/50">
                        {space.sections.length} section{space.sections.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-snomed-grey/50 mt-0.5 truncate">
                    Group: <span className="font-mono">{space.keycloakGroup}</span>
                  </p>
                </div>

                <div className="flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => onEditSpace(space)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-snomed-grey hover:bg-snomed-blue-light hover:text-snomed-blue transition-colors min-h-[36px]"
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    onClick={() => confirmDeleteSpace(space)}
                    disabled={isDeleting}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-snomed-grey hover:bg-red-50 hover:text-red-600 transition-colors min-h-[36px] disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                    {isDeleting ? '…' : 'Delete'}
                  </button>
                </div>
              </div>

              {/* Expanded: sections */}
              {isExpanded && (
                <div className="border-t border-snomed-border bg-snomed-blue-light/20">
                  {space.sections.length > 0 && (
                    <div className="divide-y divide-snomed-border/60">
                      {space.sections.map((section) => {
                        const sectionDeleting = deleting === `${space.id}:${section.id}`;
                        return (
                          <div key={section.id} className="flex items-center gap-3 pl-14 pr-5 py-3">
                            <Folder size={15} className="flex-shrink-0 text-snomed-blue/60" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-snomed-grey font-medium">{section.name}</span>
                                <span className="text-[11px] font-mono bg-gray-100 text-snomed-grey/50 px-1 py-0.5 rounded">
                                  {section.id}
                                </span>
                              </div>
                              {section.description && (
                                <p className="text-xs text-snomed-grey/50 truncate">{section.description}</p>
                              )}
                              <p className="text-[11px] font-mono text-snomed-grey/40 mt-0.5 truncate">
                                {section.driveFolderId}
                              </p>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-1">
                              <button
                                onClick={() => onEditSection(space.id, section)}
                                className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-snomed-grey hover:bg-white hover:text-snomed-blue transition-colors"
                              >
                                <Pencil size={12} />
                                Edit
                              </button>
                              <button
                                onClick={() => confirmDeleteSection(space.id, section)}
                                disabled={sectionDeleting}
                                className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-snomed-grey hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                              >
                                <Trash2 size={12} />
                                {sectionDeleting ? '…' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pl-14 pr-5 py-3 border-t border-snomed-border/60">
                    <button
                      onClick={() => onCreateSection(space.id)}
                      className="flex items-center gap-2 text-xs text-snomed-blue hover:text-snomed-dark-blue transition-colors min-h-[36px]"
                    >
                      <Plus size={14} />
                      Add document section
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
