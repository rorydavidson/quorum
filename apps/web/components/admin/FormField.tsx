/** Shared form primitives for the admin forms. */

export const inputCls =
  'w-full rounded-lg border border-snomed-border bg-white px-3 py-2 text-sm text-snomed-grey placeholder:text-snomed-grey/40 focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue transition-colors';

export const primaryButtonCls =
  'flex items-center gap-2 rounded-lg bg-snomed-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-snomed-dark-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]';

export const secondaryButtonCls =
  'rounded-lg border border-snomed-border px-5 py-2.5 text-sm text-snomed-grey hover:bg-gray-50 transition-colors min-h-[44px]';

export function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-snomed-grey mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-snomed-grey/50">{hint}</p>}
    </div>
  );
}
