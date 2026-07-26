/**
 * Decorative emoji stand-in for product imagery (scaffold). Real product photos
 * (next/image) drop in here later; keeping the mapping in one place means the
 * cards, cart and summary stay visually consistent until then.
 */
export function productEmoji(productKey: string): string {
  const key = productKey.toLowerCase();
  if (key.includes("egg") || key.includes("yumurta")) return "🥚";
  if (key.includes("milk") || key.includes("süt") || key.includes("sut")) return "🥛";
  if (key.includes("cheese") || key.includes("peynir")) return "🧀";
  if (key.includes("yogurt") || key.includes("yoğurt") || key.includes("yogurt")) return "🍶";
  if (key.includes("butter") || key.includes("tereyağ")) return "🧈";
  if (key.includes("honey") || key.includes("bal")) return "🍯";
  return "🧺";
}
