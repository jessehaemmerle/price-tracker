import { useMemo, useState } from 'react'
import type { TariffSet } from '../../shared/types'
import { dayToDate } from '../../shared/types'
import { BarChart } from '../components/charts/BarChart'
import { LineChart } from '../components/charts/LineChart'
import { IconExternal } from '../components/Icons'
import { ErrorNote, Freshness, Loading } from '../components/States'
import { useHeatingOil, usePellets, useSpot, useTariffs } from '../lib/data'
import { decimal, euroValue, hourLabel, longDate, monthLabel, viennaDay, viennaHour, weekdayHour } from '../lib/format'

function Spot() {
  const spot = useSpot()
  const view = useMemo(() => {
    if (!spot.data) return null
    const now = Date.now() / 1000
    const today = viennaDay(Date.now())
    const tomorrow = viennaDay(Date.now() + 86_400_000)
    const hours = spot.data.hours.filter(([t]) => {
      const d = viennaDay(t * 1000)
      return d === today || d === tomorrow
    })
    if (!hours.length) return null
    // Günstigstes zusammenhängendes 3-Stunden-Fenster ab der aktuellen Stunde
    const future = hours.filter(([t]) => t + 3600 > now)
    let window: { start: number; avg: number } | null = null
    for (let i = 0; i + 2 < future.length; i++) {
      if (future[i + 2][0] - future[i][0] !== 7200) continue
      const avg = (future[i][1] + future[i + 1][1] + future[i + 2][1]) / 3
      if (!window || avg < window.avg) window = { start: future[i][0], avg }
    }
    const inWindow = (t: number) => window !== null && t >= window.start && t < window.start + 3 * 3600
    const todays = hours.filter(([t]) => viennaDay(t * 1000) === today).map((h) => h[1])
    const divider = hours.findIndex(([t]) => viennaDay(t * 1000) === tomorrow)
    const current = hours.find(([t]) => t <= now && now < t + 3600)
    return {
      bars: hours.map(([t, v]) => {
        const h = viennaHour(t * 1000)
        return {
          key: t,
          value: v,
          tick: h % 6 === 0 ? `${h}` : '',
          label: `${weekdayHour(t * 1000)}–${hourLabel((t + 3600) * 1000)} Uhr`,
          highlight: inWindow(t),
          current: current?.[0] === t,
        }
      }),
      window,
      current,
      stats: todays.length
        ? { min: Math.min(...todays), max: Math.max(...todays), avg: todays.reduce((a, b) => a + b, 0) / todays.length }
        : null,
      divider: divider > 0 ? { index: divider, label: 'morgen' } : undefined,
    }
  }, [spot.data])

  return (
    <section className="section" aria-labelledby="spot-title">
      <div className="section__head">
        <div>
          <h2 id="spot-title">Strom-Börsenpreis</h2>
          <p>
            Day-Ahead-Preis der Strombörse für Österreich je Stunde, netto in Cent pro kWh. Relevant für dynamische Stromtarife. Netzkosten,
            Abgaben, Steuern und der Aufschlag des Lieferanten kommen dazu.
          </p>
        </div>
        <Freshness iso={spot.data?.updatedAt} source="aWATTar / EPEX Spot" />
      </div>
      {spot.loading ? (
        <Loading />
      ) : spot.error ? (
        <ErrorNote error={spot.error} what="Börsenpreise" />
      ) : view ? (
        <>
          <div className="stats-row">
            {view.current && (
              <div className="stat">
                <span className="stat__label">Jetzt</span>
                <span className="stat__value price">{decimal(view.current[1], 2)} ct</span>
              </div>
            )}
            {view.stats && (
              <>
                <div className="stat">
                  <span className="stat__label">Heute Tiefstwert</span>
                  <span className="stat__value price">{decimal(view.stats.min, 2)} ct</span>
                </div>
                <div className="stat">
                  <span className="stat__label">Heute Höchstwert</span>
                  <span className="stat__value price">{decimal(view.stats.max, 2)} ct</span>
                </div>
                <div className="stat">
                  <span className="stat__label">Heute Durchschnitt</span>
                  <span className="stat__value price">{decimal(view.stats.avg, 2)} ct</span>
                </div>
              </>
            )}
          </div>
          {view.window && (
            <p className="when-summary">
              Günstigstes 3-Stunden-Fenster: <strong>{weekdayHour(view.window.start * 1000)} bis {hourLabel((view.window.start + 3 * 3600) * 1000)} Uhr</strong>, im
              Schnitt {decimal(view.window.avg, 2)} ct/kWh. Gut für Waschmaschine, Geschirrspüler oder das E-Auto.
            </p>
          )}
          <BarChart bars={view.bars} title="Strom-Börsenpreis je Stunde in Cent pro kWh" yFormat={(v) => `${decimal(v, 1)} ct`} divider={view.divider} />
        </>
      ) : (
        <p className="note">Für heute liegen noch keine Börsenpreise vor.</p>
      )}
    </section>
  )
}

