import { headers } from 'next/headers';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { getSpaceFiles, getUserFromHeaders } from '@/lib/api-client';
import { DocumentList } from '@/components/documents/DocumentList';
import type { SpaceWithFiles } from '@/lib/api-client';

interface Props {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ folderId?: string }>;
}

export default async function SpaceDocumentsPage({ params, searchParams }: Props) {
  const { spaceId } = await params;
  const { folderId } = await searchParams;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';
  const user = getUserFromHeaders(headerStore);

  let data: SpaceWithFiles | null = null;
  let error: string | null = null;

  try {
    data = await getSpaceFiles(spaceId, cookie, folderId);
  } catch (err) {
    error = (err as Error).message;
  }

  // Determine upload permission: portal_admin or a member of the space's uploadGroups
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
      <Breadcrumb
        items={[
          { label: 'Spaces', href: '/spaces' },
          { label: data?.space.name ?? spaceId, href: `/spaces/${spaceId}` },
          { label: 'Documents' },
        ]}
      />

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-snomed-blue-light flex items-center justify-center">
          <FileText size={22} className="text-snomed-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-snomed-grey">
            {data?.space.name ? `${data.space.name} — Documents` : 'Documents'}
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
          <DocumentList spaceId={spaceId} files={data.files} canUpload={canUpload} canCreateOfficialRecord={isAdmin} />
        </>
      )}
    </div>
  );
}
