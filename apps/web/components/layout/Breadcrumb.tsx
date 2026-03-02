import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Breadcrumb navigation component.
 *
 * Rendered as a compact white pill with a subtle shadow so it stands out
 * against the light-grey page background. Links use `min-h-0` to override
 * the global `a { min-h-[44px] }` touch-target rule.
 */
export function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  return (
    <nav
      className={[
        'mb-6 inline-flex items-center bg-white border border-snomed-border',
        'rounded-xl shadow-sm overflow-hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={index} className="inline-flex items-center">
            {index > 0 && (
              <span
                className="text-snomed-grey/30 text-sm select-none px-0.5 leading-none"
                aria-hidden="true"
              >
                /
              </span>
            )}

            {isLast || !item.href ? (
              <span className="px-3.5 py-2 text-sm font-semibold text-snomed-grey">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className={[
                  'inline-flex items-center min-h-0 px-3.5 py-2 text-sm font-medium',
                  'text-snomed-grey/55 hover:text-snomed-blue hover:bg-snomed-blue-light/60',
                  'transition-colors',
                ].join(' ')}
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
