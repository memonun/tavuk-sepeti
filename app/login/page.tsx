import { LoginForm } from "@/features/auth/ui/login-form";

import "@/app/globals.css";
import "@/app/(admin)/theme.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="admin-theme flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Apuhan Çiftliği</h1>
          <p className="text-sm text-muted-foreground">
            Yönetim paneline giriş.
          </p>
        </div>
        <LoginForm {...(typeof next === "string" ? { next } : {})} />
      </div>
    </div>
  );
}
