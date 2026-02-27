'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import type { SessionUser } from '@snomed/types';
import { NavDrawer } from './NavDrawer';

interface MobileHeaderProps {
  user: SessionUser | null;
  isAdmin: boolean;
}

function userInitials(user: SessionUser): string {
  const first = user.given_name?.[0] ?? user.name?.[0] ?? '?';
  const last = user.family_name?.[0] ?? '';
  return (first + last).toUpperCase();
}

export function MobileHeader({ user, isAdmin }: MobileHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const initials = user ? userInitials(user) : '?';

  return (
    <>
      {/* Top bar — hidden on lg and above */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white border-b border-snomed-border shadow-sm">
        {/* Hamburger */}
        <button
          onClick={openDrawer}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav-drawer"
          className="flex items-center justify-center w-11 h-11 -ml-1 rounded-lg text-snomed-grey hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <Menu size={24} aria-hidden="true" />
        </button>

        {/* Logo — centered */}
        <Link href="/dashboard" aria-label="Quorum home" className="absolute left-1/2 -translate-x-1/2">
          <Image
            src="/snomed-logo.png"
            alt="SNOMED International"
            width={140}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        {/* User avatar */}
        {user ? (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white select-none flex-shrink-0"
            style={{ backgroundColor: '#009FE3' }}
            aria-label={`Signed in as ${user.name || user.email}`}
            title={user.name || user.email}
          >
            {initials}
          </div>
        ) : (
          <div className="w-9 h-9" aria-hidden="true" />
        )}
      </header>

      {/* Slide-out drawer */}
      <NavDrawer
        user={user}
        isAdmin={isAdmin}
        open={drawerOpen}
        onClose={closeDrawer}
      />
    </>
  );
}
