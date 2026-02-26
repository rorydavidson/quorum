// Portal layout — wraps all protected pages.
// Auth guard is handled by middleware.ts.
// Shell component added in Phase 3.
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-snomed-grey-light">
      {children}
    </div>
  );
}
