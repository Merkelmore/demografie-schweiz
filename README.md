# Cultural Enrichment Radar

Interaktiver Explorer für amtliche Schweizer Kennzahlen. Die Anwendung zeigt nur Werte mit dokumentierter Quelle, Datenstand und Geografieebene. Fehlende Gemeindewerte werden nicht geschätzt und nicht durch Kantonswerte ersetzt.

## GG deployment command

Production installs the shared `gg-deploy` command at `/usr/local/bin/gg-deploy`. It reads the standard `gg-deploy.env` manifest, updates a Git checkout as its owning user, and rebuilds the declared Docker Compose service. It only accepts project directories below `/srv` and uses `git merge --ff-only`, so it does not overwrite local recovery changes.

To register a future GG project, place its checkout under `/srv`, add `gg-deploy.env` with `BRANCH`, `COMPOSE_FILE`, and `ENV_FILE`, and invoke `gg-deploy /srv/<project-directory>` from its deployment workflow. Domain routing remains explicit in that project's Compose/Caddy configuration.

## Production deployment (Supabase + Hetzner)

The production setup is built for one Next.js container, a managed Supabase PostgreSQL database, and Caddy as the only public reverse proxy. The application and the database are never published directly: only Caddy listens on ports `80` and `443`.

Before the first deployment, the following must be available:

- A domain or subdomain, for example `radar.example.ch`.
- A Hetzner server with a public IPv4 address.
- An empty Supabase project with a database password set.
- Two Supabase connection strings kept outside this repository: the **direct** connection for the one-off restore and the **session pooler** connection for application runtime. Both require TLS.

Do not place either connection string in a ticket, chat, commit, or screenshot. Enter them only in a local terminal or the server's restricted environment file.

### 1. Verify and export the local catalog

Confirm that all local schema migrations are applied and that the local Docker database contains the catalog to publish:

```powershell
npm run db:status
docker compose exec postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file=/tmp/catalog.dump'
docker compose cp postgres:/tmp/catalog.dump .\catalog.dump
```

`catalog.dump` contains both the audited catalog data and its migration history. Treat it as confidential operational data and delete the copy after the restore has been verified.

Transfer the dump to the server through a secure administrative channel, for example:

```powershell
scp .\catalog.dump DEPLOY_USER@SERVER_IP:/home/DEPLOY_USER/
```

### 2. Prepare Supabase

In Supabase, copy the direct PostgreSQL connection string for the restore and the session-pooler connection string for runtime. The runtime URL normally uses port `5432`; append `sslmode=require&uselibpqcompat=true`. This keeps the connection encrypted while using PostgreSQL's standard `require` behavior for the shared pooler's certificate chain. Do not use a pooler URL for `pg_restore` unless Supabase explicitly documents it as supported for restores.

Run the restore once from a trusted machine with Docker. Set `SUPABASE_DIRECT_DATABASE_URL` directly in that terminal, then execute:

```powershell
docker run --rm -v "${PWD}:/backup" --env SUPABASE_DIRECT_DATABASE_URL postgres:17-alpine sh -lc 'pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$SUPABASE_DIRECT_DATABASE_URL" /backup/catalog.dump'
```

Afterwards, confirm in Supabase that the `schema_migration`, `geo_unit`, `metric_definition`, and observation tables exist. The production migration service checks migration checksums on every deployment and applies only new migrations; do not edit a migration that has already been restored or applied.

### 3. Prepare the Hetzner server

Install a current Docker Engine and Docker Compose plugin using Docker's official instructions for the server operating system. Confirm both commands work for the deployment user:

```bash
docker --version
docker compose version
```

At both the Hetzner Cloud Firewall and the host firewall, allow only SSH administration plus HTTP and HTTPS. Keep the database port `5432` and application port `3000` closed to the internet.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Clone the repository on the server and create a production-only environment file. The runtime database URL must be the Supabase **session-pooler** URL, not the direct restore URL.

```bash
git clone REPOSITORY_URL cultural-enrichment-radar
cd cultural-enrichment-radar
cp .env.example .env.production
chmod 600 .env.production
nano .env.production
```

Set these values in `.env.production`:

```dotenv
DATABASE_URL=postgresql://...pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true
PG_POOL_MAX=5
NODE_ENV=production
PORT=3000
DOMAIN=radar.example.ch
```

### 4. Configure DNS and launch

At the DNS provider, create an `A` record from the final hostname to the Hetzner server's public IPv4 address. Do this before starting Caddy. Caddy obtains and renews the TLS certificate automatically only when the hostname resolves publicly to this server and ports `80` and `443` are reachable.

On the server, start the stack:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

