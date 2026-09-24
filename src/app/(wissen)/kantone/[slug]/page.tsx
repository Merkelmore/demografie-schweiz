import Link from "next/link";
import { notFound } from "next/navigation";
import { CompassLauncher } from "@/components/compass-launcher";
import { SnapshotNotice } from "@/components/discovery-content";
import { PageStructuredData } from "@/components/structured-data";
import { cantonPages, cantonVoteResults, formatCoordinate, formatDate, formatNumber, getCantonPage } from "@/lib/discovery";
import { pageMetadata } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return cantonPages.map(({ slug }) => ({ slug })); }

function details(slug: string) {
  const canton = getCantonPage(slug);
  if (!canton) notFound();
  const title = `${canton.name.de}: politischer Kompass und Abstimmungen`;
  const description = `Politische Kompasswerte für ${canton.name.de} und ${canton.municipalities.length} Gemeinden mit Position. Abstimmungsvergleich, BFS-Quellen und Methodik transparent erklärt.`;
  return { canton, title, description };
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const { title, description } = details(slug);
  return pageMetadata(title, description, `/kantone/${slug}`);
}

export default async function CantonPage({ params }: Props) {
  const { slug } = await params;
  const { canton, title, description } = details(slug);
  const results = cantonVoteResults(canton.code);
  return <>
    <PageStructuredData title={title} description={description} path={`/kantone/${slug}`} parents={[{ name: "Kantone", path: "/kantone" }]} />
    <nav className="knowledge-breadcrumb" aria-label="Brotkrümelnavigation"><Link href="/kantone">Alle Kantone</Link><span aria-hidden="true"> / </span><span>{canton.name.de}</span></nav>
    <div className="knowledge-eyebrow">Kanton {canton.code}</div>
    <h1>{canton.name.de}: politischer Kompass und Abstimmungen</h1>
    <p className="knowledge-lead">Vergleiche das Abstimmungsmuster von {canton.name.de} mit dem Schweizer Referenzergebnis und entdecke die Positionen von {canton.municipalities.length} Gemeinden im Kanton.</p>
    <SnapshotNotice />
    <section><h2>Die Kompassposition von {canton.name.de}</h2>
      {canton.point ? <><dl className="knowledge-stats"><div><dt>Wirtschaftliche Achse (x)</dt><dd>{formatCoordinate(canton.point.x)}</dd></div><div><dt>Gesellschaftliche Achse (y)</dt><dd>{formatCoordinate(canton.point.y)}</dd></div><div><dt>Gemeinden mit Position</dt><dd>{canton.municipalities.length}</dd></div></dl>
        <p>Der wirtschaftliche Modellwert liegt {canton.point.x < 0 ? "links" : canton.point.x > 0 ? "rechts" : "auf"} {canton.point.x === 0 ? "dem" : "vom"} Schweizer Referenzpunkt.
          Der gesellschaftliche Modellwert liegt {canton.point.y < 0 ? "auf der libertären" : canton.point.y > 0 ? "auf der autoritären" : "auf keiner"} Seite des Referenzpunkts.
          Beide Achsen reichen von −100 bis +100; kleine Abweichungen sollten entsprechend vorsichtig gelesen werden.</p></> : <p>Für diesen Kanton ist im gespeicherten Snapshot keine vollständige Kompassposition verfügbar.</p>}
      <p>Die Position ergibt sich aus gewichteten Abstimmungsresultaten der kartierten Gemeinden. Sie beschreibt weder einzelne Einwohnerinnen und Einwohner noch eine feste politische Identität. <Link href="/methodik">So wird der Kompass berechnet.</Link></p>
      <CompassLauncher />
    </section>
    <section><h2>Welche Abstimmungen fliessen ein?</h2><p>Die kantonalen Ja-Anteile werden aus den Ja- und Nein-Stimmen der hier abgebildeten Gemeinden berechnet. Auslandsgemeinden sind nicht enthalten. Deshalb können sie vom amtlichen Gesamtergebnis des Kantons abweichen. Der CH-Wert ist das nationale BFS-Referenzergebnis.</p>
      <div className="knowledge-table-scroll" role="region" aria-label={`Abstimmungen im Kanton ${canton.name.de}`} tabIndex={0}><table><caption>Ja-Anteile in Prozent · Quellen direkt bei jeder Vorlage</caption><thead><tr><th scope="col">Vorlage und Datum</th><th scope="col">{canton.code}</th><th scope="col">Schweiz</th></tr></thead><tbody>{results.map((result) => <tr key={result.id}><th scope="row"><a href={result.sourceUrl}>{result.label}</a><small><time dateTime={result.date}>{formatDate(result.date)}</time>{result.provisional ? " · Snapshot provisorisch" : ""}</small></th><td>{result.yesPercentage === null ? "Nicht verfügbar" : `${formatNumber(result.yesPercentage)} %`}</td><td>{formatNumber(result.nationalYesPercentage)} %</td></tr>)}</tbody></table></div>
    </section>
    <section id="gemeinden"><h2>Politischer Kompass der Gemeinden in {canton.name.de}</h2><p>Die Tabelle enthält die vorhandenen Modellwerte des gespeicherten Snapshots. Historische Gemeinden werden nicht auf heutige Gemeinden übertragen. Fehlende Werte werden nicht geschätzt.</p>
      <div className="knowledge-table-scroll" role="region" aria-label={`Gemeindewerte im Kanton ${canton.name.de}`} tabIndex={0}><table><caption>Gemeinde-Koordinaten · BFS-Gemeindenummer als eindeutige Kennung</caption><thead><tr><th scope="col">Gemeinde</th><th scope="col">BFS-Nr.</th><th scope="col">Wirtschaft (x)</th><th scope="col">Gesellschaft (y)</th></tr></thead><tbody>{canton.municipalities.map((municipality) => <tr id={`gemeinde-${municipality.id}`} key={municipality.id}><th scope="row"><a href={`#gemeinde-${municipality.id}`}>{municipality.name}</a></th><td>{municipality.id}</td><td>{formatCoordinate(municipality.x)}</td><td>{formatCoordinate(municipality.y)}</td></tr>)}</tbody></table></div>
      <CompassLauncher mode="municipalities" />
    </section>
    <section><h2>Quellen und Einordnung</h2><p>Primärquelle: BFS voteinfo. Die Kompasswerte sind eine eigene Ableitung. <Link href="/methodik">Alle Gewichte, Quellen und Einschränkungen</Link> sind öffentlich dokumentiert. Im <a href="/data/political-compass.json">JSON-Datensatz</a> stehen die verwendeten Werte und Schweizer Referenzen.</p><p><Link href="/">Zur interaktiven Schweizer Karte</Link> · <Link href="/kantone">Andere Kantone vergleichen</Link></p></section>
  </>;
}
