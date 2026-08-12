# Cultural Enrichment Radar

Interaktiver Explorer fÃ¼r amtliche Schweizer Kennzahlen. Die Anwendung zeigt nur Werte mit dokumentierter Quelle, Datenstand und Geografieebene. Fehlende Gemeindewerte werden nicht geschÃ¤tzt und nicht durch Kantonswerte ersetzt.

## Production operations

Production is managed explicitly from the private `Merkelmore/production-operations` repository. A merge does not deploy. The central gateway owns HTTPS and public ports, while this repository supplies the unprivileged application container.

The existing managed Supabase project remains the production database. Runtime and migration database access are separate protected settings and must never be committed. See the operations repository for release, backup, and recovery procedures.
## Lokale Anwendung

```powershell
npm install
npm run dev
```

Die Anwendung lÃ¤uft danach unter http://localhost:3000.

## Lokaler Datenkatalog

Der Datenkatalog verwendet PostgreSQL in Docker. Die Datenbank enthÃ¤lt aktuelle Kantone und Gemeinden, Quellen, unverÃ¤nderte Rohsnapshots, importierte Beobachtungen sowie spÃ¤ter berechnete Pro-Kopf- und Prozentkennzahlen.

### Voraussetzungen

- Node.js 24 oder neuer
- Docker Desktop mit Docker Compose

### Starten

```powershell
Copy-Item .env.example .env
docker compose up -d
npm run db:migrate
npm run db:status
```

`db:status` listet alle angewendeten und ausstehenden Migrationen. Die lokalen Daten liegen im ignorierten Ordner `postgres-data/`.

### Erster Import

```powershell
npm run data:population:db
npm run data:municipalities:db
npm run data:municipality-population:db
```

Der Import lÃ¤dt die offizielle BFS-Arbeitsmappe **T 01.02.03.04**, speichert die unverÃ¤nderte XLSX-Datei unter `data/raw/`, berechnet einen SHA-256-Hash und importiert ausschlieÃŸlich den neuesten Datenstand fÃ¼r alle 26 Kantone als `population_total`.

Der Import ist transaktional und idempotent. Jeder Lauf erhÃ¤lt eine Quelle, einen Snapshot und einen Status in der Datenbank. Ein fehlerhafter Lauf Ã¼berschreibt keinen zuvor validierten Beobachtungsstand.

### Datenstand und Quellen

| Kennzahl | Aktueller Stand | Quelle | Datenbankstatus |
| --- | --- | --- | --- |
| StÃ¤ndige WohnbevÃ¶lkerung | BFS-Stand 2024 | BFS STATPOP | Kanton- und Gemeindeimporter vorhanden |
| Alter und NationalitÃ¤t | BFS-Stand 2024 | BFS STATPOP | DB-Importer vorhanden |
| Registrierte Straftaten | BFS-PKS-Stand 2025 | BFS PKS, Tabelle `px-x-1903020100_101` | DB-Importer vorhanden; Rate pro 100'000 mit BevÃ¶lkerung 2024 abgeleitet |
| Personen im Asylverfahren | SEM-Stand 30.06.2026 | SEM Arbeitsmappe `6-10 Bestand im Asylprozess` | Kantonimporter vorhanden; Rate pro 1'000 mit BevÃ¶lkerung 2024 abgeleitet |
| Zusammengefasste Geburtenziffer | BFS-Stand 2024 | BFS-Tabelle `su-d-01.04.01.02.07` | Kantonimporter vorhanden |
| BFS-Erwerbslosenquote | BFS-Stand 2024 | BFS-Tabelle `ts-x-40.02.03.02.03` | 25 verÃ¶ffentlichte Kantonswerte; Appenzell Innerrhoden nicht verÃ¶ffentlicht |
| Politische Orientierung | Finales Wahlresultat 22.10.2023 | BFS, EidgenÃ¶ssische Wahlen 2023 | 26 kantonale ParteistÃ¤rken und abgeleiteter Score |
| Cultural Enrichment Score | Zusammengesetzter Stand | Lokale Ableitung aus PKS, SEM und BFS | 25 Werte; Appenzell Innerrhoden nicht berechenbar |

Gemeinden werden pro gewÃ¤hltem Kanton angeboten, sobald ihre aktuelle BFS-Geografie importiert ist. Eine Kennzahl wird auf Gemeindeebene nur gezeigt, wenn die entsprechende amtliche Quelle eine vollstÃ¤ndige und vergleichbare Abdeckung liefert.

## Gemeinde-Abstimmungen

