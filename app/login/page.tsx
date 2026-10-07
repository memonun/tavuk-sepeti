import { LoginForm } from "@/features/auth/ui/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
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
