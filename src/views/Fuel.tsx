import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FUEL_LABELS, FUEL_TYPES, type FuelType } from '../../shared/types'
import { BarChart } from '../components/charts/BarChart'
import { LineChart } from '../components/charts/LineChart'
import { IconList, IconLocate, IconMap, IconStar } from '../components/Icons'
import { FuelPrice } from '../components/Price'
import { ErrorNote, Freshness, Loading } from '../components/States'
import { useFuelHistory, useFuelLatest, useStations } from '../lib/data'
import { decimal, viennaDay, viennaHour } from '../lib/format'
import { distanceKm, hourlyPattern, openNow } from '../lib/fuel'
import { useIsDark } from '../lib/theme'
import { useWatchlist } from '../lib/watchlist'

const FuelMap = lazy(() => import('./FuelMap'))

const DISTRICTS = ['Bludenz', 'Bregenz', 'Dornbirn', 'Feldkirch']
const RANGES = [
  { id: '7', label: '7 Tage', days: 7 },
  { id: '30', label: '30 Tage', days: 30 },
  { id: '90', label: '90 Tage', days: 90 },
  { id: 'alle', label: 'Alles', days: 10_000 },
]

function WatchStationButton({ id, fuel, name, city }: { id: number; fuel: FuelType; name: string; city: string }) {
  const { has, toggle } = useWatchlist()
  const watched = has(`station:${id}:${fuel}`)
  return (
    <button
      type="button"
      className="icon-button"
      aria-pressed={watched}
      aria-label={watched ? `${name} nicht mehr merken` : `${FUEL_LABELS[fuel]} bei ${name} merken`}
      title={watched ? 'Auf der Merkliste' : 'Merken'}
      onClick={() => toggle({ kind: 'station', id, fuel, name, city, addedAt: new Date().toISOString() })}
    >
      <IconStar filled={watched} />
    </button>
  )
}

