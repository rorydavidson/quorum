"use client";

import { useState } from "react";
import { csrfFetch } from "@/lib/csrf";

const BUTTON_CLASS =
  "flex items-center justify-center w-full min-h-[44px] px-4 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors duration-150 disabled:opacity-60";

/**
 * Signs the user out with a CSRF-protected POST, then sends the browser to
 * the Keycloak logout URL the BFF returns so the SSO session ends as well.
 * A plain link would let any site sign users out, and Next would prefetch it.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const res = await csrfFetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
      const { logoutUrl } = (await res.json()) as { logoutUrl?: string };
      window.location.assign(isHttpUrl(logoutUrl) ? logoutUrl : "/");
    } catch {
      // Don't navigate away: on a shared device the user must know they are
      // still signed in.
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={signOut} disabled={pending} className={BUTTON_CLASS}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {failed && (
        <p role="alert" className="mt-1 text-xs text-center text-red-600">
          Sign out failed. You are still signed in, please try again.
        </p>
      )}
    </div>
  );
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value, window.location.origin);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
