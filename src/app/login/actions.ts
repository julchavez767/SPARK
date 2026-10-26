"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${env.siteUrl}/auth/callback` },
  });

  if (error) {
    // Don't leak whether an account exists; surface rate limits plainly.
    const message =
      error.status === 429
        ? "Too many sign-in emails. Wait a minute and try again."
        : "We couldn't send the sign-in email. Try again.";
    console.error("signInWithOtp failed", error.message);
    return { status: "error", message, email: parsed.data };
  }

  return { status: "sent", email: parsed.data };
}
