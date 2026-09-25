'use client';

import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { SpaceConfig } from '@snomed/types';
import { csrfFetch } from '@/lib/csrf';
import { FormField, inputCls, primaryButtonCls, secondaryButtonCls } from './FormField';
import type { ShowToast } from './useToast';

interface SpaceFormData {
  id: string;
  name: string;
  description: string;
  keycloakGroup: string;
  driveFolderId: string;
  calendarId: string;
  icalUrl: string;
  discourseCategorySlug: string;
  hierarchyCategory: string;
  uploadGroups: string; // comma-separated
  sortOrder: string;
}

const EMPTY_FORM: SpaceFormData = {
  id: '', name: '', description: '', keycloakGroup: '', driveFolderId: '',
  calendarId: '', icalUrl: '', discourseCategorySlug: '', hierarchyCategory: '', uploadGroups: '', sortOrder: '0',
};

function spaceToForm(s: SpaceConfig): SpaceFormData {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    keycloakGroup: s.keycloakGroup,
    driveFolderId: s.driveFolderId,
    calendarId: s.calendarId ?? '',
    icalUrl: s.icalUrl ?? '',
    discourseCategorySlug: s.discourseCategorySlug ?? '',
    hierarchyCategory: s.hierarchyCategory,
    uploadGroups: s.uploadGroups.join(', '),
    sortOrder: String(s.sortOrder),
  };
}

interface Props {
  /** The space being edited, or null to create a new one. */
  space: SpaceConfig | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  showToast: ShowToast;
}

export function SpaceForm({ space, onSaved, onCancel, showToast }: Props) {
  const [form, setForm] = useState<SpaceFormData>(space ? spaceToForm(space) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<SpaceFormData>) => setForm((f) => ({ ...f, ...patch }));

  const canSave =
    !saving && !!form.name && !!form.id && !!form.keycloakGroup && !!form.driveFolderId && !!form.hierarchyCategory;

  async function save() {
    setSaving(true);
    try {
      const payload = {
        id: form.id.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        keycloakGroup: form.keycloakGroup.trim(),
        driveFolderId: form.driveFolderId.trim(),
        calendarId: form.calendarId.trim() || undefined,
        icalUrl: form.icalUrl.trim() || undefined,
        discourseCategorySlug: form.discourseCategorySlug.trim() || undefined,
        hierarchyCategory: form.hierarchyCategory.trim(),
        uploadGroups: form.uploadGroups.split(',').map((g) => g.trim()).filter(Boolean),
        sortOrder: parseInt(form.sortOrder, 10) || 0,
      };

      const url = space ? `/api/admin/spaces/${space.id}` : '/api/admin/spaces';
      const res = await csrfFetch(url, {
        method: space ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Save failed');
      }

      await onSaved();
      showToast(space ? 'Space updated.' : 'Space created.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onCancel}
          className="text-snomed-grey/50 hover:text-snomed-grey transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <h2 className="text-lg font-semibold text-snomed-grey">
          {space ? `Edit: ${space.name}` : 'Create Space'}
        </h2>
      </div>

      <div className="rounded-xl border border-snomed-border bg-white shadow-sm p-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Space ID" hint="Unique slug, e.g. board — cannot be changed after creation" required>
            <input
              className={inputCls}
              value={form.id}
              onChange={(e) => set({ id: e.target.value })}
              placeholder="board"
              disabled={!!space}
            />
          </FormField>
          <FormField label="Sort Order" hint="Lower numbers appear first">
            <input
              type="number"
              className={inputCls}
              value={form.sortOrder}
              onChange={(e) => set({ sortOrder: e.target.value })}
            />
          </FormField>
        </div>

        <FormField label="Display Name" required>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Board of Management"
          />
        </FormField>

        <FormField label="Description">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Short description shown on the space card"
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Keycloak Group" hint="e.g. board-members or /board-members" required>
            <input
              className={inputCls}
              value={form.keycloakGroup}
              onChange={(e) => set({ keycloakGroup: e.target.value })}
              placeholder="board-members"
            />
          </FormField>
          <FormField label="Hierarchy Category" hint="e.g. Board Level, Working Groups" required>
            <input
              className={inputCls}
              value={form.hierarchyCategory}
              onChange={(e) => set({ hierarchyCategory: e.target.value })}
              placeholder="Board Level"
            />
          </FormField>
        </div>

        <FormField label="Default Drive Folder ID" hint="Google Drive folder ID — used when no sections are defined" required>
          <input
            className={inputCls}
            value={form.driveFolderId}
            onChange={(e) => set({ driveFolderId: e.target.value })}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          />
        </FormField>

        <FormField
          label="Google Calendar ID"
          hint="Optional — use with Google Service Account credentials (private calendars)"
        >
          <input
            className={inputCls}
            value={form.calendarId}
            onChange={(e) => set({ calendarId: e.target.value })}
            placeholder="c_abc123@group.calendar.google.com"
          />
        </FormField>

        <FormField
          label="iCal / ICS Feed URL"
          hint="Optional — paste any public iCal URL (Google, Outlook, Confluence, etc.). Works without credentials."
        >
          <input
            className={inputCls}
            value={form.icalUrl}
            onChange={(e) => set({ icalUrl: e.target.value })}
            placeholder="https://calendar.google.com/calendar/ical/…/public/basic.ics"
          />
        </FormField>

        <FormField
          label="Discourse Category Slug"
          hint="Optional — Discourse forum category slug (e.g. board-members). Topics from this category will appear on the space overview."
        >
          <input
            className={inputCls}
            value={form.discourseCategorySlug}
            onChange={(e) => set({ discourseCategorySlug: e.target.value })}
            placeholder="board-members"
          />
        </FormField>

        <FormField label="Upload Groups" hint="Keycloak groups allowed to upload. Comma-separated, e.g. secretariat, board-members">
          <input
            className={inputCls}
            value={form.uploadGroups}
            onChange={(e) => set({ uploadGroups: e.target.value })}
            placeholder="secretariat"
          />
        </FormField>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={!canSave} className={primaryButtonCls}>
          <Save size={16} />
          {saving ? 'Saving…' : space ? 'Save Changes' : 'Create Space'}
        </button>
        <button onClick={onCancel} className={secondaryButtonCls}>
          Cancel
        </button>
      </div>
    </div>
  );
}