The `migrate` container must finish with exit code `0`. The `app` container then becomes healthy only after a real catalog query succeeds; Caddy starts only after that health check. Inspect a failed launch without printing the environment file:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=100 migrate app caddy
```

Once DNS has propagated, verify automatic HTTP-to-HTTPS redirection and the live catalog endpoint:

```bash
curl -I http://radar.example.ch
curl -I https://radar.example.ch
curl -fsS https://radar.example.ch/api/catalog/map?metric=population_total
```

The first request should redirect to HTTPS, the HTTPS response should have a valid certificate, and the API request should return JSON. Caddy persists certificate material in Docker volumes, so normal container restarts do not cause certificate reissuance.

### Automatic deployments

The repository includes a GitHub Actions workflow that deploys every push to `master`. Configure `DEPLOY_USER` plus either `DEPLOY_SSH_KEY` (recommended) or `DEPLOY_PASSWORD` as repository secrets. The workflow already knows this server's address and finds the existing production checkout automatically. The deployment account needs write access to that checkout and permission to run Docker Compose. The workflow fetches and fast-forwards rather than using `git reset --hard`, so unrelated local Caddy recovery edits are not overwritten.

## Lokale Anwendung

```powershell
npm install
npm run dev
```

Die Anwendung läuft danach unter http://localhost:3000.

## Lokaler Datenkatalog

Der Datenkatalog verwendet PostgreSQL in Docker. Die Datenbank enthält aktuelle Kantone und Gemeinden, Quellen, unveränderte Rohsnapshots, importierte Beobachtungen sowie später berechnete Pro-Kopf- und Prozentkennzahlen.

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

Der Import lädt die offizielle BFS-Arbeitsmappe **T 01.02.03.04**, speichert die unveränderte XLSX-Datei unter `data/raw/`, berechnet einen SHA-256-Hash und importiert ausschließlich den neuesten Datenstand für alle 26 Kantone als `population_total`.

Der Import ist transaktional und idempotent. Jeder Lauf erhält eine Quelle, einen Snapshot und einen Status in der Datenbank. Ein fehlerhafter Lauf überschreibt keinen zuvor validierten Beobachtungsstand.

### Datenstand und Quellen

| Kennzahl | Aktueller Stand | Quelle | Datenbankstatus |
| --- | --- | --- | --- |
| Ständige Wohnbevölkerung | BFS-Stand 2024 | BFS STATPOP | Kanton- und Gemeindeimporter vorhanden |
| Alter und Nationalität | BFS-Stand 2024 | BFS STATPOP | DB-Importer vorhanden |
| Registrierte Straftaten | BFS-PKS-Stand 2025 | BFS PKS, Tabelle `px-x-1903020100_101` | DB-Importer vorhanden; Rate pro 100'000 mit Bevölkerung 2024 abgeleitet |
| Personen im Asylverfahren | SEM-Stand 30.06.2026 | SEM Arbeitsmappe `6-10 Bestand im Asylprozess` | Kantonimporter vorhanden; Rate pro 1'000 mit Bevölkerung 2024 abgeleitet |
| Zusammengefasste Geburtenziffer | BFS-Stand 2024 | BFS-Tabelle `su-d-01.04.01.02.07` | Kantonimporter vorhanden |
| BFS-Erwerbslosenquote | BFS-Stand 2024 | BFS-Tabelle `ts-x-40.02.03.02.03` | 25 veröffentlichte Kantonswerte; Appenzell Innerrhoden nicht veröffentlicht |
| Politische Orientierung | Finales Wahlresultat 22.10.2023 | BFS, Eidgenössische Wahlen 2023 | 26 kantonale Parteistärken und abgeleiteter Score |
| Cultural Enrichment Score | Zusammengesetzter Stand | Lokale Ableitung aus PKS, SEM und BFS | 25 Werte; Appenzell Innerrhoden nicht berechenbar |

Gemeinden werden pro gewähltem Kanton angeboten, sobald ihre aktuelle BFS-Geografie importiert ist. Eine Kennzahl wird auf Gemeindeebene nur gezeigt, wenn die entsprechende amtliche Quelle eine vollständige und vergleichbare Abdeckung liefert.

## Gemeinde-Abstimmungen

Die eigenständige Ansicht **Gemeinde-Abstimmungen** zeigt die Resultate aller eidgenössischen Vorlagen der letzten drei Abstimmungstage auf Gemeindeebene. Sie verwendet die politischen BFS-Gemeindegeometrien und die offiziellen BFS/voteinfo-Resultate; die Kantonsansicht behält ihre demografischen Kennzahlen.

Die statischen Daten werden bewusst server-/buildseitig aktualisiert, weil die BFS-Abstimmungsdaten nicht als browserübergreifend CORS-fähige API vorausgesetzt werden können:

```bash
npm run data:votes
```

Die aktuelle Auswahl umfasst den 14.06.2026, 08.03.2026 und 30.11.2025. Resultate, die BFS noch als provisorisch kennzeichnet, werden in der Oberfläche entsprechend markiert. Die 12 Auslandsgemeinden ohne räumliche BFS-Geometrie erscheinen nicht auf der Karte.

## Nützliche Befehle

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
```

