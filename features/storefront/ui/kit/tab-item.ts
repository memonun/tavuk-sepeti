/** One tab in the phone tab bar. Shared by the three links in
 *  `MobileBottomNav` and by the basket tab (`CartSheet` variant="tab"), so all
 *  four are the same size and press the same way. */
export const tabItemClass =
  "shop-press shop-focus flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 active:bg-secondary";

/** 14px — the one place the shop goes under 16px: four labels have to share
 *  a 360px-wide phone, and a tab label is read together with its icon. Bold,
 *  and allowed to wrap to two lines rather than truncate. */
export const tabLabelClass =
  "flex min-h-[2.2em] items-center text-center text-sm leading-[1.1] font-bold text-balance";
