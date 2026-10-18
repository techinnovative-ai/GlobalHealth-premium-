import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sentin AI · Safety evaluation platform",
    template: "%s · Sentin AI",
  },
  description:
    "Controlled AI safety tests across websites, model APIs and sandboxes. Separate Red and Blue routes, evidence-backed findings and one traceable report.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#060b17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
