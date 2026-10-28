"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type UndoReport = {
  import_id: string;
  already_undone: boolean;
  total: number;
  removable: number;
  /** Reasoning entries this import added to items that were already in SPARK. */
  entries_attached?: number;
  attached_items?: number;
  protected: { id: string; title: string; type: "idea" | "project" | "system"; reasons: string[] }[];
  removed?: number;
  entries_removed?: number;
  applied?: boolean;
};

export type UndoState = { error?: string; removed?: number; kept?: number; entriesRemoved?: number };

/** Removes only the import's untouched items. The database decides what is protected at the moment it runs. */
export async function undoImport(_prev: UndoState, formData: FormData): Promise<UndoState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "That import couldn't be found." };
  if (formData.get("confirm") !== "yes") return { error: "Tick the box to confirm first." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_import", { p_import: id.data, p_apply: true });
  if (error || !data) {
    console.error("undo_import failed", error?.message);
    return { error: "Undo didn’t go through, and nothing was removed. Try again." };
  }

  const report = data as UndoReport;
  revalidatePath(`/imports/${id.data}`);
  revalidatePath("/imports");
  revalidatePath("/library");
  revalidatePath("/");
  return { removed: report.removed ?? 0, kept: report.protected.length, entriesRemoved: report.entries_removed ?? 0 };
}