export default function Fuel() {
  const [params, setParams] = useSearchParams()
  const fuel = (FUEL_TYPES.includes(params.get('sorte') as FuelType) ? params.get('sorte') : 'DIE') as FuelType
  const district = params.get('bezirk') ?? ''
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'liste' | 'karte'>('liste')
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null)
  const [geoError, setGeoError] = useState('')
  const [range, setRange] = useState('7')
  const [showAll, setShowAll] = useState(false)
  const [metric, setMetric] = useState<'avg' | 'min'>('avg')
  const dark = useIsDark()

  const stations = useStations()
  const latest = useFuelLatest()
  const history = useFuelHistory()
  const unit = fuel === 'GAS' ? 'kg' : 'l'

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => {
    if (!stations.data || !latest.data) return { priced: [], unpriced: [] }
    const q = query.trim().toLowerCase()
    const list = stations.data.stations
      .filter((s) => latest.data!.prices[String(s.id)] && fuel in latest.data!.prices[String(s.id)])
      .filter((s) => !district || s.district === district)
      .filter((s) => !q || `${s.name} ${s.city} ${s.address} ${s.postalCode}`.toLowerCase().includes(q))
      .map((s) => {
        const v = latest.data!.prices[String(s.id)][fuel]
        return {
          station: s,
          price: typeof v === 'number' ? v : null,
          open: latest.data!.open[String(s.id)] ?? openNow(s),
          distance: here ? distanceKm(here, s) : null,
        }
      })
      .filter((r) => !onlyOpen || r.open !== false)
    const priced = list.filter((r) => r.price !== null)
    const unpriced = list.filter((r) => r.price === null)
    const byDistance = (a: (typeof list)[number], b: (typeof list)[number]) => (a.distance ?? 0) - (b.distance ?? 0)
    priced.sort(here ? byDistance : (a, b) => a.price! - b.price!)
    unpriced.sort(here ? byDistance : (a, b) => a.station.city.localeCompare(b.station.city, 'de'))
    return { priced, unpriced }
  }, [stations.data, latest.data, fuel, district, query, onlyOpen, here])

  const cheapestPrice = rows.priced.length ? Math.min(...rows.priced.map((r) => r.price!)) : null

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoError('Dein Browser unterstützt keine Standortabfrage.')
      return
    }
    setGeoError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setGeoError('Standort nicht verfügbar. Erlaube die Standortabfrage oder filtere nach Ort.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const chartSeries = useMemo(() => {
    const stats = history.data?.stats
    if (!stats) return []
    const fuels: FuelType[] = fuel === 'GAS' ? ['GAS'] : ['DIE', 'SUP']
    const idx = metric === 'avg' ? 1 : 2
    return fuels.map((f) => ({
      id: f,
      label: FUEL_LABELS[f],
      color: `var(--series-${f.toLowerCase()})`,
      points: (stats[f] ?? []).map((p) => [p[0] * 1000, p[idx]] as [number, number]),
    }))
  }, [history.data, fuel, metric])

  const rangeDays = RANGES.find((r) => r.id === range)!.days
  const xMax = Date.now()
  const xMin = Math.max(xMax - rangeDays * 86_400_000, Math.min(...chartSeries.flatMap((s) => s.points.map((p) => p[0])), xMax))

  const pattern = useMemo(() => {
    const stats = history.data?.stats[fuel]
    if (!stats) return null
    const recent = stats.filter((p) => p[0] * 1000 >= Date.now() - 30 * 86_400_000).map((p) => [p[0] * 1000, p[1]] as [number, number])
    return hourlyPattern(recent, viennaHour, viennaDay)
  }, [history.data, fuel])

  const patternBars = useMemo(() => {
    if (!pattern || pattern.days < 2) return []
    const vals = pattern.deviations.filter((v): v is number => v !== null)
    const lowest = [...vals].sort((a, b) => a - b).slice(0, 3)
    return pattern.deviations.flatMap((v, h) =>
      v === null
        ? []
        : [
            {
              key: h,
              value: Math.round(v * 10) / 10,
              tick: h % 3 === 0 ? String(h) : '',
              label: `${h}–${h + 1} Uhr`,
              highlight: lowest.includes(v),
            },
          ],
    )
  }, [pattern])

  const cheapestHours = patternBars.filter((b) => b.highlight).map((b) => b.key).sort((a, b) => a - b)

  if (stations.error || latest.error) {
    return (
      <div className="page">
        <ErrorNote error={(stations.error ?? latest.error)!} what="Spritpreise" />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="view-head">
        <h1>Spritpreise in Vorarlberg</h1>
        <p>
          Alle Tankstellen im Land, sortiert nach Preis. E-Control veröffentlicht nur die günstigere Hälfte der Preise einer Umgebung,
          teurere Tankstellen stehen deshalb ohne Preis am Ende der Liste.
        </p>
        <Freshness iso={latest.data?.updatedAt} source="E-Control Spritpreisrechner" />
      </header>

      <div className="toolbar fuel-toolbar">
        <div className="segmented" role="group" aria-label="Sorte">
          {FUEL_TYPES.map((f) => (
            <button key={f} type="button" aria-pressed={fuel === f} onClick={() => setParam('sorte', f === 'DIE' ? '' : f)}>
              <span className="key" style={{ background: `var(--series-${f.toLowerCase()})` }} aria-hidden="true" />
              {FUEL_LABELS[f]}
            </button>
          ))}
        </div>
        <label className="field">
          Bezirk
          <select className="select" value={district} onChange={(e) => setParam('bezirk', e.target.value)}>
            <option value="">Ganz Vorarlberg</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Ort oder Name
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="z. B. Hohenems" />
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Nur geöffnete
        </label>
        <button type="button" className="button" onClick={here ? () => setHere(null) : locate} aria-pressed={Boolean(here)}>
          <IconLocate />
          {here ? 'Nach Preis sortieren' : 'In meiner Nähe'}
        </button>
        <div className="segmented fuel-view-toggle" role="group" aria-label="Ansicht">
          <button type="button" aria-pressed={view === 'liste'} onClick={() => setView('liste')}>
            <IconList width={18} height={18} /> Liste
          </button>
          <button type="button" aria-pressed={view === 'karte'} onClick={() => setView('karte')}>
            <IconMap width={18} height={18} /> Karte
          </button>
        </div>
      </div>
      {geoError && <p className="note" role="alert">{geoError}</p>}

      {stations.loading || latest.loading ? (
        <Loading />
      ) : (
        <div className={`fuel-layout fuel-layout--${view}`}>
          <div className="fuel-list">
            <p className="note" aria-live="polite">
              {rows.priced.length} mit Preis, {rows.unpriced.length} ohne veröffentlichten Preis
            </p>
            <ol className="station-list">
              {(showAll ? rows.priced : rows.priced.slice(0, 25)).map((r, i) => (
                <li key={r.station.id} className="station-row">
                  {!here && <span className="station-row__rank" aria-hidden="true">{i + 1}</span>}
                  <Link to={`/sprit/${r.station.id}`} className="station-row__main">
                    <span className="station-row__name">{r.station.name}</span>
                    <span className="station-row__addr">
                      {r.station.address}, {r.station.city}
                      {r.distance !== null && ` – ${decimal(r.distance, 1)} km`}
                    </span>
                    {r.open === false && <span className="station-row__closed">derzeit geschlossen</span>}
                  </Link>
                  <span className="station-row__price">
                    <FuelPrice value={r.price!} size="1.9rem" />
                    {cheapestPrice !== null && r.price! > cheapestPrice && (
                      <span className="station-row__diff">+{decimal((r.price! - cheapestPrice) * 100, 1)} ct</span>
                    )}
                  </span>
                  <WatchStationButton id={r.station.id} fuel={fuel} name={r.station.name} city={r.station.city} />
                </li>
              ))}
            </ol>
            {!showAll && rows.priced.length > 25 && (
              <button type="button" className="button more-button" onClick={() => setShowAll(true)}>
                Alle {rows.priced.length} mit Preis anzeigen
              </button>
            )}
            {rows.unpriced.length > 0 && (
              <details className="unpriced">
                <summary>{rows.unpriced.length} Tankstellen ohne veröffentlichten Preis</summary>
                <ul className="station-list station-list--plain">
                  {rows.unpriced.map((r) => (
                    <li key={r.station.id} className="station-row">
                      <Link to={`/sprit/${r.station.id}`} className="station-row__main">
                        <span className="station-row__name">{r.station.name}</span>
                        <span className="station-row__addr">
                          {r.station.address}, {r.station.city}
                          {r.distance !== null && ` – ${decimal(r.distance, 1)} km`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="fuel-mapcol">
            <Suspense fallback={<Loading label="Karte lädt …" />}>
              <FuelMap key={dark ? 'dark' : 'light'} dark={dark} items={[...rows.priced, ...rows.unpriced]} unit={unit} />
            </Suspense>
          </div>
        </div>
      )}

      <section className="section" aria-labelledby="trend-title">
        <div className="section__head">
          <div>
            <h2 id="trend-title">Preisverlauf in Vorarlberg</h2>
            <p>Stündlich gemessen, über alle Tankstellen mit veröffentlichtem Preis.</p>
          </div>
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Kennzahl">
              <button type="button" aria-pressed={metric === 'avg'} onClick={() => setMetric('avg')}>
                Durchschnitt
              </button>
              <button type="button" aria-pressed={metric === 'min'} onClick={() => setMetric('min')}>
                Günstigster
              </button>
            </div>
            <div className="segmented" role="group" aria-label="Zeitraum">
              {RANGES.map((r) => (
                <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {history.loading ? (
          <Loading />
        ) : chartSeries.some((s) => s.points.length > 1) ? (
          <LineChart
            series={chartSeries}
            title={`${metric === 'avg' ? 'Durchschnittlicher' : 'Günstigster'} Preis in Euro pro ${unit === 'kg' ? 'Kilogramm' : 'Liter'}`}
            yFormat={(v) => `${decimal(v, 3)} €`}
            yTickFormat={(v) => decimal(v, 2)}
            xMin={xMin}
            xMax={xMax}
            step
          />
        ) : (
          <p className="note">Der Verlauf füllt sich mit jeder stündlichen Messung. Schau in ein paar Stunden wieder vorbei.</p>
        )}
      </section>

      <section className="section" aria-labelledby="when-title">
        <div className="section__head">
          <div>
            <h2 id="when-title">Wann tanken?</h2>
            <p>
              In Österreich dürfen Tankstellen ihre Preise nur einmal täglich um 12 Uhr erhöhen, senken dürfen sie jederzeit. Die Säulen
              zeigen, wie weit {FUEL_LABELS[fuel]} je Uhrzeit üblicherweise vom Tagesdurchschnitt abweicht.
            </p>
          </div>
        </div>
        {patternBars.length ? (
          <>
            <p className="when-summary">
              Am günstigsten war {FUEL_LABELS[fuel]} zuletzt meist zwischen{' '}
              <strong>{cheapestHours.map((h) => `${h} und ${h + 1} Uhr`).join(', ')}</strong> (Auswertung über {pattern?.days} Tage).
            </p>
            <BarChart
              bars={patternBars}
              title={`Abweichung vom Tagesdurchschnitt in Cent je Uhrzeit, ${FUEL_LABELS[fuel]}`}
              yFormat={(v) => `${v > 0 ? '+' : ''}${decimal(v, 1)} ct`}
            />
          </>
        ) : (
          <p className="note">Für diese Auswertung braucht es mindestens zwei vollständig gemessene Tage.</p>
        )}
      </section>
    </div>
  )
}
