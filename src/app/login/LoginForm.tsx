"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <div role="status" className="mt-8 rounded-[14px] border border-line bg-surface p-5">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1 text-sm text-muted">
          If <span className="text-ink">{state.email}</span> has a SPARK account, a sign-in link is on its way. Open it on this device.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-3" noValidate>
      <label htmlFor="email" className="block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        aria-invalid={state.status === "error"}
        aria-describedby={state.status === "error" ? "email-error" : undefined}
        className="h-12 w-full rounded-[10px] border border-line bg-surface px-4 text-base outline-none focus:border-ember"
        placeholder="you@example.com"
      />
      {state.status === "error" && (
        <p id="email-error" role="alert" className="text-sm text-ember">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-[10px] bg-ember font-medium text-on-ember transition-opacity disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
