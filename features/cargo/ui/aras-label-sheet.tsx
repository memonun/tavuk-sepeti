/**
 * The Aras Kargo parcel label, laid out like Aras's "Sipariş Bazlı" dummy
 * label template (SetOrder doc Şekil 1). Sized in millimetres for a 100×100
 * mm label (thermal printer or cut from A4) and styled inline, not with the
 * admin theme: it must print the same black-on-white everywhere.
 */
import { code128Widths } from "@/features/cargo/domain/code128";

import type { ArasLabel } from "@/features/cargo/domain/aras-label";
import type { CSSProperties } from "react";

const BORDER = "0.4mm solid #000";
const QUIET_ZONE = 10; // modules of white on each side of the barcode

const cell: CSSProperties = { borderBottom: BORDER, padding: "1.6mm 2.4mm" };
const caption: CSSProperties = { color: "#444", fontSize: "3mm" };
const value: CSSProperties = { fontWeight: 700, fontSize: "3.6mm" };

function Barcode({ code }: { code: string }) {
  const widths = code128Widths(code);
  if (!widths) return null;
  const total = widths.reduce((sum, w) => sum + w, 0) + 2 * QUIET_ZONE;

  const bars: Array<{ x: number; w: number }> = [];
  let x = QUIET_ZONE;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });

  return (
    <svg
      role="img"
      aria-label={`Barkod ${code}`}
      viewBox={`0 0 ${total} 60`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ display: "block", width: "82mm", height: "20mm", margin: "0 auto" }}
    >
      <rect width={total} height={60} fill="#fff" />
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} width={bar.w} height={60} fill="#000" />
      ))}
    </svg>
  );
}

export function ArasLabelSheet({ label }: { label: ArasLabel }) {
  return (
    <div
      className="aras-label-sheet"
      style={{
        width: "100mm",
        height: "100mm",
        boxSizing: "border-box",
        border: BORDER,
        background: "#fff",
        color: "#000",
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ ...cell, textAlign: "right", ...value }}>{label.date}</div>

      <div style={{ ...cell, textAlign: "right", padding: "1mm 2.4mm" }}>
        <span
          style={{
            color: "#d71920",
            fontSize: "7mm",
            fontWeight: 800,
            fontStyle: "italic",
            letterSpacing: "-0.2mm",
          }}
        >
          aras
        </span>
        <span style={{ fontSize: "3.2mm", fontWeight: 700, marginLeft: "1mm" }}>KARGO</span>
      </div>

      <div style={{ display: "flex", borderBottom: BORDER }}>
        <div style={{ flex: 1, padding: "1.6mm 2.4mm", borderRight: BORDER }}>
          <div style={caption}>Gönderici</div>
          <div style={value}>{label.sender}</div>
        </div>
        <div style={{ flex: 1, padding: "1.6mm 2.4mm", minWidth: 0 }}>
          <div style={caption}>Alıcı</div>
          <div style={{ ...value, overflowWrap: "anywhere" }}>{label.receiver}</div>
        </div>
      </div>

      <div style={{ ...cell, ...caption }}>Standart Kargo</div>

      <div style={{ ...cell, ...caption }}>
        Entegrasyon Kodu : <span style={{ ...value, color: "#000" }}>{label.integrationCode}</span>
      </div>

      <div style={{ ...cell, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Barcode code={label.integrationCode} />
        <div
          style={{
            textAlign: "center",
            fontFamily: "'Courier New', monospace",
            fontSize: "3.4mm",
            letterSpacing: "0.6mm",
            marginTop: "0.8mm",
          }}
        >
          {label.integrationCode}
        </div>
      </div>

      <div style={{ padding: "1.6mm 3mm", textAlign: "center", fontSize: "2.9mm", lineHeight: 1.35 }}>
        <span style={{ color: "#d71920", fontWeight: 700 }}>DİKKAT!</span> Lütfen Entegrasyon ile Sevk
        İşlemleri ekranında{" "}
        <span style={{ color: "#d71920", fontWeight: 700 }}>{label.accountSelection}</span> seçeneğini
        seçerek işlem yapınız.
      </div>
    </div>
  );
}
