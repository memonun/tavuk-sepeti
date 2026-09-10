/**
 * The "Kargo Kartı" view model — exactly what staff read aloud to the carrier
 * at hand-off (recipient name, phone, shipping address), nothing else. The
 * order detail page answers "what's in this order"; this answers "who am I
 * shipping it to".
 *
 * `composeCargoRecipient` is pure: the address arrives as raw jsonb
 * (`orders.delivery_address_snapshot`, an internal RPC contract) and the name
 * parts may be blank, so the seam validation lives in one tested place.
 */

export interface CargoRecipient {
  readonly orderId: string;
  /** "Ad Soyad", or "—" when neither name part is on file. */
  readonly name: string;
  /** E.164 (`+90…`) as stored, or null — legacy customers may have no phone. */
  readonly phone: string | null;
  /** Composed street address, or "—" when the snapshot carries neither
   *  `raw_text` nor a free-text `description`. */
  readonly address: string;
  /** Free-text label/description, shown under the address only when it is
   *  additional to it (not when it IS the address). */
  readonly addressNote: string | null;
}

export interface RawCargoRecipient {
  readonly orderId: string;
  readonly firstName: unknown;
  readonly lastName: unknown;
  readonly phone: unknown;
  readonly snapshot: unknown;
}

export function composeCargoRecipient(raw: RawCargoRecipient): CargoRecipient {
  const first = typeof raw.firstName === "string" ? raw.firstName.trim() : "";
  const last = typeof raw.lastName === "string" ? raw.lastName.trim() : "";
  const name = [first, last].filter(Boolean).join(" ") || "—";

  const phone =
    typeof raw.phone === "string" && raw.phone.trim().length > 0
      ? raw.phone.trim()
      : null;

  const snap =
    typeof raw.snapshot === "object" && raw.snapshot !== null
      ? (raw.snapshot as Record<string, unknown>)
      : {};
  const rawText = typeof snap.raw_text === "string" ? snap.raw_text.trim() : "";
  const description =
    typeof snap.description === "string" ? snap.description.trim() : "";

  const address = rawText || description || "—";
  const addressNote = rawText && description ? description : null;

  return { orderId: raw.orderId, name, phone, address, addressNote };
}
