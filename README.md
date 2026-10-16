# Gspart! Vorarlberg

Preistracker für Vorarlberg: Spritpreise aller Tankstellen, Online-Preise von Supermärkten, Drogerien und Baumarkt,
dazu Börsenstrom, Heizöl, Pellets sowie Strom- und Gastarife. Mit Preisverlauf, Karte, Merkliste, Preisalarm
(im Browser und als Push-Nachricht aufs Handy) und Warenkorb-Vergleich.

**Seite:** https://jessehaemmerle.github.io/price-tracker/ (nach dem Einrichten, siehe unten)

## Was erfasst wird

| Bereich | Quelle | Häufigkeit | Umfang |
|---|---|---|---|
| Diesel, Super 95, CNG | [E-Control Spritpreisrechner](https://www.e-control.at/spritpreisrechner) (offizielle API) | stündlich | alle ca. 107 Tankstellen in Vorarlberg |
| SPAR | Online-Shop-Suche | täglich | gesamtes Online-Sortiment (ca. 22.000) |
| BILLA | Online-Shop | täglich | gesamtes Online-Sortiment (ca. 12.000) |
| dm | Produktsuche | täglich | gesamtes Online-Sortiment (ca. 18.000) |
| BIPA | Online-Shop | täglich | gesamtes Online-Sortiment (ca. 18.500) |
| OBI | Suchseiten (schema.org) | täglich | Auswahl über ca. 50 Baumarkt-Suchbegriffe |
| Strom-Börsenpreis | [aWATTar API](https://www.awattar.at/services/api) (EPEX Spot AT) | 5× täglich | stündlich, heute und morgen |
| Heizöl | [HeizOel24](https://www.heizoel24.at/heizoelpreise) | 5× täglich | Österreich-Durchschnitt je 100 l |
| Pellets | [proPellets Austria](https://www.propellets.at/aktuelle-pelletpreise), Index PPI06 | 5× täglich (Werte monatlich) | seit 2006 |
| Strom- und Gastarife | [E-Control Tarifkalkulator](https://www.e-control.at/tarifkalkulator) | 5× täglich | alle Tarife für PLZ 6850 bei 3 Verbrauchsstufen |

**Nur verlinkt** (keine automatisch abrufbaren Preise, Bot-Schutz oder kein Online-Shop): HOFER, Lidl, PENNY, MPREIS,
Sutterlüty, Müller, MediaMarkt, Hartlauer, Expert, EP:, HORNBACH. Der Bereich „Flugblätter“ verlinkt deren Angebote.

Wichtige Grenzen:

- E-Control veröffentlicht pro Umgebung nur die **günstigere Hälfte** der Spritpreise. Teurere Tankstellen erscheinen ohne Preis.
- Händlerpreise sind **Online-Preise**. Filial- und Kundenkarten-Aktionen können abweichen.
- Bot-Schutz wird **nicht umgangen**. Die Scraper senden einen eindeutigen User-Agent, beachten die `robots.txt`,
  halten Pausen ein und weichen bei Drosselung (HTTP 429/403) aus.

## Aufbau

```
src/          React-App (Vite, TypeScript), Ansichten in src/views
shared/       Datenformat und Hilfsfunktionen für App und Scraper
scraper/      Datenabruf (Node, TypeScript): Quellen, Validierung, Verlauf, Push-Alarme
config/       alerts.json – Regeln für Push-Alarme
tests/        Unit-Tests (Vitest) und Browser-Tests (Playwright + axe)
.github/      Workflows: Daten aktualisieren, Seite veröffentlichen, Prüfen
```

Die Daten liegen im Branch **`data`** (wird automatisch angelegt). Jeder Lauf
validiert das Ergebnis, bevor er etwas speichert. Fällt eine Quelle aus oder liefert sie
deutlich weniger Produkte als beim letzten Mal, bleiben die alten Daten stehen und die Seite zeigt einen Hinweis.
Preisverläufe werden nur als Änderungspunkte gespeichert, Produkthistorien in 32 Teilen, damit die Seite pro
Produkt nur einen kleinen Teil laden muss.

## Einrichten (einmalig)

1. **Pull Request mergen.** Geplante Workflows laufen nur auf `main`.
2. **GitHub Pages aktivieren:** *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. **Erste Daten holen:** *Actions → Daten aktualisieren → Run workflow*, zuerst `fuel`, dann `energy` und `shops`
   (der Shop-Lauf dauert ca. 25 Minuten, weil dm nur langsam abgefragt werden darf).
   Danach veröffentlicht „Seite veröffentlichen“ die Seite automatisch.

Ab dann läuft alles von selbst: Sprit stündlich, Energie fünfmal täglich, Händler jede Nacht.

### Push-Alarme aufs Handy (optional)

1. App [ntfy](https://ntfy.sh/) installieren und ein Thema mit schwer zu erratendem Namen abonnieren
   (z. B. `gspart-x7k2p9`). Wer den Namen kennt, kann mitlesen.
2. *Settings → Secrets and variables → Actions → New repository secret*: `NTFY_TOPIC` = dieser Name.
   Optional: Variable `NTFY_SERVER` (eigener ntfy-Server) und Secret `NTFY_TOKEN`.
3. Regeln in [`config/alerts.json`](config/alerts.json) festlegen. Die Seite erzeugt sie unter *Merkliste → Push-Nachricht aufs Handy*
   aus deinen Merkposten mit Schwelle. Mögliche Regeln:

```json
{
  "siteUrl": "https://jessehaemmerle.github.io/price-tracker/",
  "rules": [
    { "id": "diesel", "type": "fuel", "fuel": "DIE", "below": 1.55, "districts": ["Dornbirn"] },
    { "id": "tankstelle-x", "type": "fuel", "fuel": "SUP", "below": 1.6, "stations": [1354948] },
    { "id": "kaffee", "type": "product", "store": "spar", "product": "2020003743085", "below": 9.99 },
    { "id": "strom", "type": "spot", "belowCt": 3 },
    { "id": "heizoel", "type": "heatingoil", "below": 95 }
  ]
}
```

Gemeldet wird beim ersten Unterschreiten, danach erst wieder, wenn der Preis weiter fällt oder 24 Stunden vergangen sind.

## Entwickeln

```bash
npm install
npm run scrape:fuel          # Spritpreise nach ./data holen
npm run scrape:energy        # Energie
npm run scrape -- shops --only=spar,billa   # einzelne Händler
npm run dev                  # http://localhost:5173 – liest ./data
npm test                     # Unit-Tests
npm run test:e2e             # Browser-Tests mit Testdaten aus tests/fixtures
npm run build
```

Neuer Händler: Adapter in `scraper/sources/` anlegen (Funktion `fetch()` liefert `RawProduct[]`), in
`scraper/run.ts` und `shared/stores.ts` eintragen. Validierung, Verlauf und Anzeige kommen automatisch mit.

## Datenschutz

Keine Cookies, kein Tracking. Merkliste, Warenkorb und Einstellungen bleiben im Browser. Schriften sind selbst
gehostet. Kartenkacheln kommen von [basemap.at](https://basemap.at), Produktbilder direkt von den Händlern.

## Lizenz

GPL-3.0, siehe [LICENSE](LICENSE). Kartengrundlage: basemap.at (CC BY 4.0). Spritpreise: E-Control.
