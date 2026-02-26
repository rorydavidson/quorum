import { headers } from 'next/headers';
import { getSpaceFiles } from '@/lib/api-client';
import { SpaceNav } from '@/components/layout/SpaceNav';
import type { SpaceConfig } from '@snomed/types';

interface Props {
  children: React.ReactNode;
  params: Promise<{ spaceId: string }>;
}

export default async function SpaceLayout({ children, params }: Props) {
  const { spaceId } = await params;
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  let space: SpaceConfig | null = null;
  try {
    const data = await getSpaceFiles(spaceId, cookie);
    space = data.space;
  } catch {
    // Graceful degradation: render nav without space metadata
  }

  return (
    <div className="flex min-h-full">
      <SpaceNav space={space} spaceId={spaceId} />
      <div className="flex-1 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
