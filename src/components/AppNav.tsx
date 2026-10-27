"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SparkMark } from "./SparkMark";

// Ideas, projects and systems all live in the Library, filtered by type.
const ITEMS = [
  { href: "/", label: "Capture", icon: "M12 5v14M5 12h14" },
  { href: "/library", label: "Library", icon: "M4 5h16M4 12h16M4 19h10" },
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

export function AppNav({ email }: { email: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/library" && pathname.startsWith("/items"));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line px-4 py-6 lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-2 px-2">
          <SparkMark className="h-6 w-6" />
          <span className="text-lg font-semibold tracking-tight">SPARK</span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm ${
                isActive(item.href) ? "bg-ember-soft font-medium text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted">
          <p className="truncate" title={email}>{email}</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button type="submit" className="underline-offset-2 hover:text-ink hover:underline">Sign out</button>
          </form>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
              isActive(item.href) ? "text-ember" : "text-muted"
            }`}
          >
            <Icon d={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
