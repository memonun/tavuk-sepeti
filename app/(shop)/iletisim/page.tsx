import type { Metadata } from "next";

import { TrustBreadcrumb } from "@/features/content/ui/trust-parts";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import {
  buildContactPageStructuredData,
  CONTACT_PAGE,
} from "@/features/storefront/application/get-info-pages";
import { ContactDetails } from "@/features/storefront/ui/contact-details";

export const metadata: Metadata = buildPageMetadata({
  title: CONTACT_PAGE.title,
  description: CONTACT_PAGE.description,
  canonical: "/iletisim",
});

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify(buildContactPageStructuredData(CONTACT_PAGE)).replace(/</g, "\\u003c"),
      }} />
      <TrustBreadcrumb title={CONTACT_PAGE.title} />
      <ContactDetails page={CONTACT_PAGE} />
    </main>
  );
}
