import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { env } from "@/env";
import { BRAND_YELLOW, SITE_DESCRIPTION, SITE_NAME, openGraph, siteUrl } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* Metadata communes (vague 6) : URL absolues depuis APP_URL, titres « … · Dev AppStore », Open Graph (image générée
 * par opengraph-image.tsx), icônes (icon.svg, apple-icon.png, favicon.ico) et manifest. */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl(env.APP_URL)),
  applicationName: SITE_NAME,
  title: { default: `${SITE_NAME} — vos achats in-app moins cher, sur le web`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: openGraph(),
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = { themeColor: BRAND_YELLOW };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP à nonce (middleware.ts) : lire les en-têtes rend chaque page dynamique, donc servie avec le nonce de sa
  // requête (Next.js l'applique lui-même à ses scripts). Une page prérendue au build serait bloquée par la CSP.
  await headers();
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
