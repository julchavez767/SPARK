export declare const PRODUCTION_REF: string;
export declare function inspectSupabaseConfig(
  url: string,
  key: string,
): { ok: boolean; ref: string | null; local: boolean; problems: string[] };
export declare function verifyKeyWithSupabase(url: string, key: string, fetchImpl?: typeof fetch): Promise<string | null>;
export declare function assertEnvironmentIsolation(
  env?: Record<string, string | undefined>,
  fetchImpl?: typeof fetch,
): Promise<{ skipped: boolean; ref?: string | null }>;
