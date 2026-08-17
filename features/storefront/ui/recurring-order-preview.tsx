import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildWhatsAppLink,
  SUPPORT_WHATSAPP_E164,
} from "@/features/storefront/domain/support-contact";

const STEPS = [
  {
    title: "Ürün seçin",
    description: "Her hafta almak istediğiniz ürünleri ve miktarları belirleyin.",
  },
  {
    title: "Sıklık belirleyin",
    description: "Haftalık, iki haftada bir veya aylık — size uygun sıklığı seçin.",
  },
  {
    title: "Biz gönderelim",
    description: "Siz hatırlamadan, ürünleriniz seçtiğiniz günde hazır olsun.",
  },
] as const;

const FREQUENCY_PREVIEW_OPTIONS = ["Haftalık", "İki Haftada Bir", "Aylık"] as const;

/**
 * A UI shell only — there is no recurring/subscription order backend for
 * customers yet (the real `recurring_templates` system is staff-only, run
 * from the admin panel). Every field below is disabled and clearly marked as
 * a preview, on purpose: this page must never look like it already works.
 * The only live action is the WhatsApp interest link, which reuses the same
 * contact utility the rest of the storefront uses.
 */
export function RecurringOrderPreview() {
  const interestLink = buildWhatsAppLink(
    SUPPORT_WHATSAPP_E164,
    "Merhabalar, düzenli sipariş özelliğiyle ilgileniyorum. Ne zaman aktif olacak?",
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Badge variant="secondary" className="mb-3">
          Yakında
        </Badge>
        <h1 className="font-display text-3xl tracking-[-0.01em] text-foreground">
          🔄 Düzenli Sipariş
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Her hafta düzenli aldığınız ürünleri tekrar tekrar sipariş vermeden
          planlayın.
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {index + 1}
            </span>
            <p className="mt-3 font-semibold text-foreground">{step.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-5 sm:p-6">
        <p className="text-sm font-semibold text-foreground">
          Yakında böyle görünecek
        </p>
        <p className="mt-1 mb-5 text-xs text-muted-foreground">
          Aşağıdaki alanlar henüz aktif değil — bu, gelecekte eklenecek
          formun bir önizlemesi.
        </p>

        <fieldset disabled className="flex flex-col gap-5" aria-disabled="true">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preview-product">Ürün</Label>
            <Input
              id="preview-product"
              placeholder="Örn: Yumurta (30'lu)"
              readOnly
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-quantity">Miktar</Label>
              <Input id="preview-quantity" placeholder="1" readOnly />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preview-day">Tercih edilen teslimat günü</Label>
              <Input id="preview-day" placeholder="Örn: Salı" readOnly />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Sıklık</Label>
            <div className="flex flex-wrap gap-2">
              {FREQUENCY_PREVIEW_OPTIONS.map((option, index) => (
                <span
                  key={option}
                  className={cn(
                    "flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm",
                    index === 0
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {index === 0 ? <CheckIcon className="size-3.5" aria-hidden /> : null}
                  {option}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex h-5 w-9 items-center rounded-full bg-primary/60 p-0.5">
              <span className="size-4 translate-x-4 rounded-full bg-background" />
            </span>
            Durum: Aktif
          </div>
        </fieldset>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 text-center sm:p-6">
        <p className="text-sm font-medium text-foreground">
          Bu özellik henüz aktif değil.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          İlgilendiğinizi bize WhatsApp&apos;tan iletin, aktif olduğunda size
          haber verelim.
        </p>
        <a
          href={interestLink}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "lg" }), "mt-4 rounded-full")}
        >
          Bu özellikle ilgileniyorum
        </a>
      </div>
    </div>
  );
}
