import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { whatsappChatUrl } from "@/shared/utils/phone";

/**
 * Opens the customer's WhatsApp chat (wa.me): the app on a phone, WhatsApp Web
 * or Desktop on a computer. Renders nothing for a customer without a usable
 * number. The click is stopped from reaching the row/card behind it, so tapping
 * the icon never also opens the order.
 */
export function WhatsAppLink({
  phone,
  name,
  className,
}: {
  phone: string | null | undefined;
  name?: string | undefined;
  className?: string | undefined;
}) {
  const href = whatsappChatUrl(phone);
  if (href === null) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      aria-label={`${name?.trim() || "Müşteri"} ile WhatsApp'ta yaz`}
      title="WhatsApp'ta yaz"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400",
        className,
      )}
    >
      <MessageCircle aria-hidden className="h-4 w-4" />
    </a>
  );
}
