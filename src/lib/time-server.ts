import "server-only";
import { cookies } from "next/headers";
import { TZ_COOKIE, timeCtxFrom, type TimeCtx } from "./time";

/** The viewer's time zone, as reported by their browser (see TimeZoneSync). UTC, labelled, until known. */
export async function getTimeCtx(): Promise<TimeCtx> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  let value = raw;
  try {
    if (raw && raw.includes("%")) value = decodeURIComponent(raw);
  } catch {
    value = undefined;
  }
  return timeCtxFrom(value);
}
