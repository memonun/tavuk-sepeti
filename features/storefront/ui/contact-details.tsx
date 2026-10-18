import Link from "next/link";
import { MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon, type LucideIcon } from "lucide-react";

import type { ContactPage } from "@/features/storefront/application/get-info-pages";

const CHANNEL_ICONS: Record<ContactPage["channels"][number]["id"], LucideIcon> = {
  phone: PhoneIcon,
  whatsapp: MessageCircleIcon,
  email: MailIcon,
};

/**
 * /iletisim body. Name, address, phone and e-mail are COMPANY's, character for
 * character, so they match the legal pages, the footer and the Google
 * Business Profile. Each channel is one large tap target.
 */
export function ContactDetails({ page }: { page: ContactPage }) {
  return (
    <>
      <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">{page.heading}</h1>
      <p className="mt-3 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{page.intro}</p>

      <address className="mt-8 flex flex-col gap-3 not-italic">
        <div className="flex gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <MapPinIcon className="mt-1 size-7 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 text-lg leading-relaxed">
            <p className="font-display text-2xl leading-tight text-foreground">{page.brand}</p>
            <p className="text-foreground">{page.ownerName}</p>
            <p className="text-muted-foreground">{page.address}</p>
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {page.channels.map((channel) => {
            const Icon = CHANNEL_ICONS[channel.id];
            const external = channel.href.startsWith("https://");
            return (
              <li key={channel.id}>
                <a
                  href={channel.href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="shop-press shop-focus flex h-full min-h-20 items-center gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base text-muted-foreground">{channel.label}</span>
                    <span
                      className={
                        channel.id === "email"
                          ? "block text-lg font-bold break-all text-foreground underline underline-offset-4"
                          : "shop-money block text-lg font-bold whitespace-nowrap text-foreground underline underline-offset-4"
                      }
                    >
                      {channel.value}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </address>

      <ul className="mt-6 flex flex-col gap-2">
        {page.notes.map((note) => (
          <li key={note} className="max-w-[68ch] text-lg leading-relaxed text-foreground">{note}</li>
        ))}
      </ul>

      <nav aria-label="İlgili sayfalar" className="mt-10 border-t border-border pt-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-base">
          {page.links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="shop-focus inline-flex min-h-11 items-center rounded font-bold text-foreground underline underline-offset-4"
              >
                {link.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