Ein Klick auf einen Kanton fixiert dessen Detailkarte. Von dort Ã¶ffnen **Gemeinde-Abstimmungen** die Gemeindeansicht und **Politischer Kompass** den kantonalen Kompass. Die Gemeindeansicht zeigt die Resultate aller eidgenÃ¶ssischen Vorlagen der letzten vier Abstimmungstage auf Gemeindeebene; eine fixierte Gemeinde-Karte bietet ebenfalls den politischen Kompass mit allen Schweizer Gemeinden. Beim Ãœberfahren einer Gemeinde erscheint eine Ergebnis-Karte; ein Klick oder Enter/Leertaste pinnt sie. Sie verwendet die politischen BFS-Gemeindegeometrien und die offiziellen BFS/voteinfo-Resultate; die Kantonsansicht behÃ¤lt ihre demografischen Kennzahlen.

Die statischen Daten werden bewusst server-/buildseitig aktualisiert, weil die BFS-Abstimmungsdaten nicht als browserÃ¼bergreifend CORS-fÃ¤hige API vorausgesetzt werden kÃ¶nnen:

```bash
npm run data:votes
```

Die aktuelle Auswahl umfasst den 14.06.2026, 08.03.2026, 30.11.2025 und 28.09.2025. Resultate, die BFS noch als provisorisch kennzeichnet, werden in der OberflÃ¤che entsprechend markiert. Die 12 Auslandsgemeinden ohne rÃ¤umliche BFS-Geometrie erscheinen nicht auf der Karte.

## Politischer Kompass

