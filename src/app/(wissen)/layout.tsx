import Link from "next/link";
import "../knowledge.css";
import "../political-compass.css";

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <div className="knowledge-shell" lang="de-CH">
    <a className="knowledge-skip" href="#inhalt">Zum Inhalt</a>
    <header className="knowledge-header">
      <Link className="knowledge-brand" href="/">Politik Kompass <span>Schweiz</span></Link>
      <nav aria-label="Hauptnavigation"><Link href="/">Karte</Link><Link href="/politischer-kompass">Kompass</Link><Link href="/kantone">Kantone</Link><Link href="/methodik">Methodik</Link></nav>
    </header>
    <main id="inhalt" className="knowledge-main">{children}</main>
    <footer className="knowledge-footer"><span>Politik Kompass Schweiz · Unabhängiges Datenprojekt</span><nav aria-label="Weiterführende Informationen"><Link href="/ueber-das-projekt">Über das Projekt</Link><Link href="/methodik">Quellen & Methodik</Link><a href="https://github.com/Merkelmore/demografie-schweiz">GitHub</a></nav></footer>
  </div>;
}
