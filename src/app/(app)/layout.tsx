import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login"); // Middleware already gates this; this is the second lock.

  return (
    <div className="min-h-dvh lg:pl-60">
      <AppNav email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-2xl px-4 has-[[data-wide]]:max-w-6xl pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-10">{children}</main>
    </div>
  );
}
