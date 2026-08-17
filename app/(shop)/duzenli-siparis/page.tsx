import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { RecurringOrderPreview } from "@/features/storefront/ui/recurring-order-preview";

export const metadata: Metadata = {
  title: "Düzenli Sipariş — Apuhan Çiftliği",
  description:
    "Her hafta düzenli aldığınız ürünleri tekrar tekrar sipariş vermeden planlayın.",
};

export default function RecurringOrderPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-24 sm:px-6">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Ana Sayfa
      </Link>
      <RecurringOrderPreview />
    </main>
  );
}
