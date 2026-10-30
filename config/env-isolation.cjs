"use strict";
// Environment isolation guard.
//
// Preview and development builds must never point at the production database.
// This runs while Next.js loads its config (at build time and when starting the
// dev server) and stops the build with an error if:
//   - the Supabase URL is production's, or isn't a Supabase project URL;
//   - the public key isn't an anon/publishable key, or belongs to another project;
//   - (on Vercel) Supabase doesn't accept the key for that URL.
//
// Production builds are not checked here, so this can never block a release.
// It prints only project IDs (which are public), never keys.

/** The production Supabase project. Public: it is part of every page the live site serves. */
const PRODUCTION_REF = "xywunnoukzwcmibbwinc";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function decodeJwtPayload(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Checks that need no network. Returns { ok, ref, local, problems }.
 * Exported for tests.
 */
function inspectSupabaseConfig(url, key) {
  const problems = [];
  let ref = null;
  let local = false;

  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set");
  else {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      problems.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
    }
    if (host) {
      const m = host.match(/^([a-z0-9]{20})\.supabase\.co$/);
      if (m) ref = m[1];
      else if (LOCAL_HOSTS.has(host)) local = true;
      else problems.push(`NEXT_PUBLIC_SUPABASE_URL host "${host}" is not a Supabase project`);
    }
    if (url.includes(PRODUCTION_REF)) problems.push("NEXT_PUBLIC_SUPABASE_URL points to the PRODUCTION project");
  }

  if (!key) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  else if (key.startsWith("sb_secret_")) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is a SECRET key; it must be the anon/publishable key");
  else if (key.startsWith("sb_publishable_")) {
    // New-style keys carry no project ID; the network check below ties it to the URL.
  } else {
    const payload = decodeJwtPayload(key);
    if (!payload) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not a recognisable Supabase key");
    else {
      if (payload.role !== "anon") problems.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY has role "${payload.role}", expected "anon"`);
      if (payload.ref === PRODUCTION_REF) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY belongs to the PRODUCTION project");
      else if (ref && payload.ref !== ref) problems.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY belongs to project ${payload.ref}, but the URL is project ${ref}`);
    }
  }

  return { ok: problems.length === 0, ref, local, problems };
}

/** Asks Supabase whether it accepts this key for this URL. Returns null when accepted, otherwise the reason. */
async function verifyKeyWithSupabase(url, key, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? null : `Supabase rejected the key for this URL (HTTP ${res.status})`;
  } catch (e) {
    return `could not reach Supabase to check the key (${e instanceof Error ? e.message : String(e)})`;
  }
}

/** Runs the guard. Throws (stopping the build) on any problem in a non-production environment. */
async function assertEnvironmentIsolation(env = process.env, fetchImpl = fetch) {
  const target = env.VERCEL_ENV ?? "development"; // unset outside Vercel = someone's computer
  if (target === "production") return { skipped: true };

  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const result = inspectSupabaseConfig(url, key);

  // On Vercel the key must be proven to belong to the URL's project. Locally this is
  // skipped for a local Supabase or when offline is acceptable; a production URL is
  // already rejected above without any network call.
  if (result.ok && !result.local && env.VERCEL) {
    const reason = await verifyKeyWithSupabase(url, key, fetchImpl);
    if (reason) result.problems.push(reason);
  }

  if (result.problems.length) {
    throw new Error(
      `Environment isolation check failed for the "${target}" build:\n  - ${result.problems.join("\n  - ")}\n` +
        "Preview and development builds must use the spark-dev Supabase project. Fix the Preview/Development " +
        "environment variables in Vercel (or .env.local) and build again.",
    );
  }
  console.log(`Environment isolation check passed: ${target} build uses Supabase project ${result.local ? "(local)" : result.ref}, not production.`);
  return { skipped: false, ref: result.ref };
}

module.exports = { PRODUCTION_REF, inspectSupabaseConfig, verifyKeyWithSupabase, assertEnvironmentIsolation };
