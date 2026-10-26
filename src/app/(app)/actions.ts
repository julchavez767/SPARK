"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { captureSchema, deriveTitle } from "@/lib/validation/idea";

export type CaptureState =
  | { status: "idle" }
  | { status: "saved"; id: string; title: string; at: number }
  | { status: "error"; message: string };

export async function captureIdea(_prev: CaptureState, formData: FormData): Promise<CaptureState> {
  const parsed = captureSchema.safeParse({
    body: formData.get("body"),
    source: formData.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "That idea couldn't be saved." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { status: "error", message: "Your session expired. Sign in again to save." };
  }

  const title = deriveTitle(parsed.data.body);
  const { data, error } = await supabase
    .from("ideas")
    .insert({ title, original_body: parsed.data.body, source: parsed.data.source })
    .select("id, title")
    .single();

  if (error || !data) {
    console.error("captureIdea insert failed", error?.message);
    return { status: "error", message: "Couldn't save just now. Your text is kept — try again." };
  }

  revalidatePath("/");
  revalidatePath("/library");
  return { status: "saved", id: data.id as string, title: data.title as string, at: Date.now() };
}
