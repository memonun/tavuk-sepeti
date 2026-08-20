import { z } from "zod";

export const createMarketLocationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Lokasyon adı gerekli.")
    .max(100, "En fazla 100 karakter olabilir."),
});
export type CreateMarketLocationInput = z.input<typeof createMarketLocationSchema>;

export const deleteMarketLocationSchema = z.object({ id: z.string().uuid() });
export type DeleteMarketLocationInput = z.input<typeof deleteMarketLocationSchema>;

export const setMarketLocationActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type SetMarketLocationActiveInput = z.input<typeof setMarketLocationActiveSchema>;
