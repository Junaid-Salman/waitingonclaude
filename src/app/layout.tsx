import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import { themes } from "@/lib/colors";
import "./globals.css";

// Design C: Bricolage Grotesque ExtraBold for display, Figtree for text. next/font self-hosts both
// at build time, so no request goes to Google when someone plays.
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["800"] });
const sans = Figtree({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "WaitingOnClaude",
  description: "Quick games for while you wait on Claude. Five rounds, one word each, up to five players.",
  applicationName: "WaitingOnClaude",
};

// resizes-content keeps the on-screen keyboard usable when a phone's own keyboard opens (the
// name and Challenge forms); viewport-fit=cover lets the safe-area padding below take effect.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: themes.light.background },
    { media: "(prefers-color-scheme: dark)", color: themes.dark.background },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] font-sans">
        <MotionProvider>{children}</MotionProvider>
        <footer className="regular-text-xs px-4 pt-6 pb-8 text-muted sm:px-12">
          Not affiliated with Anthropic or The New York Times. No accounts, no cookies, no tracking.
        </footer>
      </body>
    </html>
  );
}
