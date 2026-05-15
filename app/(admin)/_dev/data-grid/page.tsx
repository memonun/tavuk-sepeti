/**
 * Dev-only smoke route for the Notion-style DataGrid primitive.
 *
 * Mounts the grid with mock data so we can exercise sticky pinning, column
 * resize/order/visibility, virtualization, inline editing, and copy/paste
 * without depending on real customer data. Not linked from the navigation.
 *
 * Visit at /_dev/data-grid. Remove once Faz 1.2 (real Customers grid)
 * ships and the manual smoke is no longer needed.
 */
import { DataGridDemo } from "@/app/(admin)/_dev/data-grid/data-grid-demo";

export default function DataGridDevPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">DataGrid (dev)</h2>
        <p className="text-sm text-muted-foreground">
          Notion-style interaktif tablo smoke testi. Çift tıkla → düzenle.
          Cmd/Ctrl+C → kopyala. Header köşesinden sürükle → boyutlandır.
          Header menüsünden sabitle / gizle. Chevron → satır genişlet.
        </p>
      </div>
      <DataGridDemo />
    </div>
  );
}
