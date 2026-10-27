"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStatusFor, orderedPair, TYPE_LABEL, type ItemType } from "@/lib/types";
import { ensureCategory, parseTagList, setItemTags } from "@/lib/items";
import {
  captureSchema,
  createRelatedSchema,
  deriveTitle,
  detailsSchema,
  linkSchema,
  statusSchema,
  titleSchema,
} from "@/lib/validation/idea";

export type CaptureState =
  | { status: "idle" }
  | { status: "saved"; id: string; title: string; type: ItemType; at: number }
  | { status: "error"; message: string };

export type FormState = { error?: string; ok?: boolean; at?: number };

async function client() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/** Quick capture: any type, from a single text box. */
export async function captureItem(_prev: CaptureState, formData: FormData): Promise<CaptureState> {
  const parsed = captureSchema.safeParse({
    body: formData.get("body"),
    type: formData.get("type") ?? undefined,
    source: formData.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "That couldn't be saved." };
  }

  const { supabase, user } = await client();
  if (!user) return { status: "error", message: "Your session expired. Sign in again to save." };

  const title = deriveTitle(parsed.data.body);
  const { data, error } = await supabase
    .from("items")
    .insert({
      type: parsed.data.type,
      title,
      original_body: parsed.data.body,
      source: parsed.data.source,
    })
    .select("id, title, type")
    .single();

  if (error || !data) {
    console.error("captureItem insert failed", error?.message);
    return { status: "error", message: "Couldn't save just now. Your text is kept — try again." };
  }

  revalidatePath("/");
  revalidatePath("/library");
  return { status: "saved", id: data.id as string, title: data.title as string, type: data.type as ItemType, at: Date.now() };
}

/** Change an item's status, checked against the statuses its type allows. */
export async function setStatus(formData: FormData): Promise<void> {
  const parsed = statusSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;

  const { supabase } = await client();
  const { data: item } = await supabase.from("items").select("type").eq("id", parsed.data.id).single();
  if (!item || !isStatusFor(item.type as ItemType, parsed.data.status)) return;

  const { error } = await supabase.from("items").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  if (error) console.error("setStatus failed", error.message);

  revalidatePath(`/items/${parsed.data.id}`);
  revalidatePath("/library");
}

export async function renameItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = titleSchema.safeParse({ id: formData.get("id"), title: formData.get("title") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid title." };

  const { supabase } = await client();
  const { error } = await supabase.from("items").update({ title: parsed.data.title }).eq("id", parsed.data.id);
  if (error) return { error: "Couldn't rename it. Try again." };

  revalidatePath(`/items/${parsed.data.id}`);
  revalidatePath("/library");
  return { ok: true, at: Date.now() };
}

/** Link two existing items. Linking is two-way and idempotent. */
export async function linkItems(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = linkSchema.safeParse({ fromId: formData.get("fromId"), toId: formData.get("toId") });
  if (!parsed.success) return { error: "Pick an item to link." };
  if (parsed.data.fromId === parsed.data.toId) return { error: "An item can't link to itself." };

  const { supabase } = await client();
  const { error } = await supabase
    .from("item_links")
    .upsert(orderedPair(parsed.data.fromId, parsed.data.toId), { onConflict: "a_id,b_id", ignoreDuplicates: true });
  if (error) {
    console.error("linkItems failed", error.message);
    return { error: "Couldn't link those. Try again." };
  }

  revalidatePath(`/items/${parsed.data.fromId}`);
  revalidatePath(`/items/${parsed.data.toId}`);
  return { ok: true, at: Date.now() };
}

export async function unlinkItems(formData: FormData): Promise<void> {
  const parsed = linkSchema.safeParse({ fromId: formData.get("fromId"), toId: formData.get("toId") });
  if (!parsed.success) return;

  const { supabase } = await client();
  const pair = orderedPair(parsed.data.fromId, parsed.data.toId);
  const { error } = await supabase.from("item_links").delete().eq("a_id", pair.a_id).eq("b_id", pair.b_id);
  if (error) console.error("unlinkItems failed", error.message);

  revalidatePath(`/items/${parsed.data.fromId}`);
  revalidatePath(`/items/${parsed.data.toId}`);
}

/** Create a new item and link it to the current one in one step. */
export async function createRelated(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createRelatedSchema.safeParse({
    fromId: formData.get("fromId"),
    type: formData.get("type"),
    title: formData.get("title"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { supabase, user } = await client();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data: created, error } = await supabase
    .from("items")
    .insert({
      type: parsed.data.type,
      title: parsed.data.title,
      // Ideas always keep their original words; for a quick-add the name is the original.
      original_body: parsed.data.type === "idea" ? parsed.data.title : null,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("createRelated insert failed", error?.message);
    return { error: `Couldn't create the ${TYPE_LABEL[parsed.data.type].toLowerCase()}. Try again.` };
  }

  const { error: linkError } = await supabase.from("item_links").insert(orderedPair(parsed.data.fromId, created.id as string));
  if (linkError) console.error("createRelated link failed", linkError.message);

  revalidatePath(`/items/${parsed.data.fromId}`);
  revalidatePath("/library");
  return { ok: true, at: Date.now() };
}

/** Category, tags, source, source URL and origin. Only fields that changed are written. */
export async function updateDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = detailsSchema.safeParse({
    id: formData.get("id"),
    categoryId: formData.get("categoryId") ?? "",
    newCategory: formData.get("newCategory") ?? "",
    tags: formData.get("tags") ?? "",
    sourceName: formData.get("sourceName") ?? "",
    sourceUrl: formData.get("sourceUrl") ?? "",
    origin: formData.get("origin") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;

  const { supabase, user } = await client();
  if (!user) return { error: "Your session expired. Sign in again." };

  try {
    let categoryId: string | null = d.categoryId === "" ? null : d.categoryId;
    if (d.categoryId === "__new") {
      if (!d.newCategory) return { error: "Name the new category." };
      categoryId = await ensureCategory(supabase, d.newCategory);
    }

    const { error } = await supabase
      .from("items")
      .update({ category_id: categoryId, source_name: d.sourceName, source_url: d.sourceUrl, origin: d.origin })
      .eq("id", d.id);
    if (error) throw new Error(error.message);

    await setItemTags(supabase, d.id, parseTagList(d.tags));
  } catch (e) {
    console.error("updateDetails failed", e instanceof Error ? e.message : e);
    return { error: "Couldn't save the details. Try again." };
  }

  revalidatePath(`/items/${d.id}`);
  revalidatePath("/library");
  return { ok: true, at: Date.now() };
}

/** Deleting is explicit and only from the item page. Links and timeline go with it. */
export async function deleteItem(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const { supabase } = await client();
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) {
    console.error("deleteItem failed", error.message);
    return;
  }
  revalidatePath("/library");
  revalidatePath("/");
  redirect("/library");
}
