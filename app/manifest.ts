import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "營運記帳 APP",
    short_name: "記帳APP",
    description: "現金、銀行、轉帳、週報的雲端記帳工具",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#111827",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
