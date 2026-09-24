import Link from "next/link";
import { PageStructuredData } from "@/components/structured-data";
import { pageMetadata } from "@/lib/site";

const title = "Über das Projekt und Kontakt";
const description = "Politik Kompass Schweiz ist ein unabhängiges Projekt mit öffentlichen Quellen und einsehbarem Code. Hinweise zu Verantwortung, Datenkorrekturen und Unterstützung.";
export const metadata = pageMetadata(title, description, "/ueber-das-projekt");

export default function AboutPage() {
  return <>
    <PageStructuredData title={title} description={description} path="/ueber-das-projekt" />
    <div className="knowledge-eyebrow">Ein unabhängiges Datenprojekt</div>
    <h1>Über Politik Kompass Schweiz</h1>
    <p className="knowledge-lead">Das Projekt macht Schweizer Abstimmungsresultate und regionale Kennzahlen gemeinsam erkundbar. Ziel ist, Vergleiche nachvollziehbar zu machen und die verwendeten Quellen direkt zugänglich zu halten.</p>
    <section><h2>Wer steht dahinter?</h2><p>Das Projekt wird über das GitHub-Konto <a href="https://github.com/Merkelmore">Merkelmore</a> gepflegt. Der <a href="https://github.com/Merkelmore/demografie-schweiz">Quellcode und die Änderungshistorie</a> sind öffentlich einsehbar. «Cultural Enrichment Radar» ist die frühere Projektbezeichnung im Repository.</p><p>Politik Kompass Schweiz ist kein Angebot des Bundesamts für Statistik und wird durch die Nutzung amtlicher Daten nicht amtlich bestätigt. Die Kompassmethodik und ihre Gewichtungen sind Entscheidungen des Projekts.</p></section>
    <section><h2>Daten und Modell getrennt betrachten</h2><p>Wir unterscheiden zwischen übernommenen amtlichen Ergebnissen und eigenen Berechnungen. Datenstände, fehlende Werte und provisorische Ergebnisse werden angegeben. Wie die Kompasswerte entstehen und welche Grenzen sie haben, steht unter <Link href="/methodik">Methodik und Quellen</Link>.</p></section>
    <section><h2>Fehler melden oder Fragen stellen</h2><p>Über die <a href="https://github.com/Merkelmore/demografie-schweiz/issues">öffentlichen GitHub-Issues</a> kannst du Datenfehler, technische Probleme und Fragen zur Methodik melden. Nenne möglichst die betroffene Seite, die Gemeinde oder den Kanton, die Kennzahl und den Datenstand. Hinweise mit einem Link zur Originalquelle lassen sich leichter prüfen.</p></section>
    <section><h2>Das Projekt unterstützen</h2><p>Du kannst mit Quellenhinweisen, Fehlerberichten oder Verbesserungen am Code helfen. Für finanzielle Unterstützung ist <a href="https://github.com/sponsors/Merkelmore?metadata_campaign=politik-kompass">GitHub Sponsors</a> verlinkt; Zahlungen sind möglich, sobald das Empfängerprofil bei GitHub freigeschaltet ist.</p></section>
    <p><Link href="/">Zur Karte</Link> · <Link href="/kantone">Kantone und Gemeinden entdecken</Link></p>
  </>;
}
