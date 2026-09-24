import Link from "next/link";
import { CompassLauncher } from "@/components/compass-launcher";
import { SnapshotNotice } from "@/components/discovery-content";
import { PageStructuredData, StructuredData } from "@/components/structured-data";
import { cantonPages, compassSnapshot, formatCoordinate, votingDates } from "@/lib/discovery";
import { absoluteUrl, pageMetadata } from "@/lib/site";

const title = "Politischer Kompass der Schweizer Kantone und Gemeinden";
const description = "Vergleiche die politische Orientierung Schweizer Kantone und Gemeinden anhand eidgenössischer Abstimmungen. Mit Kompasswerten, BFS-Daten und offener Methodik.";
export const metadata = pageMetadata(title, description, "/politischer-kompass");

export default function CompassPage() {
  return <>
    <PageStructuredData title={title} description={description} path="/politischer-kompass" />
    <StructuredData data={{
      "@context": "https://schema.org", "@type": "Dataset", "@id": absoluteUrl("/politischer-kompass#datensatz"),
      name: title, description, url: absoluteUrl("/politischer-kompass"), inLanguage: "de-CH",
      temporalCoverage: `${votingDates[0]}/${votingDates.at(-1)}`, spatialCoverage: { "@type": "Place", name: "Schweiz" },
      measurementTechnique: "Gewichtete, standardisierte Abweichungen der Ja-Anteile vom Schweizer Ergebnis; projektspezifisches Modell, kein amtlicher Indikator.",
      variableMeasured: ["Wirtschaftliche Achse (x), −100 bis +100", "Gesellschaftliche Achse (y), −100 bis +100"],
      isBasedOn: compassSnapshot.sources.map((url) => ({ "@type": "CreativeWork", name: "BFS voteinfo: eidgenössische Abstimmungen", url })),
      distribution: { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: absoluteUrl("/data/political-compass.json") },
    }} />
    <div className="knowledge-eyebrow">Abstimmungsmuster sichtbar machen</div>
    <h1>Politischer Kompass Schweiz</h1>
    <p className="knowledge-lead">Wo liegen Kantone und Gemeinden im politischen Vergleich? Der Kompass berechnet zwei Achsen aus {compassSnapshot.methodology.weights.length} eidgenössischen Abstimmungsvorlagen und den amtlichen Ja-Anteilen des BFS.</p>
    <CompassLauncher />
    <SnapshotNotice />
    <section><h2>Was bedeuten die Achsen?</h2>
      <p>Die horizontale Achse reicht von wirtschaftlich links (negative x-Werte) bis wirtschaftlich rechts (positive x-Werte). Die vertikale Achse reicht von libertär (negative y-Werte) bis autoritär (positive y-Werte). Der Nullpunkt steht für das Schweizer Referenzergebnis der ausgewählten Vorlagen.</p>
      <p>Das ist eine Interpretation von Abstimmungsmustern. Die Auswahl und Gewichtung der Vorlagen prägen das Ergebnis. Der Kompass ist kein persönlicher Polit-Test, keine Wahlprognose und keine amtliche politische Klassifikation.</p>
    </section>
    <section id="datensatz"><h2>Alle Kantone im Vergleich</h2>
      <p>Diese Tabelle zeigt die unveränderten Modellwerte. Die interaktive Grafik spreizt die Punkte für die Lesbarkeit; ihre sichtbaren Abstände sind deshalb nicht die Rohwerte der Tabelle.</p>
      <div className="knowledge-table-scroll" role="region" aria-label="Kompasswerte aller Kantone" tabIndex={0}><table><caption>Modellskala −100 bis +100; basierend auf dem oben genannten Datenstand</caption><thead><tr><th scope="col">Kanton</th><th scope="col">Wirtschaft (x)</th><th scope="col">Gesellschaft (y)</th><th scope="col">Gemeinden mit Position</th></tr></thead><tbody>{cantonPages.map((canton) => <tr key={canton.code}><th scope="row"><Link href={`/kantone/${canton.slug}`} prefetch={false}>{canton.name.de}</Link></th><td>{canton.point ? formatCoordinate(canton.point.x) : "Nicht verfügbar"}</td><td>{canton.point ? formatCoordinate(canton.point.y) : "Nicht verfügbar"}</td><td>{canton.municipalities.length}</td></tr>)}</tbody></table></div>
    </section>
    <section><h2>Gemeinden vergleichen und Ergebnisse prüfen</h2><p>Auf jeder <Link href="/kantone">Kantonsseite</Link> findest du die Gemeinde-Koordinaten sowie die zugrunde liegenden Abstimmungen. Die <Link href="/methodik">Methodik</Link> erklärt Gewichte, Normalisierung und fehlende Werte.</p><p><a href="/data/political-compass.json">Vollständigen Kompass-Datensatz als JSON öffnen</a></p><CompassLauncher mode="municipalities" /></section>
  </>;
}
