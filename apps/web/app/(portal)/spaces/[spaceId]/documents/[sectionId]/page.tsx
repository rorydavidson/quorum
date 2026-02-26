import { headers } from 'next/headers';
import Link from 'next/link';
import { ChevronRight, Folder } from 'lucide-react';
import { getSectionFiles, getUserFromHeaders } from '@/lib/api-client';
import { DocumentList } from '@/components/documents/DocumentList';
import type { SectionWithFiles } from '@/lib/api-client';

interface Props {
  params: Promise<{ spaceId: string; sectionId: string }>;
}

export default async function SectionDocumentsPage({ params }: Props) {
  const { spaceId, sectionId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';
  const user = getUserFromHeaders(headerStore);

  let data: SectionWithFiles | null = null;
  let error: string | null = null;

  try {
    data = await getSectionFiles(spaceId, sectionId, cookie);
  } catch (err) {
    error = (err as Error).message;
  }

  const isAdmin = user?.groups.some((g) => g === 'portal_admin' || g === '/portal_admin') ?? false;
  const canUpload =
    isAdmin ||
    (data !== null &&
      (data.space.uploadGroups ?? []).some((ug) =>
        user?.groups.some(
          (g) => g === ug || g === ug.replace(/^\//, '') || `/${g}` === ug
        )
      ));

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-snomed-grey/50">
        <Link href="/spaces" className="hover:text-snomed-blue transition-colors">
          Spaces
        </Link>
        <ChevronRight size={12} aria-hidden="true" />
        <Link
          href={`/spaces/${spaceId}`}
          className="hover:text-snomed-blue transition-colors"
        >
          {data?.space.name ?? spaceId}
        </Link>
        <ChevronRight size={12} aria-hidden="true" />
        <span className="text-snomed-grey font-medium">
          {data?.section.name ?? sectionId}
        </span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-snomed-blue-light flex items-center justify-center">
          <Folder size={22} className="text-snomed-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-snomed-grey">
            {data?.section.name ?? 'Documents'}
          </h1>
          {data?.section.description && (
            <p className="mt-0.5 text-sm text-snomed-grey/60">{data.section.description}</p>
          )}
          {data?.space.name && (
            <p className="mt-0.5 text-xs text-snomed-grey/40">{data.space.name}</p>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load documents: {error}
        </div>
      )}

      {/* Document list */}
      {data && (
        <>
          <div className="mb-3">
            <p className="text-xs text-snomed-grey/50">
              {data.files.length} {data.files.length === 1 ? 'document' : 'documents'}
            </p>
          </div>
          <DocumentList spaceId={spaceId} files={data.files} canUpload={canUpload} />
        </>
      )}
    </div>
  );
}
