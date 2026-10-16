import { useMemo } from 'react'
import { Link } from 'react-router'
import { FUEL_LABELS, type FuelLatestFile, type FuelStationsFile, type FuelType } from '../../shared/types'
import { Sparkline } from '../components/charts/Sparkline'
import { ProductRow } from '../components/ProductRow'
import { Delta, FuelPrice } from '../components/Price'
import { Ridge } from '../components/Ridge'
import { ErrorNote, Freshness, Loading } from '../components/States'
import {
  toProduct,
  useFuelHistory,
  useFuelLatest,
  useHeatingOil,
  useHighlights,
  usePellets,
  useSpot,
  useStations,
  useTariffs,
} from '../lib/data'
import { decimal, euroValue, hourLabel, viennaDay } from '../lib/format'
import { useStoredState } from '../lib/storage'

export function cheapest(fuel: FuelType, stations: FuelStationsFile | null, latest: FuelLatestFile | null) {
  if (!stations || !latest) return null
  let best: { price: number; station: FuelStationsFile['stations'][number] } | null = null
  let count = 0
  for (const s of stations.stations) {
    const v = latest.prices[String(s.id)]?.[fuel]
    if (typeof v !== 'number') continue
    count++
    if (!best || v < best.price) best = { price: v, station: s }
  }
  return best ? { ...best, count } : null
}

function FuelBoard({ fuel }: { fuel: FuelType }) {
  const stations = useStations()
  const latest = useFuelLatest()
  const history = useFuelHistory()
  const best = cheapest(fuel, stations.data, latest.data)
  const dayAgo = useMemo(() => {
    const stats = history.data?.stats[fuel]
    if (!stats?.length) return null
    const target = stats[stats.length - 1][0] - 86_400
    const p = [...stats].reverse().find((x) => x[0] <= target)
    return p ? p[2] : null
  }, [history.data, fuel])

  return (
    <article className="board" aria-labelledby={`board-${fuel}`}>
      <h2 id={`board-${fuel}`} className="board__fuel">
        <span className="board__key" style={{ background: `var(--series-${fuel.toLowerCase()})` }} aria-hidden="true" />
        {FUEL_LABELS[fuel]}
      </h2>
      {stations.loading || latest.loading ? (
        <Loading />
      ) : best ? (
        <>
          <Link to={`/sprit/${best.station.id}`} className="board__price">
            <FuelPrice value={best.price} size="clamp(3.25rem, 9vw, 4.75rem)" unit={fuel === 'GAS' ? 'kg' : 'l'} />
          </Link>
          <p className="board__where">
            <strong>{best.station.name}</strong>
            <br />
            {best.station.address}, {best.station.city}
          </p>
          <p className="board__meta">
            {dayAgo !== null && <Delta diff={best.price - dayAgo} format={(v) => `${decimal(v * 100, 1)} ct`} label="zu gestern" />}
            <span>günstigste von {best.count} Tankstellen mit Preis</span>
          </p>
        </>
      ) : (
        <p className="note">Derzeit kein veröffentlichter Preis.</p>
      )}
    </article>
  )
}

function EnergyStrip() {
  const spot = useSpot()
  const oil = useHeatingOil()
  const pellets = usePellets()
  const tariffs = useTariffs()

  const today = useMemo(() => {
    if (!spot.data) return null
    const day = viennaDay(Date.now())
    const hours = spot.data.hours.filter(([t]) => viennaDay(t * 1000) === day)
    if (!hours.length) return null
    const now = Date.now() / 1000
    const current = hours.find(([t]) => t <= now && now < t + 3600)
    const min = hours.reduce((a, b) => (b[1] < a[1] ? b : a))
    return { current, min, values: hours.map((h) => h[1]) }
  }, [spot.data])

  const oilLast = oil.data?.series[oil.data.series.length - 1]
  const oilMonthAgo = oil.data?.series.find(([d]) => oilLast && d >= oilLast[0] - 30)
  const pelletsLast = pellets.data?.series[pellets.data.series.length - 1]
  const pelletsYearAgo = pellets.data?.series[pellets.data.series.length - 13]
  const cheapestPower = tariffs.data?.power.find((s) => s.consumption === 3500)?.tariffs[0]

  return (
    <div className="energy-strip">
      <Link to="/energie" className="energy-tile">
        <span className="energy-tile__label">Strom an der Börse jetzt</span>
        {today?.current ? (
          <span className="energy-tile__value">
            <span className="price">{decimal(today.current[1], 1)}</span> <span className="energy-tile__unit">ct/kWh</span>
          </span>
        ) : (
          <span className="note">keine Daten</span>
        )}
        {today && (
          <>
            <span className="note">
              Am günstigsten heute um {hourLabel(today.min[0] * 1000)} Uhr: {decimal(today.min[1], 1)} ct
            </span>
            <Sparkline values={today.values} color="var(--series-die)" />
          </>
        )}
      </Link>
      <Link to="/energie" className="energy-tile">
        <span className="energy-tile__label">Heizöl, 100 Liter</span>
        {oilLast ? (
          <span className="energy-tile__value">
            <span className="price">{euroValue(oilLast[1])}</span>
          </span>
        ) : (
          <span className="note">keine Daten</span>
        )}
        {oilLast && oilMonthAgo && oilMonthAgo !== oilLast && (
          <Delta diff={oilLast[1] - oilMonthAgo[1]} format={euroValue} label="in 30 Tagen" />
        )}
        {oil.data && <Sparkline values={oil.data.series.slice(-60).map((p) => p[1])} />}
      </Link>
      <Link to="/energie" className="energy-tile">
        <span className="energy-tile__label">Pelletpreisindex</span>
        {pelletsLast ? (
          <span className="energy-tile__value">
            <span className="price">{decimal(pelletsLast[1], 1)}</span> <span className="energy-tile__unit">Punkte</span>
          </span>
        ) : (
          <span className="note">keine Daten</span>
        )}
        {pelletsLast && pelletsYearAgo && (
          <Delta diff={pelletsLast[1] - pelletsYearAgo[1]} format={(v) => decimal(v, 1)} label="zum Vorjahresmonat" />
        )}
        {pellets.data && <Sparkline values={pellets.data.series.slice(-36).map((p) => p[1])} />}
      </Link>
      <Link to="/energie" className="energy-tile">
        <span className="energy-tile__label">Günstigster Stromtarif, 3.500 kWh</span>
        {cheapestPower ? (
          <>
            <span className="energy-tile__value">
              <span className="price">{euroValue(cheapestPower.annualTotal)}</span> <span className="energy-tile__unit">pro Jahr</span>
            </span>
            <span className="note">
              {cheapestPower.brand}, {cheapestPower.product}
            </span>
          </>
        ) : (
          <span className="note">keine Daten</span>
        )}
      </Link>
    </div>
  )
}

