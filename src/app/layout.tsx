import type { Metadata, Viewport } from "next";
import { Mukta } from "next/font/google";
import "./globals.css";

const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Saait", template: "%s · Saait" },
  description: "Lock a photographer or videographer for your date in Nepal. Fixed prices, verified providers, a guaranteed booking.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mukta.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-ink">{children}</body>
    </html>
  );
}
