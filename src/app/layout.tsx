import type { Metadata, Viewport } from "next";
import { Mukta } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeInitScript } from "@/lib/theme";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141320" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // "system" is left unset so the inline script resolves it from prefers-color-scheme.
  const dataTheme = theme === "system" ? undefined : theme;

  return (
    <html lang="en" data-theme={dataTheme} className={`${mukta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-ground text-ink">{children}</body>
    </html>
  );
}
