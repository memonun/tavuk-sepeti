import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { decideConnectorAuthorizationAction } from "@/features/mcp/application/decide-connector-authorization";
import { loadConnectorAuthorization } from "@/features/mcp/application/load-connector-authorization";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claude bağlantısı",
  robots: { index: false, follow: false },
};

// Always per-request: the authorization is single-use and tied to the session.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ authorization_id?: string | string[]; error?: string | string[] }>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">{children}</div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </Shell>
  );
}

export default async function ConnectorConsentPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const authorizationId =
    typeof params.authorization_id === "string" ? params.authorization_id : undefined;
  const failed = params.error === "failed";

  const view = await loadConnectorAuthorization(authorizationId);

  if (view.kind === "unauthenticated") {
    const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId ?? "")}`;
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }
  if (view.kind === "redirect") redirect(view.url);

  if (view.kind === "forbidden") {
    return (
      <Notice
        title="Yetkiniz yok"
        body="Claude bağlantısını yalnızca panel yöneticileri onaylayabilir."
      />
    );
  }
  if (view.kind === "invalid") {
    return (
      <Notice
        title="Geçersiz istek"
        body="Bu bağlantı isteği geçersiz veya süresi dolmuş. Claude'dan bağlantıyı yeniden başlatın."
      />
    );
  }

  return (
    <Shell>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Apuhan Çiftliği</h1>
        <p className="text-sm text-muted-foreground">Claude bağlantı isteği</p>
      </div>

      <div className="space-y-3 rounded-lg border p-4 text-sm">
        <p>
          <span className="font-medium">{view.clientName}</span>, <span className="font-medium">{view.email}</span>{" "}
          hesabıyla paneline erişmek istiyor.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Siparişleri, müşterileri, ürünleri, finans özetini ve ajandayı okuyabilir.</li>
          <li>Sipariş durumlarını değiştirebilir ve siparişleri onaylayabilir.</li>
          <li>Sipariş oluşturamaz, silemez; ödeme kaydı ekleyemez.</li>
        </ul>
        <p className="break-all text-xs text-muted-foreground">Yönlendirme: {view.redirectUri}</p>
      </div>

      {failed ? (
        <p className="text-sm text-destructive" role="alert">
          İşlem tamamlanamadı. Lütfen tekrar deneyin.
        </p>
      ) : null}

      <form action={decideConnectorAuthorizationAction} className="flex gap-3">
        <input type="hidden" name="authorization_id" value={view.authorizationId} />
        <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
          Reddet
        </Button>
        <Button type="submit" name="decision" value="approve" className="flex-1">
          İzin ver
        </Button>
      </form>
    </Shell>
  );
}