function ShopHighlights() {
  const hl = useHighlights()
  const lists = useMemo(() => {
    if (!hl.data) return null
    const conv = (x: { store: keyof typeof hl.data.prefixes; item: Parameters<typeof toProduct>[1] }) => {
      const pre = hl.data!.prefixes[x.store] ?? { url: '', image: '' }
      return toProduct({ store: x.store, urlPrefix: pre.url, imagePrefix: pre.image }, x.item)
    }
    return { drops: hl.data.drops.slice(0, 6).map(conv), deals: hl.data.deals.slice(0, 6).map(conv) }
  }, [hl.data])

  if (hl.loading) return <Loading />
  if (hl.error) return <ErrorNote error={hl.error} what="Händlerpreise" />
  if (!lists) return null
  return (
    <div className="columns columns--2">
      <div>
        <div className="section__head">
          <h3>Seit gestern billiger</h3>
          <Link to="/einkaufen/aktionen">Alle Preissenkungen</Link>
        </div>
        {lists.drops.length ? (
          <ul className="product-list">
            {lists.drops.map((p) => (
              <ProductRow key={`${p.store}:${p.id}`} product={p} />
            ))}
          </ul>
        ) : (
          <p className="note">Noch keine Preissenkungen erfasst. Sie erscheinen ab dem zweiten Tag der Aufzeichnung.</p>
        )}
      </div>
      <div>
        <div className="section__head">
          <h3>Höchste Rabatte</h3>
          <Link to="/einkaufen/aktionen">Alle Aktionen</Link>
        </div>
        <ul className="product-list">
          {lists.deals.map((p) => (
            <ProductRow key={`${p.store}:${p.id}`} product={p} showDiscount />
          ))}
        </ul>
      </div>
    </div>
  )
}

export function Overview() {
  const history = useFuelHistory()
  const latest = useFuelLatest()
  const [ridgeFuel, setRidgeFuel] = useStoredState<'DIE' | 'SUP'>('ridgeFuel', 'DIE')

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="page hero__inner">
          <div className="hero__intro">
            <h1 id="hero-title">Heute günstig tanken in Vorarlberg</h1>
            <p>
              Die niedrigsten veröffentlichten Preise aller Tankstellen im Land.{' '}
              <Freshness iso={latest.data?.updatedAt} source="E-Control" />
            </p>
          </div>
          {latest.error ? (
            <ErrorNote error={latest.error} what="Spritpreise" />
          ) : (
            <div className="boards">
              <FuelBoard fuel="DIE" />
              <FuelBoard fuel="SUP" />
              <FuelBoard fuel="GAS" />
            </div>
          )}
        </div>
        <div className="hero__ridge">
          <Ridge
            label={FUEL_LABELS[ridgeFuel]}
            color={`var(--series-${ridgeFuel.toLowerCase()})`}
            points={history.data?.stats[ridgeFuel] ?? []}
          />
          <div className="hero__ridge-caption">
            <div className="page hero__ridge-caption-inner">
              <div className="segmented segmented--small" role="group" aria-label="Sorte im Preisgrat">
                {(['DIE', 'SUP'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={ridgeFuel === f} onClick={() => setRidgeFuel(f)}>
                    {FUEL_LABELS[f]}
                  </button>
                ))}
              </div>
              <p className="note">Durchschnitt und günstigster veröffentlichter Preis, stündlich, letzte 7 Tage.</p>
              <Link to="/sprit">Alle Tankstellen und Verläufe</Link>
            </div>
          </div>
        </div>
      </section>

      <div className="page">
        <section className="section" aria-labelledby="energy-title">
          <div className="section__head">
            <h2 id="energy-title">Energie</h2>
            <Link to="/energie">Strom, Heizöl, Pellets und Tarife</Link>
          </div>
          <EnergyStrip />
        </section>

        <section className="section" aria-labelledby="shops-title">
          <div className="section__head">
            <h2 id="shops-title">Bei den Händlern</h2>
            <Link to="/einkaufen">Preise suchen und vergleichen</Link>
          </div>
          <ShopHighlights />
        </section>
      </div>
    </>
  )
}
