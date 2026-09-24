import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { StructuredData } from "@/components/structured-data";
import { absoluteUrl, siteDescription, siteName, siteUrl } from "@/lib/site";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${siteName} – Kantone, Gemeinden & Abstimmungen`, template: `%s | ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${dmSans.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <StructuredData data={{ "@context": "https://schema.org", "@type": "WebSite", "@id": absoluteUrl("/#website"), url: absoluteUrl(), name: siteName, description: siteDescription, inLanguage: "de-CH" }} />
        {children}
      </body>
    </html>
  );
}
