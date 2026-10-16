import { LINKED_STORES, TRACKED_STORES } from '../../shared/stores'
import { useMeta, useShopIndex } from '../lib/data'
import { dateTime } from '../lib/format'

const SOURCE_LABELS: Record<string, string> = {
  fuel: 'Spritpreise (E-Control)',
  spot: 'Strom-Börsenpreis (aWATTar)',
  heatingoil: 'Heizöl (HeizOel24)',
  pellets: 'Pellets (proPellets Austria)',
  tariffs: 'Strom- und Gastarife (E-Control)',
  ...Object.fromEntries(TRACKED_STORES.map((s) => [s.id, s.name])),
}

export default function About() {
  const meta = useMeta()
  const index = useShopIndex()
  return (
    <div className="page prose">
      <header className="view-head">
        <h1>Datenquellen und Grenzen</h1>
        <p>Woher die Preise kommen, wie oft sie aktualisiert werden und was du beachten solltest.</p>
      </header>

      <section className="section">
        <h2>Stand der Daten</h2>
        {meta.data ? (
          <table className="status-table">
            <caption className="visually-hidden">Stand jeder Datenquelle</caption>
            <thead>
              <tr>
                <th scope="col">Quelle</th>
                <th scope="col">Letzte erfolgreiche Aktualisierung</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(meta.data.sources)
                .filter(([id]) => id in SOURCE_LABELS)
                .map(([id, s]) => (
                <tr key={id}>
                  <th scope="row">{SOURCE_LABELS[id] ?? id}</th>
                  <td className="tabular">{s.updatedAt ? dateTime(s.updatedAt) : '–'}</td>
                  <td>{s.ok ? 'in Ordnung' : `Fehler: ${s.message ?? 'unbekannt'}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="note">Noch keine Statusdaten.</p>
        )}
      </section>

      <section className="section">
        <h2>Sprit</h2>
        <p>
          Die Preise stammen aus dem offiziellen Spritpreisrechner der E-Control und werden stündlich abgefragt. Tankstellen müssen Preisänderungen
          dort melden. Die E-Control veröffentlicht je Abfrage nur die günstigere Hälfte der Tankstellen einer Umgebung. Teurere Tankstellen
          erscheinen deshalb ohne Preis. Seit 2011 dürfen Tankstellen in Österreich ihre Preise nur einmal täglich um 12 Uhr erhöhen,
          Senkungen sind jederzeit erlaubt.
        </p>
      </section>

      <section className="section">
        <h2>Händler</h2>
        <p>
          Die Online-Preise werden täglich aus den öffentlichen Produktsuchen der Online-Shops gelesen. Im Geschäft können Preise und Aktionen
          abweichen, etwa bei Filial- oder Kundenkarten-Aktionen.
        </p>
        <ul>
          {TRACKED_STORES.map((s) => {
            const info = index.data?.stores.find((x) => x.id === s.id)
            return (
              <li key={s.id}>
                <strong>{s.name}</strong>: {s.coverage === 'voll' ? 'gesamtes Online-Sortiment' : 'Auswahl über Sortiments-Suchbegriffe'}
                {info ? `, derzeit ${info.count.toLocaleString('de-AT')} Produkte` : ''}
              </li>
            )
          })}
        </ul>
        <p>
          Ohne automatisch abrufbare Preise, nur verlinkt: {LINKED_STORES.filter((s) => s.name !== 'Alle Flugblätter').map((s) => s.name).join(', ')}. Diese
          Händler blockieren automatische Abfragen oder bieten keinen durchsuchbaren Online-Shop. Die Abfragen laufen mit einem eindeutigen
          Kennzeichen, beachten die robots.txt der Händler und halten Pausen zwischen den Anfragen ein.
        </p>
      </section>

      <section className="section">
        <h2>Energie</h2>
        <ul>
          <li>
            <strong>Strom-Börsenpreis:</strong> Day-Ahead-Preise der EPEX Spot für Österreich über die öffentliche aWATTar-API, netto.
          </li>
          <li>
            <strong>Heizöl:</strong> Österreich-Durchschnitt für 100 Liter Heizöl extra leicht von HeizOel24. Ein eigener Vorarlberg-Wert wird dort
            nicht ausgewiesen.
          </li>
          <li>
            <strong>Pellets:</strong> monatlicher Pelletpreisindex PPI06 von proPellets Austria (lose Pellets, 6 t Bestellmenge).
          </li>
          <li>
            <strong>Tarife:</strong> E-Control Tarifkalkulator für die Postleitzahl 6850. Ganz Vorarlberg liegt im Netz der Vorarlberger
            Energienetze, die Netzkosten sind landesweit gleich.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Datenschutz</h2>
        <p>
          Die Seite setzt keine Cookies und hat kein Tracking. Merkliste, Warenkorb und Einstellungen liegen nur im Speicher deines Browsers. Die
          Schriften werden von dieser Seite selbst geladen. Kartenkacheln kommen von basemap.at (Stadt Wien im Auftrag der Länder), Produktbilder direkt von den
          Servern der Händler. Dabei wird deine IP-Adresse an diese Anbieter übertragen. Deinen Standort fragt die Seite nur, wenn du „In meiner
          Nähe“ wählst, und er verlässt deinen Browser nicht.
        </p>
      </section>

      <section className="section">
        <h2>Haftung und Lizenz</h2>
        <p>
          Alle Angaben ohne Gewähr. Der Quellcode steht unter der GNU General Public License 3.0 auf{' '}
          <a href="https://github.com/jessehaemmerle/price-tracker">GitHub</a>.
        </p>
      </section>
    </div>
  )
}
