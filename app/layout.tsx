import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (app/fonts, SIL OFL 1.1) so the build never needs fonts.googleapis.com.
const outfit = localFont({
  src: "./fonts/Outfit-Variable-latin.woff2",
  weight: "100 900",
  variable: "--font-outfit",
});

const fraunces = localFont({
  src: "./fonts/Fraunces-Variable-latin.woff2",
  weight: "100 900",
  variable: "--font-fraunces",
});

const plex = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "Keel Payroll",
  description: "Pay contractors in their local stablecoin. USD₮ in, wBRL, wARS, cNGN, IDRX, wMXN, or wCOP out, inside a cap you can revoke.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} ${plex.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
