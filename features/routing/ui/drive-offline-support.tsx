"use client";

/**
 * Mounted once by the /routes layout: registers the offline worker and stores
 * a copy of whichever route page the driver is on, so the page and its next
 * stop are still there when the signal drops. Renders nothing.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { ensureDriveOfflineCopy } from "@/features/routing/ui/drive-offline-client";

export function DriveOfflineSupport() {
  const pathname = usePathname();

  useEffect(() => {
    void ensureDriveOfflineCopy();
    // Also when connectivity returns: a copy that failed to store while the
    // signal was down gets a second chance.
    const onOnline = () => void ensureDriveOfflineCopy();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [pathname]);

  return null;
}
