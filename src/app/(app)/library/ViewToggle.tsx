"use client";

import Link from "next/link";
import { VIEW_COOKIE, type LibraryView } from "./view";

/** Cards | List. The choice is remembered in a cookie so the Library reopens the same way. */
export function ViewToggle({ view, cardsHref, listHref }: { view: LibraryView; cardsHref: string; listHref: string }) {
  const remember = (v: LibraryView) => {
    try {
      document.cookie = `${VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the choice still applies to this page, just isn't remembered.
    }
  };
  const btn = (v: LibraryView, href: string, label: string, icon: React.ReactNode) => (
    <Link
      href={href}
      replace
      scroll={false}
      onClick={() => remember(v)}
      aria-pressed={view === v}
      className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs ${view === v ? "bg-ink font-medium text-bg" : "text-muted hover:text-ink"}`}
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <div role="group" aria-label="View" className="flex rounded-full border border-line bg-surface p-0.5">
      {btn(
        "cards",
        cardsHref,
        "Cards",
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>,
      )}
      {btn(
        "list",
        listHref,
        "List",
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 6h14M5 12h14M5 18h14" /></svg>,
      )}
    </div>
  );
}
