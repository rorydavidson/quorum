import { headers } from 'next/headers';
import { getAuthoredDocument, getUserFromHeaders, getSpaceFiles } from '@/lib/api-client';
import { Editor } from '@/components/editor/Editor';
import type { PortalDocument, SpaceConfig } from '@snomed/types';

interface Props {
  params: Promise<{ spaceId: string; docId: string }>;
}

export default async function AuthoredDocumentEditorPage({ params }: Props) {
  const { spaceId, docId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';
  const user = getUserFromHeaders(headerStore);

  let document: PortalDocument | null = null;
  let space: SpaceConfig | null = null;
  let error: string | null = null;

  try {
    const [docResult, spaceResult] = await Promise.all([
      getAuthoredDocument(spaceId, docId, cookie),
      getSpaceFiles(spaceId, cookie).then((d) => d.space).catch(() => null),
    ]);
    document = docResult;
    space = spaceResult;
  } catch (err) {
    error = (err as Error).message;
  }

  if (error || !document) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? 'Document not found'}
        </div>
      </div>
    );
  }

  const isAdmin = user?.groups.some((g) => g === 'portal_admin' || g === '/portal_admin') ?? false;
  const canEdit =
    isAdmin ||
    (space !== null &&
      (space.uploadGroups ?? []).some((ug) =>
        user?.groups.some(
          (g) => g === ug || g === ug.replace(/^\//, '') || `/${g}` === ug,
        ),
      ));

  return (
    <div className="h-[calc(100vh-var(--header-height,0px))] flex flex-col">
      <Editor document={document} spaceId={spaceId} canEdit={canEdit} />
    </div>
  );
}
