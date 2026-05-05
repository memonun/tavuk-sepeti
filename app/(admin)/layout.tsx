import { redirect } from "next/navigation";

import { signOutAction } from "@/features/auth/application/sign-out";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { Button } from "@/components/ui/button";

/**
 * Wraps every (admin) route. The middleware already redirects anonymous
 * users; this layout is defense-in-depth so a hypothetical middleware bypass
 * still can't render admin chrome to a non-user.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-lg font-semibold">Tavuk Sepeti — Yönetim</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {user.email ? <span>{user.email}</span> : null}
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Çıkış
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
