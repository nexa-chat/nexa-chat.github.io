import { ImageResponse } from "next/og";

/** The mark on the dark ground, drawn at any size for PWA and Apple icons. */
export function renderAppIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#141210" }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
          <path d="M5 21V8M19 3v13M5 8l14 8" stroke="#eebb5e" strokeWidth="3" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
