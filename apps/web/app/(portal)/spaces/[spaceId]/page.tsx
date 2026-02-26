interface Props {
  params: Promise<{ spaceId: string }>;
}

export default async function SpacePage({ params }: Props) {
  const { spaceId } = await params;
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-snomed-grey">Space: {spaceId}</h1>
      <p className="mt-2 text-sm text-snomed-grey/70">
        Document listing from Google Drive — Phase 4.
      </p>
    </main>
  );
}
