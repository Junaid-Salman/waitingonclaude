import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WaitingOnClaude",
  description: "Quick games for while you wait on Claude.",
};

// resizes-content keeps the on-screen keyboard usable when a phone's own keyboard opens (the
// name and Challenge forms); viewport-fit=cover lets the safe-area padding below take effect.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] font-sans">
        <MotionProvider>{children}</MotionProvider>
        <footer className="regular-text-sm p-4 text-center text-muted">
          Not affiliated with Anthropic or The New York Times.
        </footer>
      </body>
    </html>
  );
}
