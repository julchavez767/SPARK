"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { analyzeImport, type ExistingItem } from "@/lib/import/analyze";
import { IMPORT_LIMITS, parseImport } from "@/lib/import/normalize";
import type { ItemType } from "@/lib/types";

export type ImportContext = {
  existing: ExistingItem[];
  categories: string[];
  tags: string[];
};

type Client = Awaited<ReturnType<typeof createClient>>;

/** Supabase returns at most 1,000 rows per request, so read in pages. */
async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, cap = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error("load failed");
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadContext(supabase: Client): Promise<ImportContext> {
  const [items, categories, tags] = await Promise.all([
    allRows<{ id: string; type: ItemType; title: string }>((a, b) => supabase.from("items").select("id, type, title").order("created_at").range(a, b)),
    allRows<{ name: string }>((a, b) => supabase.from("categories").select("name").range(a, b)),
    allRows<{ name: string }>((a, b) => supabase.from("tags").select("name").range(a, b)),
  ]);
  return { existing: items, categories: categories.map((c) => c.name), tags: tags.map((t) => t.name) };
}

/** What the browser needs to preview an import: titles to check duplicates against. */
export async function getImportContext(): Promise<ImportContext | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your session expired. Sign in again." };
  try {
    return await loadContext(supabase);
  } catch {
    return { error: "Couldn’t load your library to check for duplicates. Try again." };
  }
}

const commitSchema = z.object({
  text: z.string().min(1).max(IMPORT_LIMITS.maxFileBytes),
  fileName: z.string().max(200).default(""),
  decisions: z.record(z.string().regex(/^r\d{1,4}$/), z.enum(["import", "skip"])),
});

export type CommitResult =
  | { ok: true; importId: string; items: number; links: number }
  | { ok: false; error: string };

/**
 * Re-reads and re-checks the file on the server, then writes it in one
 * transaction. Nothing from the browser's preview is trusted.
 */
export async function commitImport(input: { text: string; fileName: string; decisions: Record<string, "import" | "skip"> }): Promise<CommitResult> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That file couldn’t be read. Choose it again." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Your session expired. Sign in again; your file isn’t lost." };

  const file = parseImport(parsed.data.text, parsed.data.fileName);
  if (file.fileError) return { ok: false, error: file.fileError };

  let context: ImportContext;
  try {
    context = await loadContext(supabase);
  } catch {
    return { ok: false, error: "Couldn’t check for duplicates. Nothing was imported. Try again." };
  }

  const plan = analyzeImport(file.rows, context.existing, parsed.data.decisions, context.categories, context.tags);
  if (plan.summary.undecided > 0) {
    return { ok: false, error: `Review ${plan.summary.undecided} possible duplicate${plan.summary.undecided === 1 ? "" : "s"} first.` };
  }
  if (plan.summary.importing === 0) return { ok: false, error: "Nothing is selected to import." };

  const items = plan.rows
    .filter((p) => p.importing)
    .map(({ row }) => ({
      key: row.key,
      type: row.type,
      title: row.title,
      description: row.type === "idea" ? row.description ?? row.title : row.description,
      status: row.status,
      category: row.category,
      tags: row.tags,
      source_name: row.sourceName,
      source_url: row.sourceUrl,
      origin: row.origin,
      created: row.created,
    }));

  const { data, error } = await supabase.rpc("import_items", {
    p_file_name: parsed.data.fileName || "Pasted text",
    p_items: items,
    p_links: plan.links,
  });

  if (error || !data) {
    console.error("import_items failed", error?.message);
    return { ok: false, error: "The import didn’t go through, and nothing was saved. Try again." };
  }

  const result = data as { import_id: string; items: number; links: number };
  revalidatePath("/library");
  revalidatePath("/");
  revalidatePath("/imports");
  return { ok: true, importId: result.import_id, items: result.items, links: result.links };
}
