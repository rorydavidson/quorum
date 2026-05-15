import { headers } from 'next/headers';
import { PenLine } from 'lucide-react';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { getAuthoredDocuments, getSpaceFiles, getUserFromHeaders } from '@/lib/api-client';
import { AuthoredDocumentList } from '@/components/editor/AuthoredDocumentList';
import type { PortalDocument, SpaceConfig } from '@snomed/types';

interface Props {
  params: Promise<{ spaceId: string }>;
}

export default async function AuthoredDocumentsPage({ params }: Props) {
  const { spaceId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';
  const user = getUserFromHeaders(headerStore);
  let documents: PortalDocument[] = [];
  let space: SpaceConfig | null = null;
  let error: string | null = null;

  try {
    const [docs, spaceResult] = await Promise.all([
      getAuthoredDocuments(spaceId, cookie),
      getSpaceFiles(spaceId, cookie).then((d) => d.space).catch(() => null),
    ]);
    documents = docs;
    space = spaceResult;
  } catch (err) {
    error = (err as Error).message;
  }

  const isAdmin = user?.groups.some((g) => g === 'portal_admin' || g === '/portal_admin') ?? false;
  const canUpload =
    isAdmin ||
    (space !== null &&
      (space.uploadGroups ?? []).some((ug) =>
        user?.groups.some(
          (g) => g === ug || g === ug.replace(/^\//, '') || `/${g}` === ug,
        ),
      ));

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <Breadcrumb
        items={[
          { label: 'Spaces', href: '/spaces' },
          { label: space?.name ?? spaceId, href: `/spaces/${spaceId}` },
          { label: 'Author' },
        ]}
      />

      <div className="mb-6 flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-snomed-blue-light flex items-center justify-center">
          <PenLine size={22} className="text-snomed-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-snomed-grey">
            {space?.name ? `${space.name} — Author` : 'Author'}
          </h1>
          <p className="mt-0.5 text-sm text-snomed-grey/60">
            Create and edit governance documents
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load documents: {error}
        </div>
      )}

      <AuthoredDocumentList
        documents={documents}
        spaceId={spaceId}
        sections={space?.sections}
        canUpload={canUpload}
      />
    </div>
  );
}
