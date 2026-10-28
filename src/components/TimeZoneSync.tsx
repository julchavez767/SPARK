"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE, isValidTimeZone } from "@/lib/time";

/**
 * Tells the server the browser's time zone (e.g. America/Los_Angeles) so pages
 * render times locally. Runs on every page; it only refreshes when the zone is
 * new or has changed (first visit, travel, a new device).
 */
export function TimeZoneSync({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      tz = undefined;
    }
    if (!isValidTimeZone(tz) || tz === current) return;
    try {
      document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      return; // Cookies blocked: times stay in UTC, clearly labelled.
    }
    router.refresh();
  }, [current, router]);
  return null;
}
