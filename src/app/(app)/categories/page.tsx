import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/items";
import { deleteCategory } from "./actions";
import { AddCategory, RenameCategory } from "./CategoryForms";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const supabase = await createClient();
  const [categories, { data: assigned }] = await Promise.all([
    loadCategories(supabase),
    supabase.from("items").select("category_id").not("category_id", "is", null),
  ]);

  const counts = new Map<string, number>();
  for (const row of assigned ?? []) {
    const id = row.category_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (
    <>
      <Link href="/library" className="mb-4 inline-block text-sm text-muted hover:text-ink">← Library</Link>
      <h1 className="mb-1 font-serif text-2xl">Categories</h1>
      <p className="mb-6 text-sm text-muted">One per item. Tap a name to rename it everywhere.</p>

      <AddCategory />

      {categories.length === 0 ? (
        <p className="mt-6 rounded-[14px] border border-dashed border-line p-6 text-center text-sm text-muted">
          No categories yet. Add one above, or they’ll be created when you import.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-[14px] border border-line bg-surface">
          {categories.map((c) => {
            const n = counts.get(c.id) ?? 0;
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <RenameCategory id={c.id} name={c.name} />
                <Link href={`/library?cat=${c.id}`} className="shrink-0 text-sm text-muted hover:text-ink">
                  {n} item{n === 1 ? "" : "s"}
                </Link>
                <details className="relative shrink-0">
                  <summary aria-label={`Delete ${c.name}`} title="Delete" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-muted hover:bg-ember-soft hover:text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </summary>
                  <form action={deleteCategory} className="absolute right-0 z-10 mt-1 w-64 rounded-[12px] border border-line bg-surface p-3 text-sm shadow-lg">
                    <input type="hidden" name="id" value={c.id} />
                    <p className="mb-2">
                      Delete “{c.name}”?{n > 0 && ` Its ${n} item${n === 1 ? "" : "s"} stay and become uncategorized.`}
                    </p>
                    <button type="submit" className="rounded-full border border-ember px-3 py-1.5 text-ember">Delete category</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
