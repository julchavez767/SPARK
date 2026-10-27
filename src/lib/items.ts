import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Number of links per item, for the ids given. */
export async function linkCounts(supabase: Client, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const list = ids.join(",");
  const { data } = await supabase.from("item_links").select("a_id, b_id").or(`a_id.in.(${list}),b_id.in.(${list})`);
  for (const row of data ?? []) {
    for (const key of [row.a_id as string, row.b_id as string]) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