Der letzte Befehl erzeugt weiterhin die bisherige statische Explorer-JSON-Datei als Demo-Cache. Der Explorer verwendet sie nicht mehr: Zur Laufzeit fragt er ausschließlich die lokale Route `/api/catalog` und damit PostgreSQL ab.

Die Gemeindeauswahl wird aus der aktuellen BFS-Gemeindegliederung aufgebaut. Zuerst `data:municipalities:db`, danach `data:municipality-population:db` ausführen. Gemeinden ohne landesweit vergleichbare, importierte Kennzahl bleiben im Explorer ausdrücklich als nicht verfügbar markiert; es gibt keinen Rückfall auf den Kantonswert.

Der PKS-Importer speichert drei BFS-Aggregate: Straftaten total, Straftaten gegen Leib und Leben sowie Vermögensdelikte. PKS misst registrierte Straftaten, nicht Verurteilungen. Die Kennzahl pro 100'000 Einwohner wird aus PKS 2025 und dem neuesten lokalen Bevölkerungsstand 2024 abgeleitet; beide Datenstände stehen in der Berechnungsdefinition.

Der Asylimporter liest die offizielle monatliche SEM-Arbeitsmappe `6-10 Bestand im Asylprozess`. Er importiert für jeden Kanton die Kategorie `Personen im Verfahrensprozess`; sie ist enger als der gesamte Bestand von Personen mit Status N, S oder F und darf nicht damit gleichgesetzt werden. Die Rate pro 1'000 Einwohner nutzt den neuesten lokalen Bevölkerungsstand 2024 und dokumentiert den abweichenden Stichtag ebenfalls in der Berechnungsdefinition.

Der Fertilitätsimporter lädt die BFS-Tabelle `su-d-01.04.01.02.07` und importiert die zusammengefasste Geburtenziffer je Kanton. Sie ist ein Periodenindikator, nicht die tatsächliche Kinderzahl einer Kohorte.

Der Erwerbslosenimporter lädt die BFS-Tabelle `ts-x-40.02.03.02.03`. Die BFS-Erwerbslosenquote folgt der ILO-Definition und misst Erwerbslose im Verhältnis zu den Erwerbspersonen. Sie ist nicht mit der monatlichen SECO-Quote registrierter Arbeitsloser gleichzusetzen. Für 2024 ist der Wert für Appenzell Innerrhoden in der BFS-Rohdatei unterdrückt und wird daher weder geschätzt noch durch einen anderen Wert ersetzt.

Der Wahlimporter lädt die finalen kantonalen Parteistärken der Nationalratswahl vom 22. Oktober 2023 aus der BFS-Wahlressource. Der Score verwendet `SP`, `GPS`, `Mitte`, `GLP`, `FDP` und `SVP`:

$$
S = \frac{SVP + 0.5 \cdot FDP + 0.5 \cdot GLP - 0.5 \cdot GPS - SP}{SVP + FDP + GLP + Mitte + GPS + SP} - S_{CH}
$$

`Mitte` zählt nur im Nenner. $S_{CH} = 0.170624250654$ ist der aus den finalen Schweizer Parteistärken der BFS-Wahlressource berechnete nationale Referenzscore. Damit entspricht $0$ der Schweizer Mitte dieses Wahlresultats, nicht einer rein theoretischen Gleichverteilung der sechs Parteien. Parteien ohne kantonale Liste in der finalen BFS-Datei werden explizit als $0\,\%$ gespeichert; andere Parteien fliessen nicht in den Score ein. Die Karte nutzt dafür den festen Bereich $[-1, 1]$. Der Score beschreibt ausschliesslich dieses Wahlergebnis und weder Parteibindung noch Sicherheitsgefühl.

## Cultural Enrichment Score

Der Cultural Enrichment Score ist kein amtlicher Indikator und keine normative Bewertung eines Kantons. Er kombiniert vier verfügbare Kennzahlen mit je $25\,\%$: registrierte Straftaten pro 100'000 Einwohner (PKS 2025), offene Asylverfahren pro 1'000 Einwohner (SEM, 30.06.2026), ausländische Bevölkerung (BFS, 2024) und BFS-Erwerbslosenquote (2024). Die Datenstände sind unterschiedlich und werden nicht als kausale Beziehung interpretiert.

Jede Komponente wird über alle Kantone mit vollständigen Werten min-max-normalisiert. Der Score ist ihre gleich gewichtete Summe auf der Skala $[0, 100]$:

$$
CES = 25 \cdot \left(n(Kriminalität) + n(Asylverfahren) + n(Ausländische\ Bevölkerung) + n(Erwerbslosenquote)\right)
$$

Höhere Werte bedeuten ausschliesslich höhere normierte Werte dieser vier Eingangsgrössen. Für Appenzell Innerrhoden wird kein Wert geschätzt oder ersetzt: BFS veröffentlicht für 2024 keine Erwerbslosenquote, daher bleibt der Score nicht verfügbar.
