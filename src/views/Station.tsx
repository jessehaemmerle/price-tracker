import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { FUEL_LABELS, FUEL_TYPES, type FuelType } from '../../shared/types'
import { LineChart } from '../components/charts/LineChart'
import { IconExternal, IconStar } from '../components/Icons'
import { FuelPrice } from '../components/Price'
import { Empty, ErrorNote, Freshness, Loading } from '../components/States'
import { useFuelHistory, useFuelLatest, useStations } from '../lib/data'
import { decimal } from '../lib/format'
import { DAY_LABELS, openNow } from '../lib/fuel'
import { useWatchlist } from '../lib/watchlist'

export default function Station() {
  const { id } = useParams()
  const stations = useStations()
  const latest = useFuelLatest()
  const history = useFuelHistory()
  const { has, toggle } = useWatchlist()
  const station = stations.data?.stations.find((s) => String(s.id) === id)
  const prices = latest.data?.prices[String(id)] ?? {}
  const offered = FUEL_TYPES.filter((f) => f in prices)

  const series = useMemo(() => {
    const h = history.data?.stations[String(id)]
    if (!h) return []
    return FUEL_TYPES.filter((f) => f !== 'GAS' && h[f]?.length).map((f) => ({
      id: f,
      label: FUEL_LABELS[f],
      color: `var(--series-${f.toLowerCase()})`,
      points: h[f]!.map((p) => [p[0] * 1000, p[1]] as [number, number]),
    }))
  }, [history.data, id])

  const gasSeries = useMemo(() => {
    const h = history.data?.stations[String(id)]?.GAS
    return h?.length ? [{ id: 'GAS', label: 'CNG', color: 'var(--series-gas)', points: h.map((p) => [p[0] * 1000, p[1]] as [number, number]) }] : []
  }, [history.data, id])

  if (stations.loading || latest.loading) return <div className="page"><Loading /></div>
  if (stations.error) return <div className="page"><ErrorNote error={stations.error} what="Tankstellen" /></div>
  if (!station) {
    return (
      <div className="page">
        <Empty level={1} title="Diese Tankstelle gibt es nicht (mehr)." action={<Link to="/sprit">Zur Übersicht aller Tankstellen</Link>}>
          Vielleicht wurde sie geschlossen oder umbenannt.
        </Empty>
      </div>
    )
  }

  const isOpen = latest.data?.open[String(station.id)] ?? openNow(station)
  const mapsUrl = `https://www.openstreetmap.org/directions?to=${station.lat}%2C${station.lon}`

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Brotkrümel">
        <Link to="/sprit">Sprit</Link> <span aria-hidden="true">/</span> <span>{station.city}</span>
      </nav>
      <header className="view-head">
        <h1>{station.name}</h1>
        <p>
          {station.address}, {station.postalCode} {station.city}, Bezirk {station.district}
        </p>
        <p className={isOpen === false ? 'status status--muted' : 'status status--good'}>
          {isOpen === null ? 'Öffnungszeiten unbekannt' : isOpen ? 'Jetzt geöffnet' : 'Derzeit geschlossen'}
        </p>
      </header>

      <div className="station-prices">
        {offered.map((f: FuelType) => {
          const v = prices[f]
          const watched = has(`station:${station.id}:${f}`)
          return (
            <div key={f} className="station-price">
              <span className="station-price__fuel">
                <span className="board__key" style={{ background: `var(--series-${f.toLowerCase()})` }} aria-hidden="true" />
                {FUEL_LABELS[f]}
              </span>
              {typeof v === 'number' ? (
                <FuelPrice value={v} size="3.25rem" unit={f === 'GAS' ? 'kg' : 'l'} />
              ) : (
                <span className="note">Preis nicht veröffentlicht</span>
              )}
              <button
                type="button"
                className="button button--quiet"
                aria-pressed={watched}
                onClick={() => toggle({ kind: 'station', id: station.id, fuel: f, name: station.name, city: station.city, addedAt: new Date().toISOString() })}
              >
                <IconStar filled={watched} />
                {watched ? 'Gemerkt' : 'Merken'}
              </button>
            </div>
          )
        })}
      </div>
      <p>
        <Freshness iso={latest.data?.updatedAt} source="E-Control" />
      </p>
      <p className="station-actions">
        <a className="button" href={mapsUrl} target="_blank" rel="noreferrer">
          <IconExternal /> Route in OpenStreetMap
        </a>
      </p>

      <section className="section" aria-labelledby="st-history">
        <div className="section__head">
          <h2 id="st-history">Preisverlauf dieser Tankstelle</h2>
          <p>Jede Stufe ist eine Preisänderung. Lücken entstehen, wenn E-Control den Preis gerade nicht veröffentlicht.</p>
        </div>
        {history.loading ? (
          <Loading />
        ) : series.length ? (
          <LineChart series={series} title={`Preisverlauf ${station.name}`} yFormat={(v) => `${decimal(v, 3)} €`} yTickFormat={(v) => decimal(v, 2)} step xMax={Date.now()} />
        ) : (
          <p className="note">Für diese Tankstelle wurde noch kein Preis aufgezeichnet.</p>
        )}
        {gasSeries.length > 0 && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <h3>CNG (Euro pro Kilogramm)</h3>
            <LineChart series={gasSeries} title={`CNG-Preisverlauf ${station.name}`} yFormat={(v) => `${decimal(v, 3)} €`} step xMax={Date.now()} />
          </div>
        )}
      </section>

      {station.hours && (
        <section className="section" aria-labelledby="st-hours">
          <h2 id="st-hours">Öffnungszeiten</h2>
          <table className="hours">
            <caption className="visually-hidden">Öffnungszeiten von {station.name}</caption>
            <tbody>
              {Object.entries(station.hours).map(([day, spec]) => (
                <tr key={day}>
                  <th scope="row">{DAY_LABELS[day] ?? day}</th>
                  <td className="tabular">{spec === '24h' ? 'durchgehend' : spec?.replace('-', '–')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
