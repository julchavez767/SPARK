import type { Metadata } from "next";
import Link from "next/link";
import { ImportClient } from "./ImportClient";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <>
      <Link href="/library" className="mb-4 inline-block text-sm text-muted hover:text-ink">← Library</Link>
      <h1 className="mb-1 font-serif text-2xl">Import</h1>
      <p className="mb-6 text-sm text-muted">Bring in ideas, projects and systems from a CSV or JSON file. You’ll see everything before anything is saved.</p>
      <ImportClient />
    </>
  );
}
