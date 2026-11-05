import type { MetadataRoute } from "next";
import { themes } from "@/lib/colors";

// Lets a phone add the site to its home screen with the right name, colours and icons. The icons
// come from design/logo/kit/favicon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WaitingOnClaude",
    // The full name truncates under a home-screen icon (owner Q16).
    short_name: "Waiting",
    description: "Quick games for while you wait on Claude.",
    start_url: "/",
    display: "standalone",
    background_color: themes.light.background,
    theme_color: themes.light.background,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
