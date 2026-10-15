/**
 * The long product-page text is plain text typed by the owner in the admin
 * form: paragraphs separated by a blank line. Rendering splits it into <p>s —
 * never HTML, so nothing typed there can inject markup.
 *
 * Pure: no env, no I/O.
 */
export function splitDescriptionParagraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
}
