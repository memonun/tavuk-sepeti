"use client";

/**
 * Mounted once by the admin layout: registers public/admin-sw.js, which shows a
 * built-in "İnternet yok" page instead of Chrome's error screen when an admin
 * page can't load. Renders nothing.
 *
 * Best-effort, like the route pages' drive worker: production only (in
 * `next dev` a worker fights HMR), and a browser without service workers or a
 * failed registration leaves the panel working exactly as before.
 *
 * Only admins ever reach this component, so storefront visitors never get the
 * worker; on an admin's phone it answers admin page loads only.
 */
import { useEffect } from "react";

const SW_URL = "/admin-sw.js";
const SW_SCOPE = "/";

export function AdminOfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch(() => {
      /* blocked / unsupported — the panel still works online */
    });
  }, []);

  return null;
}
