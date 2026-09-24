import { CatalogExplorer } from "@/components/catalog-explorer";
import { pageMetadata, siteDescription } from "@/lib/site";
import "./explorer.css";
import "./map.css";
import "./profile.css";
import "./political-compass.css";
import "./workspace.css";

export const metadata = pageMetadata("Politik Kompass Schweiz – Kantone und Gemeinden", siteDescription, "/");

export default function Home() {
  return <CatalogExplorer />;
}
