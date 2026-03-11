'use client';

export function Greeting({ firstName }: { firstName: string }) {
  const hour = new Date().getHours();
  const salutation =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <h1 className="text-2xl font-semibold text-snomed-grey">
      {salutation}, {firstName}
    </h1>
  );
}
