import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const alt = "NEXA. Your AI. Your API. Your control.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 88, background: "#141210", color: "#f3f1ec" }}>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
          <span>Your AI.</span>
          <span>Your API.</span>
          <span>Your control.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 56, fontSize: 26, color: "#b8b2a6" }}>
          <div style={{ width: 16, height: 16, borderRadius: 16, background: "#eebb5e" }} />
          <div style={{ flex: 1, height: 2, background: "#4a4640", margin: "0 18px" }} />
          <span>NEXA</span>
        </div>
      </div>
    ),
    size,
  );
}
