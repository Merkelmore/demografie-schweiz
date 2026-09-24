import type { MetadataRoute } from "next";
import { cantonPages } from "@/lib/discovery";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Source dates describe the data, not when these pages were last edited.
  return ["/", "/politischer-kompass", "/kantone", "/methodik", "/ueber-das-projekt", ...cantonPages.map(({ slug }) => `/kantone/${slug}`)]
    .map((path) => ({ url: absoluteUrl(path) }));
}