`npm run data:votes` lÃ¤dt die amtlichen JSON-Ergebnisse von [BFS voteinfo](https://www.bfs.admin.ch/bfs/de/home/dienstleistungen/geostat/geodaten-statistik-bundesamt/abstimmungen.html) und erzeugt zusÃ¤tzlich `public/data/political-compass.json`. Der Snapshot enthÃ¤lt nur aktuelle rÃ¤umliche BFS-Gemeinde-IDs: historische oder fusionierte Gemeinden werden nicht auf heutige Gemeinden Ã¼bertragen. Fehlt fÃ¼r eine aktuelle Gemeinde eines der neun aktiven Resultate, wird keine Position geschÃ¤tzt oder erfunden; die fehlende ID bleibt im Snapshot dokumentiert.

FÃ¼r jede aktive Vorlage wird mit den exakten Ja-Prozenten gerechnet:

$$
\Delta(g,v) = \operatorname{clamp}_{[-3,3]}\left(\frac{Ja(g,v)-Ja(CH,v)}{\sigma_v}\right)
$$

Dabei ist $\sigma_v$ die Populations-Standardabweichung der Gemeinde-Jaanteile dieser Vorlage. Die gewichteten Summen bilden die Achsen $x$ (wirtschaftlich links $\leftrightarrow$ rechts) und $y$ (libertÃ¤r $\leftrightarrow$ autoritÃ¤r). Beide werden Ã¼ber die feste theoretische Spanne $3 \times \sum |Gewicht|$ auf $[-100,100]$ skaliert. Kantonswerte entstehen fÃ¼r jede Vorlage aus der Summe von Ja- und Nein-Stimmen ihrer aktuellen kartierten Gemeinden; sie benutzen danach dieselben Schweizer Referenzen und Gemeinde-Standardabweichungen.

Aktiv sind: Zweitliegenschaftssteuer-Reform (6780), E-ID-Gesetz (6790), Initiative fÃ¼r eine Zukunft (6810), Bargeld-Initiative (6821), SRG-Initiative (6830), Klimafonds-Initiative (6840), Individualbesteuerung (6850), Nachhaltigkeitsinitiative (6860) und Zivildienstgesetz (6870). Service citoyen (6800), Bargeld-Gegenvorschlag (6822) und Stichfrage (6823) zÃ¤hlen bewusst nicht. Alle Gewichte und die nationalen Referenzwerte stehen im generierten Snapshot sowie hinter dem Info-Knopf des Modals. Die Anzeige ist ein relatives Modell der Abstimmungsabweichungen und keine objektive Einordnung von Gemeinden, Kantonen oder Menschen.

## NÃ¼tzliche Befehle

```powershell
npm run lint
npm run build
npm run db:migrate
npm run db:status
npm run data:population:db
npm run data:nationality:db
npm run data:age:db
npm run data:crime:db
npm run data:asylum:db
npm run data:fertility:db
npm run data:unemployment:db
npm run data:election:db
npm run data:municipalities:db
npm run data:municipality-population:db
npm run data:derive
npm run data:population
npm run data:votes
npm run test:political-compass
```

Der letzte Befehl erzeugt weiterhin die bisherige statische Explorer-JSON-Datei als Demo-Cache. Der Explorer verwendet sie nicht mehr: Zur Laufzeit fragt er ausschlieÃŸlich die lokale Route `/api/catalog` und damit PostgreSQL ab.

Die Gemeindeauswahl wird aus der aktuellen BFS-Gemeindegliederung aufgebaut. Zuerst `data:municipalities:db`, danach `data:municipality-population:db` ausfÃ¼hren. Gemeinden ohne landesweit vergleichbare, importierte Kennzahl bleiben im Explorer ausdrÃ¼cklich als nicht verfÃ¼gbar markiert; es gibt keinen RÃ¼ckfall auf den Kantonswert.

Der PKS-Importer speichert drei BFS-Aggregate: Straftaten total, Straftaten gegen Leib und Leben sowie VermÃ¶gensdelikte. PKS misst registrierte Straftaten, nicht Verurteilungen. Die Kennzahl pro 100'000 Einwohner wird aus PKS 2025 und dem neuesten lokalen BevÃ¶lkerungsstand 2024 abgeleitet; beide DatenstÃ¤nde stehen in der Berechnungsdefinition.

Der Asylimporter liest die offizielle monatliche SEM-Arbeitsmappe `6-10 Bestand im Asylprozess`. Er importiert fÃ¼r jeden Kanton die Kategorie `Personen im Verfahrensprozess`; sie ist enger als der gesamte Bestand von Personen mit Status N, S oder F und darf nicht damit gleichgesetzt werden. Die Rate pro 1'000 Einwohner nutzt den neuesten lokalen BevÃ¶lkerungsstand 2024 und dokumentiert den abweichenden Stichtag ebenfalls in der Berechnungsdefinition.

Der FertilitÃ¤tsimporter lÃ¤dt die BFS-Tabelle `su-d-01.04.01.02.07` und importiert die zusammengefasste Geburtenziffer je Kanton. Sie ist ein Periodenindikator, nicht die tatsÃ¤chliche Kinderzahl einer Kohorte.

Der Erwerbslosenimporter lÃ¤dt die BFS-Tabelle `ts-x-40.02.03.02.03`. Die BFS-Erwerbslosenquote folgt der ILO-Definition und misst Erwerbslose im VerhÃ¤ltnis zu den Erwerbspersonen. Sie ist nicht mit der monatlichen SECO-Quote registrierter Arbeitsloser gleichzusetzen. FÃ¼r 2024 ist der Wert fÃ¼r Appenzell Innerrhoden in der BFS-Rohdatei unterdrÃ¼ckt und wird daher weder geschÃ¤tzt noch durch einen anderen Wert ersetzt.

Der Wahlimporter lÃ¤dt die finalen kantonalen ParteistÃ¤rken der Nationalratswahl vom 22. Oktober 2023 aus der BFS-Wahlressource. Der Score verwendet `SP`, `GPS`, `Mitte`, `GLP`, `FDP` und `SVP`:

$$
S = \frac{SVP + 0.5 \cdot FDP + 0.5 \cdot GLP - 0.5 \cdot GPS - SP}{SVP + FDP + GLP + Mitte + GPS + SP} - S_{CH}
$$

`Mitte` zÃ¤hlt nur im Nenner. $S_{CH} = 0.170624250654$ ist der aus den finalen Schweizer ParteistÃ¤rken der BFS-Wahlressource berechnete nationale Referenzscore. Damit entspricht $0$ der Schweizer Mitte dieses Wahlresultats, nicht einer rein theoretischen Gleichverteilung der sechs Parteien. Parteien ohne kantonale Liste in der finalen BFS-Datei werden explizit als $0\,\%$ gespeichert; andere Parteien fliessen nicht in den Score ein. Die Karte nutzt dafÃ¼r den festen Bereich $[-1, 1]$. Der Score beschreibt ausschliesslich dieses Wahlergebnis und weder Parteibindung noch SicherheitsgefÃ¼hl.

## Cultural Enrichment Score

Der Cultural Enrichment Score ist kein amtlicher Indikator und keine normative Bewertung eines Kantons. Er kombiniert vier verfÃ¼gbare Kennzahlen mit je $25\,\%$: registrierte Straftaten pro 100'000 Einwohner (PKS 2025), offene Asylverfahren pro 1'000 Einwohner (SEM, 30.06.2026), auslÃ¤ndische BevÃ¶lkerung (BFS, 2024) und BFS-Erwerbslosenquote (2024). Die DatenstÃ¤nde sind unterschiedlich und werden nicht als kausale Beziehung interpretiert.

Jede Komponente wird Ã¼ber alle Kantone mit vollstÃ¤ndigen Werten min-max-normalisiert. Der Score ist ihre gleich gewichtete Summe auf der Skala $[0, 100]$:

$$
CES = 25 \cdot \left(n(KriminalitÃ¤t) + n(Asylverfahren) + n(AuslÃ¤ndische\ BevÃ¶lkerung) + n(Erwerbslosenquote)\right)
$$

HÃ¶here Werte bedeuten ausschliesslich hÃ¶here normierte Werte dieser vier EingangsgrÃ¶ssen. FÃ¼r Appenzell Innerrhoden wird kein Wert geschÃ¤tzt oder ersetzt: BFS verÃ¶ffentlicht fÃ¼r 2024 keine Erwerbslosenquote, daher bleibt der Score nicht verfÃ¼gbar.

