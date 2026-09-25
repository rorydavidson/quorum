/**
 * Tab bar on the left, view-specific actions on the right. Wraps on narrow
 * widths so nothing overlaps. Each admin view renders this itself so it can
 * own the actions that belong to it.
 */
export function AdminHeader({
  tabs,
  children,
}: {
  tabs: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">{tabs}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
