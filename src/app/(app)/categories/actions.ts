"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { categoryNameSchema } from "@/lib/validation/idea";

export type CategoryState = { error?: string; ok?: boolean; at?: number };

const DUPLICATE = "23505";

function refresh() {
  revalidatePath("/categories");
  revalidatePath("/library");
}

export async function createCategory(_prev: CategoryState, formData: FormData): Promise<CategoryState> {
  const name = categoryNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({ name: name.data });
  if (error) {
    return { error: error.code === DUPLICATE ? `You already have “${name.data}”.` : "Couldn't add it. Try again." };
  }
  refresh();
  return { ok: true, at: Date.now() };
}

export async function renameCategory(_prev: CategoryState, formData: FormData): Promise<CategoryState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  const name = categoryNameSchema.safeParse(formData.get("name"));
  if (!id.success) return { error: "That category couldn't be found." };
  if (!name.success) return { error: name.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").update({ name: name.data }).eq("id", id.data);
  if (error) {
    return { error: error.code === DUPLICATE ? `You already have “${name.data}”.` : "Couldn't rename it. Try again." };
  }
  refresh();
  return { ok: true, at: Date.now() };
}

/** Removes the category only. Its items stay and become uncategorized. */
export async function deleteCategory(formData: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id.data);
  if (error) console.error("deleteCategory failed", error.message);
  refresh();
}
