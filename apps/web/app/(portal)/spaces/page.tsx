import { headers } from 'next/headers';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import { getAccessibleSpaces } from '@/lib/api-client';
import type { SpaceConfig } from '@snomed/types';

export default async function SpacesPage() {
  const headerStore = await headers();
  const cookie = headerStore.get('cookie') ?? '';

  let spaces: SpaceConfig[] = [];
  let error: string | null = null;

  try {
    spaces = await getAccessibleSpaces(cookie);
  } catch (err) {
    error = (err as Error).message;
  }

  // Group by hierarchyCategory, preserving sort order within each group
  const grouped = spaces.reduce<Record<string, SpaceConfig[]>>((acc, space) => {
    const cat = space.hierarchyCategory;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(space);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-snomed-grey">Spaces</h1>
        <p className="mt-1 text-sm text-snomed-grey/60">
          Your document spaces, organised by group.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load spaces: {error}
        </div>
      )}

      {!error && spaces.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FolderOpen size={48} className="mb-4 text-snomed-grey/30" />
          <p className="text-base font-medium text-snomed-grey">No spaces available</p>
          <p className="mt-1 text-sm text-snomed-grey/60">
            You don&apos;t have access to any document spaces yet.
          </p>
        </div>
      )}

      {categories.map((category) => (
        <section key={category} className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-snomed-grey/50">
            {category}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped[category].map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SpaceCard({ space }: { space: SpaceConfig }) {
  return (
    <Link
      href={`/spaces/${space.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-snomed-border bg-white p-5 shadow-sm min-h-[130px] transition-all duration-200 hover:shadow-md hover:border-snomed-blue/40 active:shadow-sm"
    >
      {/* Icon — fills with blue on card hover */}
      <div className="w-11 h-11 rounded-xl bg-snomed-blue-light flex items-center justify-center flex-shrink-0 transition-colors duration-200 group-hover:bg-snomed-blue">
        <FolderOpen
          size={22}
          className="text-snomed-blue transition-colors duration-200 group-hover:text-white"
        />
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold text-snomed-grey leading-snug transition-colors duration-200 group-hover:text-snomed-blue">
          {space.name}
        </p>
        {space.description && (
          <p className="text-sm text-snomed-grey/55 line-clamp-2 leading-relaxed">
            {space.description}
          </p>
        )}
      </div>
    </Link>
  );
}
