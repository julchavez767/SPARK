"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { analyzeImport, type Decision, type RowPlan } from "@/lib/import/analyze";
import { IMPORT_LIMITS, parseImport, type ParsedFile } from "@/lib/import/normalize";
import { AI_IMPORT_PROMPT } from "@/lib/import/prompt";
import { ITEM_TYPES, TYPE_LABEL, TYPE_PLURAL, type ItemStatus } from "@/lib/types";
import { StatusPill, TypeBadge } from "@/components/ItemBadges";
import { commitImport, getImportContext, type CommitResult, type ImportContext } from "./actions";

type Loaded = { text: string; fileName: string; parsed: ParsedFile; context: ImportContext };

export function ImportClient() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [committing, startCommit] = useTransition();

  function load(text: string, fileName: string, problem?: string) {
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setResult(null);
    setDecisions({});
    const parsed = parseImport(text, fileName);
    if (parsed.fileError) {
      setError(parsed.fileError);
      return;
    }
    startLoading(async () => {
      const ctx = await getImportContext();
      if ("error" in ctx) setError(ctx.error);
      else setLoaded({ text, fileName, parsed, context: ctx });
    });
  }

  function reset() {
    setLoaded(null);
    setDecisions({});
    setResult(null);
    setError(null);
  }

  const plan = useMemo(
    () => (loaded ? analyzeImport(loaded.parsed.rows, loaded.context.existing, decisions, loaded.context.categories, loaded.context.tags) : null),
    [loaded, decisions],
  );

  function confirm() {
    if (!loaded || !plan) return;
    const finalDecisions: Record<string, Decision> = {};
    for (const p of plan.rows) if (p.decision && p.row.errors.length === 0) finalDecisions[p.row.key] = p.decision;
    startCommit(async () => {
      const res = await commitImport({ text: loaded.text, fileName: loaded.fileName, decisions: finalDecisions });
      setResult(res);
      if (res.ok) setLoaded(null);
    });
  }

  if (result?.ok) return <Done result={result} onAnother={reset} />;
  if (!loaded || !plan) return <Choose onLoad={load} error={error} loading={loading} />;

  const s = plan.summary;
  const review = plan.rows.filter((p) => p.needsReview);
  const dupes = plan.rows.filter((p) => p.duplicate?.kind === "exact");
  const errored = plan.rows.filter((p) => p.row.errors.length > 0);
  const ready = plan.rows.filter((p) => p.row.errors.length === 0 && !p.duplicate);
  const setDecision = (key: string, d: Decision) => setDecisions((prev) => ({ ...prev, [key]: d }));

  return (
    <div className="pb-32">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-muted">{loaded.fileName || "Pasted text"} · {loaded.parsed.rows.length} rows</span>
        <button type="button" onClick={reset} className="shrink-0 text-muted underline-offset-2 hover:text-ink hover:underline">Choose another file</button>
      </div>

      {/* Summary */}
      <section aria-label="Summary" className="mb-6 rounded-[14px] border border-line bg-surface p-4">
        <p className="font-serif text-xl">{s.importing} item{s.importing === 1 ? "" : "s"} ready to import</p>
        <p className="mt-1 text-sm text-muted">
          {ITEM_TYPES.map((t) => `${s.byType[t]} ${(s.byType[t] === 1 ? TYPE_LABEL[t] : TYPE_PLURAL[t]).toLowerCase()}`).join(" · ")}
          {" · "}
          {s.links} link{s.links === 1 ? "" : "s"}
          {s.linksToExisting > 0 && ` (${s.linksToExisting} to items already in SPARK)`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {s.undecided > 0 && <Chip tone="alert">{s.undecided} to review</Chip>}
          {s.exactDuplicates > 0 && <Chip>{s.exactDuplicates} duplicate{s.exactDuplicates === 1 ? "" : "s"}</Chip>}
          {s.errors > 0 && <Chip>{s.errors} can’t import</Chip>}
          {s.warnings > 0 && <Chip>{s.warnings} note{s.warnings === 1 ? "" : "s"}</Chip>}
          {s.newCategories.length > 0 && <Chip>New categories: {s.newCategories.join(", ")}</Chip>}
          {s.newTags.length > 0 && <Chip>{s.newTags.length} new tag{s.newTags.length === 1 ? "" : "s"}</Chip>}
        </div>
        {loaded.parsed.ignoredColumns.length > 0 && (
          <p className="mt-3 text-xs text-muted">Ignored columns: {loaded.parsed.ignoredColumns.join(", ")}</p>
        )}
      </section>

      {review.length > 0 && (
        <Section title="Possible duplicates" hint="These look like something you already have. Choose for each one.">
          {review.map((p) => (
            <RowCard key={p.row.key} plan={p} highlight={p.decision === null}>
              <MatchLine plan={p} />
              <DecisionToggle value={p.decision} onChange={(d) => setDecision(p.row.key, d)} />
            </RowCard>
          ))}
        </Section>
      )}

      {dupes.length > 0 && (
        <Section title="Exact duplicates" hint="Skipped by default. Links to them go to the existing item instead.">
          {dupes.map((p) => (
            <RowCard key={p.row.key} plan={p}>
              <MatchLine plan={p} />
              <DecisionToggle value={p.decision} onChange={(d) => setDecision(p.row.key, d)} />
            </RowCard>
          ))}
        </Section>
      )}

      {errored.length > 0 && (
        <Section title="Can’t import" hint="Fix these in the file and import it again, or leave them out.">
          {errored.map((p) => (
            <RowCard key={p.row.key} plan={p}>
              <ul className="mt-2 space-y-0.5 text-sm text-ember">
                {p.row.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </RowCard>
          ))}
        </Section>
      )}

      {ready.length > 0 && (
        <Section title={`New (${ready.length})`}>
          <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
            {ready.map((p) => <ReadyRow key={p.row.key} plan={p} />)}
          </ul>
        </Section>
      )}

      {/* Confirm bar: sits above the phone tab bar, beside the desktop sidebar */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted" role="status" aria-live="polite">
            {result && !result.ok ? (
              <span className="text-ember">{result.error}</span>
            ) : s.undecided > 0 ? (
              `Review ${s.undecided} possible duplicate${s.undecided === 1 ? "" : "s"} to continue.`
            ) : (
              "Nothing is saved until you confirm. Existing items are never changed."
            )}
          </p>
          <button
            type="button"
            onClick={confirm}
            disabled={committing || s.undecided > 0 || s.importing === 0}
            className="h-11 shrink-0 rounded-full bg-ember px-5 text-sm font-medium text-on-ember disabled:opacity-40"
          >
            {committing ? "Importing…" : `Import ${s.importing}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Choose a file ---------- */

function Choose({ onLoad, error, loading }: { onLoad: (text: string, name: string, problem?: string) => void; error: string | null; loading: boolean }) {
  const [pasting, setPasting] = useState(false);
  const [copied, setCopied] = useState(false);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > IMPORT_LIMITS.maxFileBytes) {
      onLoad("", file.name, "That file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    onLoad(await file.text(), file.name);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      {!pasting ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-line bg-surface px-6 py-10 text-center hover:border-ember has-[:focus-visible]:border-ember">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-ember" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4m0 0-4 4m4-4 4 4M5 20h14" /></svg>
          <span className="font-medium">{loading ? "Reading…" : "Choose a CSV or JSON file"}</span>
          <span className="text-sm text-muted">Up to {IMPORT_LIMITS.maxRows.toLocaleString()} items. Nothing is saved until you confirm.</span>
          <input type="file" accept=".csv,.json,text/csv,application/json,text/plain" onChange={onFile} disabled={loading} className="sr-only" />
        </label>
      ) : (
        <div className="space-y-2">
          <label htmlFor="paste" className="text-sm font-medium">Paste CSV or JSON</label>
          <textarea id="paste" ref={pasteRef} rows={10} className="block w-full rounded-[14px] border border-line bg-surface p-3 font-mono text-sm outline-none focus:border-ember" placeholder="type,title,description,…" />
          <button
            type="button"
            disabled={loading}
            onClick={() => onLoad(pasteRef.current?.value ?? "", "")}
            className="h-11 rounded-full bg-ember px-5 text-sm font-medium text-on-ember disabled:opacity-40"
          >
            {loading ? "Reading…" : "Preview"}
          </button>
        </div>
      )}

      <button type="button" onClick={() => setPasting((v) => !v)} className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
        {pasting ? "Choose a file instead" : "Paste text instead"}
      </button>

      {error && <p role="alert" className="rounded-[12px] border border-ember/40 bg-ember-soft px-4 py-3 text-sm">{error}</p>}

      <section className="rounded-[14px] border border-line bg-surface p-4">
        <h2 className="font-medium">Format</h2>
        <p className="mt-1 text-sm text-muted">
          Required: <b>type</b> (idea, project or system) and <b>title</b>. Optional: description, status, category, tags, ref, related, source, source_url, origin, created.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/spark-import-template.csv" download className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">CSV template</a>
          <a href="/spark-import-template.json" download className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">JSON template</a>
        </div>
      </section>

      <details className="rounded-[14px] border border-line bg-surface p-4">
        <summary className="cursor-pointer font-medium">Have ChatGPT or Claude build the file</summary>
        <p className="mt-2 text-sm text-muted">Paste this into the conversation that has your ideas, then save its CSV as a file or paste it here.</p>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-[10px] bg-bg p-3 text-xs leading-relaxed">{AI_IMPORT_PROMPT}</pre>
        <button type="button" onClick={copyPrompt} className="mt-3 h-10 rounded-full border border-line px-4 text-sm hover:border-ink">
          {copied ? "Copied" : "Copy instructions"}
        </button>
      </details>
    </div>
  );
}

/* ---------- Review pieces ---------- */

function Chip({ children, tone }: { children: React.ReactNode; tone?: "alert" }) {
  return (
    <span className={`rounded-full px-2.5 py-1 ${tone === "alert" ? "bg-ember text-on-ember" : "border border-line text-muted"}`}>
      {children}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium">{title}</h2>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div className={`space-y-2 ${hint ? "" : "mt-2"}`}>{children}</div>
    </section>
  );
}

function RowCard({ plan, highlight, children }: { plan: RowPlan; highlight?: boolean; children?: React.ReactNode }) {
  const { row } = plan;
  return (
    <div className={`rounded-[14px] border bg-surface p-3 ${highlight ? "border-ember" : "border-line"}`}>
      <div className="flex items-center gap-2">
        {row.type ? <TypeBadge type={row.type} /> : <span className="text-xs text-muted">No type</span>}
        <span className="ml-auto text-xs text-muted">Row {row.line}</span>
      </div>
      <p className="mt-1 font-serif text-[16px] leading-snug">{row.title || <span className="text-muted">Untitled</span>}</p>
      {children}
    </div>
  );
}

function MatchLine({ plan }: { plan: RowPlan }) {
  const d = plan.duplicate;
  if (!d) return null;
  const where = d.existingId ? "already in SPARK" : `row ${d.rowLine} in this file`;
  const label = d.kind === "exact" ? "Same as" : d.kind === "near" ? "Similar to" : `Same title as a ${TYPE_LABEL[d.type].toLowerCase()}`;
  return (
    <p className="mt-1 text-sm text-muted">
      {label} “<span className="text-ink">{d.title}</span>”, {where}
      {d.existingId && (
        <>
          {" · "}
          <Link href={`/items/${d.existingId}`} target="_blank" className="underline underline-offset-2">open</Link>
        </>
      )}
    </p>
  );
}

function DecisionToggle({ value, onChange }: { value: Decision | null; onChange: (d: Decision) => void }) {
  const btn = (d: Decision, label: string) => (
    <button
      type="button"
      aria-pressed={value === d}
      onClick={() => onChange(d)}
      className={`h-9 flex-1 rounded-full text-sm ${value === d ? "bg-ink font-medium text-bg" : "text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="mt-2 flex gap-1 rounded-full border border-line p-1" role="group" aria-label="Import or skip">
      {btn("import", "Import as new")}
      {btn("skip", "Skip")}
    </div>
  );
}

function ReadyRow({ plan }: { plan: RowPlan }) {
  const { row } = plan;
  const notes = [...row.warnings, ...plan.linkWarnings];
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        {row.type && <TypeBadge type={row.type} />}
        {row.status && <StatusPill status={row.status as ItemStatus} />}
        <span className="ml-auto shrink-0 text-xs text-muted">Row {row.line}</span>
      </div>
      <p className="mt-1 truncate font-serif text-[15px]">{row.title}</p>
      <p className="text-xs text-muted">
        {[
          row.category,
          row.tags.length ? row.tags.map((t) => `#${t}`).join(" ") : null,
          plan.linkCount ? `${plan.linkCount} link${plan.linkCount === 1 ? "" : "s"}` : null,
          row.sourceName,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {notes.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-[#a15c00] dark:text-[#e6a23c]">
          {notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </li>
  );
}

/* ---------- Done ---------- */

function Done({ result, onAnother }: { result: Extract<CommitResult, { ok: true }>; onAnother: () => void }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-6 text-center">
      <p className="font-serif text-2xl">Imported {result.items} item{result.items === 1 ? "" : "s"}</p>
      <p className="mt-1 text-sm text-muted">and {result.links} link{result.links === 1 ? "" : "s"}. You can undo this import from its history page.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href={`/library?import=${result.importId}`} className="h-11 rounded-full bg-ember px-5 text-sm font-medium leading-[2.75rem] text-on-ember">View imported items</Link>
        <Link href={`/imports/${result.importId}`} className="h-11 rounded-full border border-line px-5 text-sm leading-[2.75rem]">Import details</Link>
        <button type="button" onClick={onAnother} className="h-11 rounded-full px-4 text-sm text-muted hover:text-ink">Import another file</button>
      </div>
    </div>
  );
}

