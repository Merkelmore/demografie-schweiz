import { CantonLinks, SnapshotNotice } from "@/components/discovery-content";
import { PageStructuredData } from "@/components/structured-data";
import { pageMetadata } from "@/lib/site";

const title = "Schweizer Kantone und Gemeinden im politischen Vergleich";
const description = "Alle 26 Schweizer Kantone: politische Kompasswerte, Abstimmungsresultate und Gemeindevergleiche mit BFS-Quellen und dokumentiertem Datenstand.";
export const metadata = pageMetadata(title, description, "/kantone");

export default function CantonsPage() {
  return <>
    <PageStructuredData title={title} description={description} path="/kantone" />
    <div className="knowledge-eyebrow">26 Kantone · ein gemeinsamer Vergleich</div>
    <h1>Wie stimmt die Schweiz?</h1>
    <p className="knowledge-lead">Wähle einen Kanton, um seine Abstimmungsresultate, die berechnete politische Position und die Werte seiner Gemeinden zu vergleichen.</p>
    <SnapshotNotice />
    <CantonLinks />
  </>;
}
