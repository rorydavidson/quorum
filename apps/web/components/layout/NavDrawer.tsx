"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import type { SessionUser } from "@snomed/types";
import { NavItems } from "./NavItems";

interface NavDrawerProps {
  user: SessionUser | null;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
}

function userInitials(user: SessionUser): string {
  const first = user.given_name?.[0] ?? user.name?.[0] ?? "?";
  const last = user.family_name?.[0] ?? "";
  return (first + last).toUpperCase();
}

export function NavDrawer({ user, isAdmin, open, onClose }: NavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const initials = user ? userInitials(user) : "?";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={[
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden",
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={[
          "fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] bg-white shadow-2xl transition-transform duration-300 ease-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-snomed-border flex-shrink-0">
          <Link href="/dashboard" onClick={onClose} aria-label="Quorum home">
            <Image
              src="/snomed-logo.png"
              alt="SNOMED International"
              width={140}
              height={40}
              className="h-9 w-auto object-contain"
            />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex items-center justify-center w-11 h-11 rounded-lg text-snomed-grey/60 hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <NavItems isAdmin={isAdmin} onNavigate={onClose} />
        </div>

        {/* User section */}
        {user && (
          <div className="flex-shrink-0 border-t border-snomed-border px-3 py-4 space-y-3">
            <div className="flex items-center gap-3 px-2">
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white select-none"
                style={{ backgroundColor: "#009FE3" }}
                aria-hidden="true"
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-snomed-grey truncate leading-tight">
                  {user.name || user.email}
                </p>
                <p className="text-xs text-snomed-grey/60 truncate leading-tight">
                  {user.email}
                </p>
              </div>
            </div>
            {/* prefetch={false} is critical: without it Next.js prefetches
                the logout API route on page load, destroying the session. */}
            <Link
              href="/api/auth/logout"
              prefetch={false}
              className="flex items-center justify-center w-full min-h-[44px] px-4 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors duration-150"
              onClick={onClose}
            >
              Sign out
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
