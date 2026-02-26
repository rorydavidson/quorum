'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
  X,
  Save,
  AlertTriangle,
  CheckCircle2,
  Settings,
} from 'lucide-react';
import type { SpaceConfig, SpaceSection } from '@snomed/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type View = 'list' | 'space-form' | 'section-form';

interface SpaceFormData {
  id: string;
  name: string;
  description: string;
  keycloakGroup: string;
  driveFolderId: string;
  calendarId: string;
  hierarchyCategory: string;
  uploadGroups: string; // comma-separated
  sortOrder: string;
}

interface SectionFormData {
  id: string;
  name: string;
  description: string;
  driveFolderId: string;
  sortOrder: string;
}

const EMPTY_SPACE_FORM: SpaceFormData = {
  id: '', name: '', description: '', keycloakGroup: '', driveFolderId: '',
  calendarId: '', hierarchyCategory: '', uploadGroups: '', sortOrder: '0',
};

const EMPTY_SECTION_FORM: SectionFormData = {
  id: '', name: '', description: '', driveFolderId: '', sortOrder: '0',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spaceToForm(s: SpaceConfig): SpaceFormData {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    keycloakGroup: s.keycloakGroup,
    driveFolderId: s.driveFolderId,
    calendarId: s.calendarId ?? '',
    hierarchyCategory: s.hierarchyCategory,
    uploadGroups: s.uploadGroups.join(', '),
    sortOrder: String(s.sortOrder),
  };
}

