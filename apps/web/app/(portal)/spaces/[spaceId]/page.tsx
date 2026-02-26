import { headers } from 'next/headers';
import Link from 'next/link';
import { ChevronRight, FolderOpen } from 'lucide-react';
import { getSpaceFiles } from '@/lib/api-client';
import { DocumentList } from '@/components/documents/DocumentList';
import type { SpaceWithFiles } from '@/lib/api-client';

interface Props {
  params: Promise<{ spaceId: string }>;
}

export default async function SpacePage({ params }: Props) {
  const { spaceId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  let data: SpaceWithFiles | null = null;
  let error: string | null = null;

  try {
    data = await getSpaceFiles(spaceId, cookie);
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-snomed-grey/50">
        <Link href="/spaces" className="hover:text-snomed-blue transition-colors">
          Spaces
        </Link>
        <ChevronRight size={12} aria-hidden="true" />
        <span className="text-snomed-grey font-medium">
          {data?.space.name ?? spaceId}
        </span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-snomed-blue-light flex items-center justify-center">
          <FolderOpen size={22} className="text-snomed-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-snomed-grey">
            {data?.space.name ?? 'Space'}
          </h1>
          {data?.space.description && (
            <p className="mt-0.5 text-sm text-snomed-grey/60">{data.space.description}</p>
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
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-snomed-grey/50">
              {data.files.length} {data.files.length === 1 ? 'document' : 'documents'}
            </p>
          </div>
          <DocumentList spaceId={spaceId} files={data.files} />
        </>
      )}
    </div>
  );
}
