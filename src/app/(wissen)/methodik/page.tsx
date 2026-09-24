import Link from "next/link";
import { SnapshotNotice } from "@/components/discovery-content";
import { PageStructuredData } from "@/components/structured-data";
import { compassSnapshot, formatDate, formatNumber } from "@/lib/discovery";
import { pageMetadata } from "@/lib/site";

const title = "Methodik, Datenstand und Quellen des politischen Kompasses";
const description = "So entsteht der Schweizer Politik-Kompass: BFS-Abstimmungen, offengelegte Gewichte, Schweizer Referenzwerte, Normalisierung und Grenzen der Aussagekraft.";
export const metadata = pageMetadata(title, description, "/methodik");

export default function MethodologyPage() {
  return <>
    <PageStructuredData title={title} description={description} path="/methodik" />
    <div className="knowledge-eyebrow">Nachvollziehbar statt vermeintlich objektiv</div>
    <h1>Methodik und Quellen</h1>
    <p className="knowledge-lead">Die Abstimmungsergebnisse stammen aus amtlichen Quellen. Ihre Einordnung auf zwei politischen Achsen ist eine eigene Modellentscheidung des Projekts. Hier kannst du beides auseinanderhalten und prüfen.</p>
    <SnapshotNotice />
    <section><h2>Wie wird eine Kompassposition berechnet?</h2>
      <ol className="knowledge-steps">
        <li><strong>Abweichung vom Schweizer Ergebnis.</strong> Für jede Gemeinde und Vorlage wird der exakte Ja-Anteil mit dem nationalen Ja-Anteil verglichen.</li>
        <li><strong>Vergleichbare Streuung.</strong> Die Differenz wird durch die Populations-Standardabweichung der Ja-Anteile der aktuellen räumlichen BFS-Gemeinden geteilt. Das Ergebnis wird auf −3 bis +3 begrenzt.</li>
        <li><strong>Gewichtung je Achse.</strong> Die standardisierten Abweichungen werden mit den unten offengelegten wirtschaftlichen beziehungsweise gesellschaftlichen Gewichten multipliziert und summiert.</li>
        <li><strong>Feste Modellskala.</strong> Jede Summe wird durch das Dreifache der Summe der absoluten Gewichte ihrer Achse geteilt und mit 100 multipliziert. Beide Achsen liegen damit zwischen −100 und +100.</li>
      </ol>
      <p className="knowledge-formula">Δ(Gemeinde, Vorlage) = begrenze((Ja-Anteil Gemeinde − Ja-Anteil Schweiz) / Standardabweichung, −3, +3)</p>
      <p className="knowledge-formula">Achsenwert = 100 × Σ(Gewicht × Δ) / (3 × Σ|Gewicht|)</p>
      <p>Für einen Kanton werden je Vorlage die Ja- und Nein-Stimmen seiner aktuellen kartierten Gemeinden addiert. Es wird kein ungewichteter Durchschnitt der Gemeindeprozente gebildet. Danach gelten dieselben nationalen Referenzwerte, Standardabweichungen und Achsengewichte.</p>
    </section>
    <section><h2>Verwendete Vorlagen und Gewichte</h2><p>Ein positives wirtschaftliches Gewicht verschiebt einen überdurchschnittlichen Ja-Anteil nach rechts, ein negatives nach links. Ein positives gesellschaftliches Gewicht verschiebt ihn zur autoritären, ein negatives zur libertären Seite. Diese Zuordnungen sind diskutierbare Annahmen des Projekts.</p>
      <div className="knowledge-table-scroll" role="region" aria-label="Vorlagen und Modellgewichte" tabIndex={0}><table><caption>{compassSnapshot.methodology.weights.length} aktive Vorlagen · Links führen zu den BFS-Quelldaten</caption><thead><tr><th scope="col">Vorlage</th><th scope="col">Wirtschaft</th><th scope="col">Gesellschaft</th><th scope="col">Ja-Anteil CH</th></tr></thead><tbody>{compassSnapshot.methodology.weights.map((weight) => <tr key={weight.id}><th scope="row"><a href={weight.sourceUrl}>{weight.label}</a><small><time dateTime={weight.date}>{formatDate(weight.date)}</time> · BFS-ID {weight.id}</small></th><td>{formatNumber(weight.economicWeight)}</td><td>{formatNumber(weight.authorityWeight)}</td><td>{formatNumber(weight.nationalYesPercentage)} %</td></tr>)}</tbody></table></div>
      <h3>Nicht separat gewichtet</h3><ul>{Object.entries(compassSnapshot.methodology.excludedProposals).map(([id, reason]) => <li key={id}>{reason} (BFS-ID {id}).</li>)}</ul>
    </section>
    <section><h2>Welche Gemeinden sind abgedeckt?</h2>
      <p>Der gespeicherte Geografiestand enthält {formatNumber(compassSnapshot.coverage.currentMunicipalities)} räumliche BFS-Gemeinden. Für {formatNumber(compassSnapshot.municipalities.length)} davon liegt eine Kompassposition vor; {compassSnapshot.coverage.missingMunicipalityIds.length} fehlen wegen unvollständiger Resultate.</p>
      <p>Es werden nur die im Snapshot verwendeten aktuellen Gemeinde-IDs berücksichtigt. Historische oder fusionierte Gemeinden werden nicht stillschweigend umgerechnet. Auslandsgemeinden ohne räumliche Geometrie sind nicht enthalten. Fehlt eines der aktiven Ergebnisse, wird keine Position erfunden oder durch den Kantonswert ersetzt.</p>
    </section>
    <section><h2>Was kann der Kompass nicht aussagen?</h2><ul>
      <li>Abstimmungsverhalten ist nicht gleich Parteizugehörigkeit. Eine Auswahl anderer Vorlagen oder Gewichte kann andere Positionen ergeben.</li>
      <li>Die Werte beschreiben Gebiete, keine einzelnen Menschen und keine einheitliche Meinung aller Einwohnerinnen und Einwohner.</li>
      <li>Der Nullpunkt ist eine nationale Abstimmungsreferenz, keine objektive politische Mitte.</li>
      <li>Die interaktive Darstellung spreizt die Punktwolke je Achse anhand des 99. Perzentils und glättet Extremwerte. Diese Anzeige verändert nicht die veröffentlichten Rohkoordinaten, aber die sichtbaren Abstände.</li>
      <li>Die Daten werden als geprüfte Snapshots veröffentlicht und sind kein Live-Ticker. Provisorische Quellen bleiben als solche gekennzeichnet.</li>
    </ul></section>
    <section><h2>Abstimmungskompass und Wahl-Score sind verschiedene Modelle</h2><p>Die Kennzahl «Politische Orientierung» in der demografischen Karte basiert auf kantonalen Parteistärken der Nationalratswahl 2023. Der hier beschriebene zweidimensionale Kompass basiert auf Volksabstimmungen. Die beiden Werte dürfen nicht gleichgesetzt werden.</p><p>Andere Kartenkennzahlen haben eigene Datenstände und Definitionen. Diese zeigt der Quellen-Dialog der <Link href="/">interaktiven Karte</Link>. Eigene abgeleitete Kennzahlen sind keine amtlichen Indikatoren und belegen keine kausalen Zusammenhänge.</p></section>
    <section><h2>Quelldaten und Reproduzierbarkeit</h2><ul>
      <li><a href="https://www.bfs.admin.ch/bfs/de/home/dienstleistungen/geostat/geodaten-statistik-bundesamt/abstimmungen.html">BFS: geografische Daten zu eidgenössischen Abstimmungen</a></li>
      {compassSnapshot.methodology.weights.filter((weight, index, all) => all.findIndex((entry) => entry.sourceUrl === weight.sourceUrl) === index).map((weight) => <li key={weight.sourceUrl}><a href={weight.sourceUrl}>BFS voteinfo · {formatDate(weight.date)} · JSON</a></li>)}
      <li><a href="/data/political-compass.json">Kompass-Snapshot mit Positionen, Gewichten, Referenzen und Standardabweichungen</a></li>
      <li><a href="/data/municipal-votes.json">Gespeicherte Gemeinde-Abstimmungsresultate</a></li>
      <li><a href="https://github.com/Merkelmore/demografie-schweiz/blob/master/scripts/lib/political-compass.mjs">Öffentlicher Berechnungscode</a> und <a href="https://github.com/Merkelmore/demografie-schweiz/blob/master/scripts/political-compass.test.mjs">Berechnungstests</a></li>
    </ul><p>Bei einer Weiterverwendung bitte sowohl die ursprünglichen BFS-Daten als auch diese Methodik und den angezeigten Datenstand nennen. Nutzungsbedingungen der Originalquellen gelten weiterhin. <Link href="/ueber-das-projekt">Fehler melden oder eine Modellannahme diskutieren.</Link></p></section>
  </>;
}
