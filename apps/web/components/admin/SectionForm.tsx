'use client';

import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { SpaceSection } from '@snomed/types';
import { csrfFetch } from '@/lib/csrf';
import { FormField, inputCls, primaryButtonCls, secondaryButtonCls } from './FormField';
import type { ShowToast } from './useToast';

interface SectionFormData {
  id: string;
  name: string;
  description: string;
  driveFolderId: string;
  sortOrder: string;
}

const EMPTY_FORM: SectionFormData = { id: '', name: '', description: '', driveFolderId: '', sortOrder: '0' };

function sectionToForm(s: SpaceSection): SectionFormData {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    driveFolderId: s.driveFolderId,
    sortOrder: String(s.sortOrder),
  };
}

interface Props {
  spaceId: string;
  spaceName?: string;
  /** The section being edited, or null to add a new one. */
  section: SpaceSection | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  showToast: ShowToast;
}

export function SectionForm({ spaceId, spaceName, section, onSaved, onCancel, showToast }: Props) {
  const [form, setForm] = useState<SectionFormData>(section ? sectionToForm(section) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<SectionFormData>) => setForm((f) => ({ ...f, ...patch }));

  const canSave = !saving && !!form.name && !!form.id && !!form.driveFolderId;

  async function save() {
    setSaving(true);
    try {
      const payload = {
        id: form.id.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        driveFolderId: form.driveFolderId.trim(),
        sortOrder: parseInt(form.sortOrder, 10) || 0,
      };

      const url = section
        ? `/api/admin/spaces/${spaceId}/sections/${section.id}`
        : `/api/admin/spaces/${spaceId}/sections`;
      const res = await csrfFetch(url, {
        method: section ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Save failed');
      }

      await onSaved();
      showToast(section ? 'Section updated.' : 'Section added.', 'success');
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
        <div>
          <p className="text-xs text-snomed-grey/50">{spaceName}</p>
          <h2 className="text-lg font-semibold text-snomed-grey">
            {section ? `Edit section: ${section.name}` : 'Add Document Section'}
          </h2>
        </div>
      </div>

      <div className="rounded-xl border border-snomed-border bg-white shadow-sm p-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Section ID" hint="Unique slug within this space, e.g. agendas" required>
            <input
              className={inputCls}
              value={form.id}
              onChange={(e) => set({ id: e.target.value })}
              placeholder="agendas"
              disabled={!!section}
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

        <FormField label="Section Name" required>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Agendas"
          />
        </FormField>

        <FormField label="Description">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Short description shown on the space landing page"
          />
        </FormField>

        <FormField label="Drive Folder ID" hint="The Google Drive folder ID that contains this section's documents" required>
          <input
            className={inputCls}
            value={form.driveFolderId}
            onChange={(e) => set({ driveFolderId: e.target.value })}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          />
        </FormField>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={!canSave} className={primaryButtonCls}>
          <Save size={16} />
          {saving ? 'Saving…' : section ? 'Save Changes' : 'Add Section'}
        </button>
        <button onClick={onCancel} className={secondaryButtonCls}>
          Cancel
        </button>
      </div>
    </div>
  );
}