function sectionToForm(s: SpaceSection): SectionFormData {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    driveFolderId: s.driveFolderId,
    sortOrder: String(s.sortOrder),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg text-sm font-medium ${
      type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      {type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {message}
    </div>
  );
}

function FormField({
  label, hint, required, children,
}: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-snomed-grey mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-snomed-grey/50">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-snomed-border bg-white px-3 py-2 text-sm text-snomed-grey placeholder:text-snomed-grey/40 focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue transition-colors';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  initialSpaces: SpaceConfig[];
}

export function AdminShell({ initialSpaces }: Props) {
  const [spaces, setSpaces] = useState<SpaceConfig[]>(initialSpaces);
  const [expandedSpaceId, setExpandedSpaceId] = useState<string | null>(null);

  // Form state
  const [view, setView] = useState<View>('list');
  const [editingSpace, setEditingSpace] = useState<SpaceConfig | null>(null); // null = creating
  const [editingSection, setEditingSection] = useState<SpaceSection | null>(null);
  const [editingSectionSpaceId, setEditingSectionSpaceId] = useState<string>('');

  const [spaceForm, setSpaceForm] = useState<SpaceFormData>(EMPTY_SPACE_FORM);
  const [sectionForm, setSectionForm] = useState<SectionFormData>(EMPTY_SECTION_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ---------------------------------------------------------------------------
  // Refresh spaces from API
  // ---------------------------------------------------------------------------

  const refreshSpaces = useCallback(async () => {
    const res = await fetch('/api/admin/spaces');
    if (res.ok) {
      const data = await res.json() as SpaceConfig[];
      setSpaces(data);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Space CRUD
  // ---------------------------------------------------------------------------

  function openCreateSpace() {
    setEditingSpace(null);
    setSpaceForm(EMPTY_SPACE_FORM);
    setView('space-form');
  }

  function openEditSpace(space: SpaceConfig) {
    setEditingSpace(space);
    setSpaceForm(spaceToForm(space));
    setView('space-form');
  }

  async function saveSpace() {
    setSaving(true);
    try {
      const payload = {
        id: spaceForm.id.trim(),
        name: spaceForm.name.trim(),
        description: spaceForm.description.trim() || undefined,
        keycloakGroup: spaceForm.keycloakGroup.trim(),
        driveFolderId: spaceForm.driveFolderId.trim(),
        calendarId: spaceForm.calendarId.trim() || undefined,
        hierarchyCategory: spaceForm.hierarchyCategory.trim(),
        uploadGroups: spaceForm.uploadGroups.split(',').map((g) => g.trim()).filter(Boolean),
        sortOrder: parseInt(spaceForm.sortOrder, 10) || 0,
      };

      const url = editingSpace ? `/api/admin/spaces/${editingSpace.id}` : '/api/admin/spaces';
      const method = editingSpace ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Save failed');
      }

      await refreshSpaces();
      setView('list');
      showToast(editingSpace ? 'Space updated.' : 'Space created.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteSpace(space: SpaceConfig) {
    if (!confirm(`Delete "${space.name}"? This will also delete all its sections. This cannot be undone.`)) return;
    setDeleting(space.id);
    try {
      const res = await fetch(`/api/admin/spaces/${space.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await refreshSpaces();
      showToast(`"${space.name}" deleted.`, 'success');
    } catch {
      showToast('Delete failed.', 'error');
    } finally {
      setDeleting(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Section CRUD
  // ---------------------------------------------------------------------------

  function openCreateSection(spaceId: string) {
    setEditingSectionSpaceId(spaceId);
    setEditingSection(null);
    setSectionForm(EMPTY_SECTION_FORM);
    setView('section-form');
  }

  function openEditSection(spaceId: string, section: SpaceSection) {
    setEditingSectionSpaceId(spaceId);
    setEditingSection(section);
    setSectionForm(sectionToForm(section));
    setView('section-form');
  }

  async function saveSection() {
    setSaving(true);
    try {
      const payload = {
        id: sectionForm.id.trim(),
        name: sectionForm.name.trim(),
        description: sectionForm.description.trim() || undefined,
        driveFolderId: sectionForm.driveFolderId.trim(),
        sortOrder: parseInt(sectionForm.sortOrder, 10) || 0,
      };

      const url = editingSection
        ? `/api/admin/spaces/${editingSectionSpaceId}/sections/${editingSection.id}`
        : `/api/admin/spaces/${editingSectionSpaceId}/sections`;
      const method = editingSection ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Save failed');
      }

      await refreshSpaces();
      setView('list');
      setExpandedSpaceId(editingSectionSpaceId);
      showToast(editingSection ? 'Section updated.' : 'Section added.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteSection(spaceId: string, section: SpaceSection) {
    if (!confirm(`Delete section "${section.name}"? This cannot be undone.`)) return;
    setDeleting(`${spaceId}:${section.id}`);
    try {
      const res = await fetch(`/api/admin/spaces/${spaceId}/sections/${section.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await refreshSpaces();
      showToast(`Section "${section.name}" deleted.`, 'success');
    } catch {
      showToast('Delete failed.', 'error');
    } finally {
      setDeleting(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render: Space Form
  // ---------------------------------------------------------------------------

  if (view === 'space-form') {
    return (
      <div className="max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="text-snomed-grey/50 hover:text-snomed-grey transition-colors"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-snomed-grey">
            {editingSpace ? `Edit: ${editingSpace.name}` : 'Create Space'}
          </h2>
        </div>

        <div className="rounded-xl border border-snomed-border bg-white shadow-sm p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Space ID" hint="Unique slug, e.g. board — cannot be changed after creation" required>
              <input
                className={inputCls}
                value={spaceForm.id}
                onChange={(e) => setSpaceForm({ ...spaceForm, id: e.target.value })}
                placeholder="board"
                disabled={!!editingSpace}
              />
            </FormField>
            <FormField label="Sort Order" hint="Lower numbers appear first">
              <input
                type="number"
                className={inputCls}
                value={spaceForm.sortOrder}
                onChange={(e) => setSpaceForm({ ...spaceForm, sortOrder: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Display Name" required>
            <input
              className={inputCls}
              value={spaceForm.name}
              onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })}
              placeholder="Board of Management"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={spaceForm.description}
              onChange={(e) => setSpaceForm({ ...spaceForm, description: e.target.value })}
              placeholder="Short description shown on the space card"
            />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Keycloak Group" hint='e.g. board-members or /board-members' required>
              <input
                className={inputCls}
                value={spaceForm.keycloakGroup}
                onChange={(e) => setSpaceForm({ ...spaceForm, keycloakGroup: e.target.value })}
                placeholder="board-members"
              />
            </FormField>
            <FormField label="Hierarchy Category" hint='e.g. Board Level, Working Groups' required>
              <input
                className={inputCls}
                value={spaceForm.hierarchyCategory}
                onChange={(e) => setSpaceForm({ ...spaceForm, hierarchyCategory: e.target.value })}
                placeholder="Board Level"
              />
            </FormField>
          </div>

          <FormField label="Default Drive Folder ID" hint="Google Drive folder ID — used when no sections are defined" required>
            <input
              className={inputCls}
              value={spaceForm.driveFolderId}
              onChange={(e) => setSpaceForm({ ...spaceForm, driveFolderId: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
          </FormField>

          <FormField label="Google Calendar ID" hint="Optional — links meeting events to this space">
            <input
              className={inputCls}
              value={spaceForm.calendarId}
              onChange={(e) => setSpaceForm({ ...spaceForm, calendarId: e.target.value })}
              placeholder="c_abc123@group.calendar.google.com"
            />
          </FormField>

          <FormField label="Upload Groups" hint="Keycloak groups allowed to upload. Comma-separated, e.g. secretariat, board-members">
            <input
              className={inputCls}
              value={spaceForm.uploadGroups}
              onChange={(e) => setSpaceForm({ ...spaceForm, uploadGroups: e.target.value })}
              placeholder="secretariat"
            />
          </FormField>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={saveSpace}
            disabled={saving || !spaceForm.name || !spaceForm.id || !spaceForm.keycloakGroup || !spaceForm.driveFolderId || !spaceForm.hierarchyCategory}
            className="flex items-center gap-2 rounded-lg bg-snomed-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-snomed-dark-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            <Save size={16} />
            {saving ? 'Saving…' : editingSpace ? 'Save Changes' : 'Create Space'}
          </button>
          <button
            onClick={() => setView('list')}
            className="rounded-lg border border-snomed-border px-5 py-2.5 text-sm text-snomed-grey hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Section Form
  // ---------------------------------------------------------------------------

  if (view === 'section-form') {
    const parentSpace = spaces.find((s) => s.id === editingSectionSpaceId);
    return (
      <div className="max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="text-snomed-grey/50 hover:text-snomed-grey transition-colors"
          >
            <X size={20} />
          </button>
          <div>
            <p className="text-xs text-snomed-grey/50">{parentSpace?.name}</p>
            <h2 className="text-lg font-semibold text-snomed-grey">
              {editingSection ? `Edit section: ${editingSection.name}` : 'Add Document Section'}
            </h2>
          </div>
        </div>

        <div className="rounded-xl border border-snomed-border bg-white shadow-sm p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Section ID" hint="Unique slug within this space, e.g. agendas" required>
              <input
                className={inputCls}
                value={sectionForm.id}
                onChange={(e) => setSectionForm({ ...sectionForm, id: e.target.value })}
                placeholder="agendas"
                disabled={!!editingSection}
              />
            </FormField>
            <FormField label="Sort Order" hint="Lower numbers appear first">
              <input
                type="number"
                className={inputCls}
                value={sectionForm.sortOrder}
                onChange={(e) => setSectionForm({ ...sectionForm, sortOrder: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Section Name" required>
            <input
              className={inputCls}
              value={sectionForm.name}
              onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
              placeholder="Agendas"
            />
          </FormField>

          <FormField label="Description">
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={sectionForm.description}
              onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
              placeholder="Short description shown on the space landing page"
            />
          </FormField>

          <FormField label="Drive Folder ID" hint="The Google Drive folder ID that contains this section's documents" required>
            <input
              className={inputCls}
              value={sectionForm.driveFolderId}
              onChange={(e) => setSectionForm({ ...sectionForm, driveFolderId: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
          </FormField>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={saveSection}
            disabled={saving || !sectionForm.name || !sectionForm.id || !sectionForm.driveFolderId}
            className="flex items-center gap-2 rounded-lg bg-snomed-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-snomed-dark-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            <Save size={16} />
            {saving ? 'Saving…' : editingSection ? 'Save Changes' : 'Add Section'}
          </button>
          <button
            onClick={() => setView('list')}
            className="rounded-lg border border-snomed-border px-5 py-2.5 text-sm text-snomed-grey hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Spaces list
  // ---------------------------------------------------------------------------

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-snomed-grey">Spaces</h2>
          <p className="text-xs text-snomed-grey/50 mt-0.5">{spaces.length} space{spaces.length !== 1 ? 's' : ''} configured</p>
        </div>
        <button
          onClick={openCreateSpace}
          className="flex items-center gap-2 rounded-lg bg-snomed-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-snomed-dark-blue transition-colors min-h-[44px]"
        >
          <Plus size={16} />
          New Space
        </button>
      </div>

      <div className="space-y-3">
        {spaces.length === 0 && (
          <div className="rounded-xl border border-dashed border-snomed-border bg-white p-12 text-center">
            <Settings size={32} className="mx-auto mb-3 text-snomed-grey/30" />
            <p className="text-sm text-snomed-grey/60">No spaces configured yet.</p>
            <button
              onClick={openCreateSpace}
              className="mt-3 text-sm text-snomed-blue hover:underline"
            >
              Create your first space →
            </button>
          </div>
        )}

        {spaces.map((space) => {
          const isExpanded = expandedSpaceId === space.id;
          const isDeleting = deleting === space.id;

          return (
            <div
              key={space.id}
              className="rounded-xl border border-snomed-border bg-white shadow-sm overflow-hidden"
            >
              {/* Space row */}
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() => setExpandedSpaceId(isExpanded ? null : space.id)}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-snomed-blue-light transition-colors"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded
                    ? <ChevronDown size={16} className="text-snomed-blue" />
                    : <ChevronRight size={16} className="text-snomed-grey/50" />
                  }
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
                    onClick={() => openEditSpace(space)}
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
                  {/* Section list */}
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
                                onClick={() => openEditSection(space.id, section)}
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

                  {/* Add section button */}
                  <div className="pl-14 pr-5 py-3">
                    <button
                      onClick={() => openCreateSection(space.id)}
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

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
