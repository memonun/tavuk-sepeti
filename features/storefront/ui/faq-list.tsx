import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";

import { publishedFaqItems, type FaqPage } from "@/features/storefront/application/get-info-pages";

/**
 * /sss body: one native <details> per question, the question as its <h2>.
 * No JS: the answers are in the HTML whether open or closed, so search
 * engines and the FAQPage JSON-LD see exactly the same text.
 */
export function FaqList({ page }: { page: FaqPage }) {
  return (
    <>
      <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">{page.heading}</h1>
      <p className="mt-3 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">
        {page.intro}{" "}
        <Link href="/iletisim" className="shop-focus rounded font-bold text-foreground underline underline-offset-4">
          İletişim bilgilerimiz
        </Link>
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {publishedFaqItems(page).map((item) => (
          <details
            key={item.id}
            id={item.id}
            className="group scroll-mt-24 rounded-2xl border border-border bg-card"
          >
            <summary className="shop-focus flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
              <h2 className="text-xl leading-snug font-bold text-foreground">{item.question}</h2>
              <ChevronDownIcon
                className="size-6 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-5 sm:px-5">
              {item.answer.map((paragraph, index) => (
                <p key={index} className="max-w-[68ch] text-lg leading-relaxed text-foreground">
                  {paragraph}
                </p>
              ))}
              {item.links.length > 0 ? (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-base">
                  {item.links.map((link) => (
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
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
