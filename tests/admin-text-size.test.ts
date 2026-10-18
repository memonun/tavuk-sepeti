/**
 * The panel's text-size cookie: anything that is not one of the three known
 * sizes (missing, stale, hand-edited) falls back to the normal size.
 */
import { describe, expect, it } from "vitest";

import { TEXT_SIZES, parseTextSize } from "@/app/(admin)/_components/text-size";

describe("parseTextSize", () => {
  it.each(TEXT_SIZES)("keeps a known size (%s)", (size) => {
    expect(parseTextSize(size)).toBe(size);
  });

  it.each([undefined, "", "huge", "LARGE", "large; path=/"])(
    "falls back to normal for %j",
    (value) => {
      expect(parseTextSize(value)).toBe("normal");
    },
  );
});
