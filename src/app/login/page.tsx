import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { SparkMark } from "@/components/SparkMark";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-10 flex items-center gap-2">
        <SparkMark className="h-7 w-7" />
        <span className="text-xl font-semibold tracking-tight">SPARK</span>
      </div>
      <h1 className="font-serif text-3xl leading-tight">Catch the idea before it’s gone.</h1>
      <p className="mt-3 text-muted">Sign in with your email. We’ll send you a link — no password to remember.</p>

      {error === "link" && (
        <p role="alert" className="mt-6 rounded-[10px] border border-line bg-surface px-4 py-3 text-sm">
          That sign-in link has expired or was already used. Request a new one below.
        </p>
      )}

      <LoginForm />
    </main>
  );
}
