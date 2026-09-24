import { absoluteUrl, siteName } from "@/lib/site";

export function StructuredData({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function PageStructuredData({ title, description, path, parents = [] }: { title: string; description: string; path: string; parents?: { name: string; path: string }[] }) {
  const url = absoluteUrl(path);
  const crumbs = [{ name: siteName, path: "/" }, ...parents, { name: title, path }];
  return <StructuredData data={{
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description, inLanguage: "de-CH", isPartOf: { "@id": absoluteUrl("/#website") }, breadcrumb: { "@id": `${url}#breadcrumb` } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: absoluteUrl(crumb.path) })) },
    ],
  }} />;
}
