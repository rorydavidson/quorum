'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { FileText, Plus, Trash2, Clock, FolderOpen, ChevronDown, ChevronRight, MoveRight } from 'lucide-react';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import { CreateDocumentDialog } from './CreateDocumentDialog';
import { deleteAuthoredDocument, moveDocumentToSection } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import type { PortalDocument, SpaceSection } from '@snomed/types';

interface Props {
  documents: PortalDocument[];
  spaceId: string;
  sections?: SpaceSection[];
  canUpload: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const DOC_TYPE_LABELS: Record<string, string> = {
  agenda: 'Agenda',
  resolution: 'Resolution',
  minutes: 'Minutes',
  general: 'General',
};

export function AuthoredDocumentList({ documents, spaceId, sections, canUpload }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const hasSections = sections && sections.length > 0;

  const grouped = useMemo(() => {
    if (!hasSections) return null;
    const sectionMap = new Map<string, PortalDocument[]>();
    const unfiled: PortalDocument[] = [];
    for (const doc of documents) {
      if (doc.sectionId) {
        const list = sectionMap.get(doc.sectionId) ?? [];
        list.push(doc);
        sectionMap.set(doc.sectionId, list);
      } else {
        unfiled.push(doc);
      }
    }
    const orderedSections = sections!
      .map((s) => ({ section: s, docs: sectionMap.get(s.id) ?? [] }))
      .filter((g) => g.docs.length > 0);
    return { sections: orderedSections, unfiled };
  }, [documents, sections, hasSections]);

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(docId);
    try {
      await deleteAuthoredDocument(spaceId, docId);
      router.refresh();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleMove = async (docId: string, targetSectionId: string | null) => {
    setMoving(docId);
    try {
      await moveDocumentToSection(spaceId, docId, targetSectionId);
      router.refresh();
    } catch (err) {
      console.error('Move failed:', err);
    } finally {
      setMoving(null);
    }
  };

  const renderMoveMenu = (doc: PortalDocument) => {
    if (!hasSections || !canUpload) return null;
    return (
      <select
        value={doc.sectionId ?? ''}
        onChange={(e) => handleMove(doc.id, e.target.value || null)}
        disabled={moving === doc.id}
        className="opacity-0 group-hover:opacity-100 h-7 px-1.5 text-xs rounded border border-snomed-border text-snomed-grey/60 bg-white focus:outline-none focus:ring-1 focus:ring-snomed-blue/30 transition-opacity disabled:opacity-30 max-w-[120px]"
        title="Move to section"
      >
        <option value="">No section</option>
        {sections!.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    );
  };

  const renderDocRow = (doc: PortalDocument) => (
    <tr key={doc.id} className="hover:bg-snomed-blue-light/20 transition-colors group">
      <td className="px-5 py-3">
        <Link
          href={`/spaces/${spaceId}/authored/${doc.id}`}
          className="text-sm font-medium text-snomed-grey hover:text-snomed-blue transition-colors"
        >
          {doc.title}
        </Link>
      </td>
      <td className="px-4 py-3 text-xs text-snomed-grey/60">
        {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
      </td>
      <td className="px-4 py-3">
        <DocumentStatusBadge status={doc.status} />
      </td>
      <td className="px-4 py-3 text-xs text-snomed-grey/50">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {formatDate(doc.updatedAt)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-snomed-grey/60">
        {doc.createdByName}
      </td>
      {canUpload && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {renderMoveMenu(doc)}
            <button
              type="button"
              onClick={() => handleDelete(doc.id, doc.title)}
              disabled={deleting === doc.id}
              className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-8 h-8 rounded-md text-snomed-grey/40 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-30"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );

  const renderDocCard = (doc: PortalDocument) => (
    <Link
      key={doc.id}
      href={`/spaces/${spaceId}/authored/${doc.id}`}
      className="flex items-start gap-3 px-4 py-4 hover:bg-snomed-blue-light/20 transition-colors"
    >
      <FileText size={18} className="flex-shrink-0 mt-0.5 text-snomed-grey/40" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-snomed-grey">{doc.title}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <DocumentStatusBadge status={doc.status} />
          <span className="text-xs text-snomed-grey/50">
            {DOC_TYPE_LABELS[doc.docType]}
          </span>
        </div>
        <p className="text-xs text-snomed-grey/40 mt-1">
          {doc.createdByName} · {formatDate(doc.updatedAt)}
        </p>
      </div>
    </Link>
  );

  const renderSectionHeader = (name: string, id: string, count: number) => {
    const collapsed = collapsedSections.has(id);
    return (
      <button
        type="button"
        onClick={() => toggleSection(id)}
        className="flex items-center gap-2 w-full px-5 py-2.5 bg-snomed-grey-light/60 text-left hover:bg-snomed-grey-light transition-colors"
      >
        {collapsed ? <ChevronRight size={14} className="text-snomed-grey/50" /> : <ChevronDown size={14} className="text-snomed-grey/50" />}
        <FolderOpen size={14} className="text-snomed-blue" />
        <span className="text-sm font-medium text-snomed-grey">{name}</span>
        <span className="text-xs text-snomed-grey/40 ml-1">({count})</span>
      </button>
    );
  };

  const tableHead = (
    <table className="w-full">
      <thead>
        <tr className="border-b border-snomed-border bg-snomed-grey-light">
          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-snomed-grey/50">Title</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-snomed-grey/50">Type</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-snomed-grey/50">Status</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-snomed-grey/50">Modified</th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-snomed-grey/50">Author</th>
          {canUpload && <th className="px-4 py-3 w-36" />}
        </tr>
      </thead>
    </table>
  );

  return (
    <>
      {canUpload && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium bg-snomed-blue text-white hover:bg-snomed-blue-dark transition-colors"
          >
            <Plus size={16} />
            New Document
          </button>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-xl border border-snomed-border bg-white px-6 py-12 text-center">
          <FileText size={32} className="mx-auto text-snomed-grey/30 mb-3" />
          <p className="text-sm text-snomed-grey/50">No authored documents yet</p>
          {canUpload && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm text-snomed-blue hover:underline"
            >
              Create the first document
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-snomed-border bg-white overflow-hidden">
          {/* Desktop view */}
          <div className="hidden md:block">
            {tableHead}

            {grouped ? (
              <>
                {grouped.sections.map(({ section, docs }) => (
                  <div key={section.id}>
                    {renderSectionHeader(section.name, section.id, docs.length)}
                    {!collapsedSections.has(section.id) && (
                      <table className="w-full">
                        <tbody className="divide-y divide-snomed-border">
                          {docs.map(renderDocRow)}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}

                {grouped.unfiled.length > 0 && (
                  <>
                    {grouped.sections.length > 0 && (
                      <div className="px-5 py-2 bg-snomed-grey-light/30 border-t border-snomed-border">
                        <span className="text-xs font-medium text-snomed-grey/40 uppercase tracking-wider">Unfiled</span>
                      </div>
                    )}
                    <table className="w-full">
                      <tbody className="divide-y divide-snomed-border">
                        {grouped.unfiled.map(renderDocRow)}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-snomed-border">
                  {documents.map(renderDocRow)}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile view */}
          <div className="md:hidden divide-y divide-snomed-border">
            {grouped ? (
              <>
                {grouped.sections.map(({ section, docs }) => (
                  <div key={section.id}>
                    {renderSectionHeader(section.name, section.id, docs.length)}
                    {!collapsedSections.has(section.id) && docs.map(renderDocCard)}
                  </div>
                ))}
                {grouped.unfiled.length > 0 && (
                  <>
                    {grouped.sections.length > 0 && (
                      <div className="px-4 py-2 bg-snomed-grey-light/30">
                        <span className="text-xs font-medium text-snomed-grey/40 uppercase tracking-wider">Unfiled</span>
                      </div>
                    )}
                    {grouped.unfiled.map(renderDocCard)}
                  </>
                )}
              </>
            ) : (
              documents.map(renderDocCard)
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateDocumentDialog
          spaceId={spaceId}
          sections={sections}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
