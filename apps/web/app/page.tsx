import Image from 'next/image';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 flex items-center">
        <Image
          src="/snomed-logo.png"
          alt="SNOMED International"
          width={160}
          height={40}
          priority
          className="h-10 w-auto"
        />
      </header>

      {/* Main content — vertically centred in the remaining space */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-lg w-full text-center">
          {/* Wordmark */}
          <div className="mb-8">
            <h1 className="text-5xl font-semibold tracking-tight text-snomed-grey mb-2">
              Quorum
            </h1>
            <div className="h-1 w-16 bg-snomed-blue rounded-full mx-auto" />
          </div>

          {/* Description */}
          <p className="text-lg text-snomed-grey leading-relaxed mb-3">
            The governance portal for SNOMED International board members,
            working groups, and secretariat.
          </p>
          <p className="text-base text-snomed-grey/70 leading-relaxed mb-12">
            Access meeting agendas, committee documents, and organisation
            calendars — in one secure, unified place.
          </p>

          {/* CTA */}
          <Link
            href="/api/auth/login?next=/dashboard"
            className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-lg
                       bg-snomed-blue hover:bg-snomed-blue-dark text-white font-semibold
                       text-base transition-colors duration-150 shadow-sm min-h-[52px] min-w-[200px]"
          >
            {/* Key icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 shrink-0"
              aria-hidden="true"
            >
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m21 2-9.6 9.6" />
              <path d="m15.5 7.5 3 3L22 7l-3-3" />
            </svg>
            Sign in with SNOMED SSO
          </Link>

          <p className="mt-5 text-sm text-snomed-grey/50">
            Powered by SNOMED International identity services
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-snomed-border">
        <div className="max-w-lg mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-snomed-grey/50">
          <span>© {new Date().getFullYear()} SNOMED International</span>
          <span>Quorum Governance Portal</span>
        </div>
      </footer>
    </div>
  );
}