const DAY_RANGES = [
  { id: '90', label: '90 Tage', days: 90 },
  { id: '365', label: '1 Jahr', days: 365 },
  { id: 'alle', label: 'Alles', days: 100_000 },
]

function HeatingOil() {
  const oil = useHeatingOil()
  const [range, setRange] = useState('365')
  const days = DAY_RANGES.find((r) => r.id === range)!.days
  const last = oil.data?.series[oil.data.series.length - 1]
  const series = useMemo(
    () =>
      oil.data
        ? [
            {
              id: 'oil',
              label: 'Heizöl',
              color: 'var(--series-sup)',
              points: oil.data.series.filter(([d]) => !last || d >= last[0] - days).map(([d, v]) => [dayToDate(d).getTime(), v] as [number, number]),
            },
          ]
        : [],
    [oil.data, days, last],
  )
  return (
    <section className="section" aria-labelledby="oil-title">
      <div className="section__head">
        <div>
          <h2 id="oil-title">Heizöl</h2>
          <p>{oil.data?.note}</p>
        </div>
        <Freshness iso={oil.data?.updatedAt} source={oil.data?.source} />
      </div>
      {oil.loading ? (
        <Loading />
      ) : oil.error ? (
        <ErrorNote error={oil.error} what="Heizölpreise" />
      ) : last ? (
        <>
          <div className="stats-row">
            <div className="stat">
              <span className="stat__label">100 Liter am {longDate(dayToDate(last[0]))}</span>
              <span className="stat__value price">{euroValue(last[1])}</span>
            </div>
            <div className="segmented" role="group" aria-label="Zeitraum">
              {DAY_RANGES.map((r) => (
                <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {series[0].points.length > 1 ? (
            <LineChart series={series} title="Heizölpreis in Euro pro 100 Liter" yFormat={euroValue} yTickFormat={(v) => decimal(v, 0)} xFormat={longDate} area />
          ) : (
            <p className="note">Der Verlauf beginnt mit der ersten täglichen Messung und wächst ab jetzt jeden Tag.</p>
          )}
        </>
      ) : null}
    </section>
  )
}

const MONTH_RANGES = [
  { id: '5', label: '5 Jahre', months: 60 },
  { id: 'alle', label: 'Seit 2006', months: 10_000 },
]

function Pellets() {
  const pellets = usePellets()
  const [range, setRange] = useState('5')
  const months = MONTH_RANGES.find((r) => r.id === range)!.months
  const data = pellets.data?.series ?? []
  const last = data[data.length - 1]
  const series = useMemo(
    () => [
      {
        id: 'ppi',
        label: 'Pelletpreisindex',
        color: 'var(--series-gas)',
        points: data.slice(-months).map(([ym, v]) => [Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 15), v] as [number, number]),
      },
    ],
    [data, months],
  )
  return (
    <section className="section" aria-labelledby="pel-title">
      <div className="section__head">
        <div>
          <h2 id="pel-title">Pellets</h2>
          <p>
            {pellets.data?.note} Index: Jänner 2006 = 100, ein Wert von 250 heißt also das 2,5-Fache des Preises von damals.
          </p>
        </div>
        <Freshness iso={pellets.data?.updatedAt} source={pellets.data?.source} />
      </div>
      {pellets.loading ? (
        <Loading />
      ) : pellets.error ? (
        <ErrorNote error={pellets.error} what="Pelletpreise" />
      ) : last ? (
        <>
          <div className="stats-row">
            <div className="stat">
              <span className="stat__label">Index {monthLabel(last[0])}</span>
              <span className="stat__value price">{decimal(last[1], 1)}</span>
            </div>
            <div className="segmented" role="group" aria-label="Zeitraum">
              {MONTH_RANGES.map((r) => (
                <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <LineChart series={series} title="Pelletpreisindex PPI06" yFormat={(v) => decimal(v, 1)} yTickFormat={(v) => decimal(v, 0)} monthly />
          <p>
            <a href={pellets.data?.sourceUrl} target="_blank" rel="noreferrer">
              Aktuelle Pelletpreise in Cent pro kg bei proPellets Austria
            </a>
          </p>
        </>
      ) : null}
    </section>
  )
}

function TariffTable({ sets, unitLabel }: { sets: TariffSet[]; unitLabel: string }) {
  const [consumption, setConsumption] = useState(sets[1]?.consumption ?? sets[0]?.consumption)
  const [noDynamic, setNoDynamic] = useState(false)
  const [limit, setLimit] = useState(12)
  const set = sets.find((s) => s.consumption === consumption) ?? sets[0]
  if (!set) return null
  const list = set.tariffs.filter((t) => !noDynamic || !t.dynamic)
  const cheapest = list[0]?.annualTotal ?? 0
  return (
    <>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Jahresverbrauch">
          {sets.map((s) => (
            <button key={s.consumption} type="button" aria-pressed={s.consumption === consumption} onClick={() => setConsumption(s.consumption)}>
              {s.consumption.toLocaleString('de-AT')} kWh
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={noDynamic} onChange={(e) => setNoDynamic(e.target.checked)} />
          Ohne Floater-Tarife
        </label>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={`${unitLabel}-Tarife, seitlich scrollbar`}>
        <table className="tariff-table">
          <caption className="visually-hidden">
            {unitLabel}-Tarife für {set.consumption.toLocaleString('de-AT')} kWh pro Jahr, Netz {set.gridOperator}
          </caption>
          <thead>
            <tr>
              <th scope="col">Anbieter und Tarif</th>
              <th scope="col" className="num">
                Jahreskosten gesamt
              </th>
              <th scope="col" className="num">
                Energiepreis
              </th>
              <th scope="col" className="num">
                Grundgebühr
              </th>
              <th scope="col">Preis</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((t, i) => (
              <tr key={`${t.brand}-${t.product}-${i}`}>
                <th scope="row">
                  <span className="tariff__brand">{t.brand}</span>
                  <span className="tariff__product">{t.product}</span>
                </th>
                <td className="num">
                  <span className="price tariff__total">{euroValue(t.annualTotal)}</span>
                  {i > 0 && <span className="note"> +{euroValue(t.annualTotal - cheapest)}</span>}
                </td>
                <td className="num tabular">{decimal(t.energyCt, 2)} ct/kWh</td>
                <td className="num tabular">{euroValue(t.baseFee)}/Jahr</td>
                <td>{t.dynamic ? 'Floater (passt sich an)' : t.guaranteeMonths ? `Garantie ${t.guaranteeMonths} Monate` : 'fix, ohne Garantie'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && (
        <button type="button" className="button more-button" onClick={() => setLimit(list.length)}>
          Alle {list.length} Tarife anzeigen
        </button>
      )}
    </>
  )
}

function Tariffs() {
  const tariffs = useTariffs()
  const [kind, setKind] = useState<'power' | 'gas'>('power')
  return (
    <section className="section" aria-labelledby="tariff-title">
      <div className="section__head">
        <div>
          <h2 id="tariff-title">Strom- und Gastarife</h2>
          <p>
            Jahreskosten für einen Haushalt in Vorarlberg (Netz Vorarlberger Energienetze) inklusive Netzkosten, Abgaben und Umsatzsteuer, ohne
            Neukundenrabatte. Reine Spot-Tarife ohne berechenbaren Jahrespreis sind nicht enthalten.
          </p>
        </div>
        <Freshness iso={tariffs.data?.updatedAt} source="E-Control Tarifkalkulator" />
      </div>
      {tariffs.loading ? (
        <Loading />
      ) : tariffs.error ? (
        <ErrorNote error={tariffs.error} what="Tarife" />
      ) : tariffs.data ? (
        <>
          <div className="segmented" role="group" aria-label="Energieart" style={{ marginBottom: 'var(--space-4)' }}>
            <button type="button" aria-pressed={kind === 'power'} onClick={() => setKind('power')}>
              Strom
            </button>
            <button type="button" aria-pressed={kind === 'gas'} onClick={() => setKind('gas')}>
              Gas
            </button>
          </div>
          <TariffTable key={kind} sets={kind === 'power' ? tariffs.data.power : tariffs.data.gas} unitLabel={kind === 'power' ? 'Strom' : 'Gas'} />
          <p>
            <a className="button" href="https://www.e-control.at/tarifkalkulator" target="_blank" rel="noreferrer">
              <IconExternal /> Mit eigenem Verbrauch im Tarifkalkulator rechnen und wechseln
            </a>
          </p>
        </>
      ) : null}
    </section>
  )
}

export default function Energy() {
  return (
    <div className="page">
      <header className="view-head">
        <h1>Energie</h1>
        <p>Börsenstrom, Heizöl, Pellets sowie Strom- und Gastarife für Vorarlberger Haushalte.</p>
      </header>
      <Spot />
      <HeatingOil />
      <Pellets />
      <Tariffs />
    </div>
  )
}
