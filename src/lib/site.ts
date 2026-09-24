import type { Metadata } from "next";

export const siteUrl = "https://politik-kompass-schweiz.info";
export const siteName = "Politik Kompass Schweiz";
export const siteDescription = "Politischer Kompass, Abstimmungen und Kennzahlen der Schweizer Kantone und Gemeinden. Mit BFS-Quellen, transparentem Datenstand und erklärter Methodik.";

export function absoluteUrl(path = "/") {
  return new URL(path, siteUrl).toString();
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      type: "website",
      locale: "de_CH",
      siteName,
      title: `${title} | ${siteName}`,
      description,
      url: absoluteUrl(path),
      images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: siteName }],
    },
    twitter: { card: "summary_large_image", title, description, images: [absoluteUrl("/opengraph-image")] },
  };
}
