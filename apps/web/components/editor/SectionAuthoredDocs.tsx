'use client';

import Link from 'next/link';
import { PenLine, Clock } from 'lucide-react';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import type { PortalDocument } from '@snomed/types';

interface Props {
  documents: PortalDocument[];
  spaceId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function SectionAuthoredDocs({ documents, spaceId }: Props) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <PenLine size={14} className="text-snomed-blue" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-snomed-grey/50">
          Authored Documents
        </h3>
      </div>
      <div className="rounded-xl border border-snomed-border bg-white overflow-hidden divide-y divide-snomed-border">
        {documents.map((doc) => (
          <Link
            key={doc.id}
            href={`/spaces/${spaceId}/authored/${doc.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-snomed-blue-light/20 transition-colors"
          >
            <PenLine size={16} className="flex-shrink-0 text-snomed-grey/40" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-snomed-grey truncate">{doc.title}</p>
            </div>
            <DocumentStatusBadge status={doc.status} />
            <span className="hidden sm:flex items-center gap-1 text-xs text-snomed-grey/50">
              <Clock size={11} />
              {formatDate(doc.updatedAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
