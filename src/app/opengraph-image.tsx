import { ImageResponse } from "next/og";

export const alt = "Politik Kompass Schweiz — Kantone, Gemeinden und Abstimmungen im Vergleich";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f5f5ee", padding: 68, color: "#192b27", alignItems: "center", gap: 50 }}>
      <div style={{ display: "flex", flexDirection: "column", width: 690 }}>
        <div style={{ fontSize: 20, color: "#1f5b4f", marginBottom: 24 }}>SCHWEIZER ABSTIMMUNGEN VERSTEHEN</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>Politik Kompass Schweiz</div>
        <div style={{ fontSize: 29, marginTop: 30, lineHeight: 1.4, color: "#53685c" }}>Kantone und Gemeinden im Vergleich. Mit Quellen und transparenter Methodik.</div>
        <div style={{ fontSize: 19, marginTop: 42 }}>politik-kompass-schweiz.info</div>
      </div>
      <svg width="290" height="290" viewBox="0 0 290 290"><rect width="290" height="290" rx="24" fill="#e2ebe0"/><circle cx="145" cy="145" r="112" fill="none" stroke="#92b9a4" strokeWidth="3"/><path d="M145 24V266M24 145H266" stroke="#92b9a4" strokeWidth="2"/><path d="M190 64L166 166L64 190L121 121Z" fill="#1f5b4f"/><path d="M190 64L121 121L166 166Z" fill="#d7564f"/><circle cx="145" cy="145" r="10" fill="#f5f5ee"/></svg>
    </div>, size,
  );
}
