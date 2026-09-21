import { DriveOfflineSupport } from "@/features/routing/ui/drive-offline-support";

/**
 * Wraps /routes and /routes/drive. Only adds the offline worker registration
 * (see public/drive-sw.js) — no visual chrome of its own.
 */
export default function RoutesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DriveOfflineSupport />
      {children}
    </>
  );
}
