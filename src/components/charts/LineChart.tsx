import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { niceTicks, timeTicks, useSize } from './useSize'
import { shortDate, hourLabel, monthLabel } from '../../lib/format'

export interface Series {
  id: string
  label: string
  /** CSS-Farbe, idealerweise eine Variable wie var(--series-die) */
  color: string
  /** [Zeit in ms, Wert] – aufsteigend sortiert */
  points: [number, number][]
}

interface Props {
  series: Series[]
  /** Beschreibung für Screenreader und Tabellenüberschrift */
  title: string
  yFormat: (v: number) => string
  /** Kurzform für Achse (Standard: yFormat) */
  yTickFormat?: (v: number) => string
  xFormat?: (t: number) => string
  height?: number
  /** Treppenlinie: Preis gilt bis zur nächsten Änderung */
  step?: boolean
  /** Bis hierhin verlängern (z. B. "jetzt") */
  xMax?: number
  xMin?: number
  /** Fläche unter einer einzelnen Serie als zarte Lasur */
  area?: boolean
  /** Monatsdaten: Achse in Monaten beschriften */
  monthly?: boolean
}

const M = { top: 14, right: 56, bottom: 30, left: 52 }

function valueAt(points: [number, number][], t: number, step: boolean): [number, number] | null {
  if (!points.length) return null
  if (step) {
    let found: [number, number] | null = null
    for (const p of points) {
      if (p[0] <= t) found = p
      else break
    }
    return found ? [t, found[1]] : null
  }
  let best = points[0]
  for (const p of points) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p
  return best
}

export function LineChart({
  series,
  title,
  yFormat,
  yTickFormat,
  xFormat,
  height = 260,
  step = false,
  xMax,
  xMin,
  area = false,
  monthly = false,
}: Props) {
  const [ref, width] = useSize<HTMLDivElement>()
  const [hoverT, setHoverT] = useState<number | null>(null)
  const descId = useId()
  const visible = useMemo(() => series.filter((s) => s.points.length > 0), [series])

  const geo = useMemo(() => {
    const all = visible.flatMap((s) => s.points)
    if (!all.length || width < 50) return null
    let x0 = xMin ?? Math.min(...all.map((p) => p[0]))
    let x1 = Math.max(xMax ?? -Infinity, ...all.map((p) => p[0]))
    if (x0 === x1) {
      x0 -= 3600_000
      x1 += 3600_000
    }
    const ys = all.filter((p) => p[0] >= x0).map((p) => p[1])
    let y0 = Math.min(...ys)
    let y1 = Math.max(...ys)
    const pad = (y1 - y0) * 0.12 || Math.abs(y1) * 0.02 || 1
    y0 -= pad
    y1 += pad
    const yt = niceTicks(y0, y1, 4)
    y0 = Math.min(y0, yt[0] ?? y0)
    y1 = Math.max(y1, yt[yt.length - 1] ?? y1)
    const innerW = width - M.left - M.right
    const innerH = height - M.top - M.bottom
    const sx = (t: number) => M.left + ((t - x0) / (x1 - x0)) * innerW
    const sy = (v: number) => M.top + (1 - (v - y0) / (y1 - y0)) * innerH
    const xt = timeTicks(x0, x1, Math.max(2, Math.floor(innerW / 84)))
    return { x0, x1, y0, y1, sx, sy, yt, xt, innerW, innerH }
  }, [visible, width, height, xMax, xMin])

  const xTick = (t: number, stepMs: number) =>
    monthly || stepMs >= 30 * 86_400_000 ? monthLabel(new Date(t).toISOString().slice(0, 7)) : stepMs >= 86_400_000 ? shortDate(t) : hourLabel(t)
  const fmtX = xFormat ?? ((t: number) => (monthly ? monthLabel(new Date(t).toISOString().slice(0, 7)) : `${shortDate(t)}, ${hourLabel(t)}`))

  const paths = useMemo(() => {
    if (!geo) return []
    return visible.flatMap((s) => {
      // Treppen beginnen mit dem letzten Wert vor dem sichtbaren Bereich.
      const pts = step ? s.points : s.points.filter((p) => p[0] >= geo.x0)
      if (!pts.length) return []
      let d = ''
      pts.forEach((p, i) => {
        const x = Math.max(geo.sx(p[0]), M.left)
        const y = geo.sy(p[1])
        if (i === 0) d += `M${x},${y}`
        else if (step) d += `H${x}V${y}`
        else d += `L${x},${y}`
      })
      const last = pts[pts.length - 1]
      if (step && last && geo.x1 > last[0]) d += `H${geo.sx(geo.x1)}`
      const endX = step ? geo.sx(geo.x1) : geo.sx(last[0])
      return [{ s, d, endX, endY: geo.sy(last[1]), last: last[1], firstX: Math.max(geo.sx(pts[0][0]), M.left) }]
    })
  }, [geo, visible, step])

  const xs = useMemo(
    () => [...new Set(visible.flatMap((s) => s.points.map((p) => p[0])))].filter((t) => !geo || t >= geo.x0).sort((a, b) => a - b),
    [visible, geo],
  )

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    if (!geo) return
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const t = geo.x0 + ((e.clientX - rect.left - M.left) / geo.innerW) * (geo.x1 - geo.x0)
    if (step) setHoverT(Math.min(Math.max(t, geo.x0), geo.x1))
    else setHoverT(xs.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), xs[0]))
  }

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!xs.length) return
    const idx = hoverT === null ? xs.length : xs.findIndex((x) => x >= hoverT)
    if (e.key === 'ArrowLeft') setHoverT(xs[Math.max(0, (idx < 0 ? xs.length : idx) - 1)])
    else if (e.key === 'ArrowRight') setHoverT(xs[Math.min(xs.length - 1, idx + 1)])
    else if (e.key === 'Escape') setHoverT(null)
    else return
    e.preventDefault()
  }

  const readout = hoverT !== null ? visible.map((s) => ({ s, v: valueAt(s.points, hoverT, step) })) : []
  const tipLeft = geo && hoverT !== null ? geo.sx(hoverT) : 0

  // End-Beschriftungen nur, wenn sie sich nicht überlappen (sonst Legende + Tooltip).
  const endLabels = useMemo(() => {
    if (paths.length > 4) return []
    const sorted = [...paths].sort((a, b) => a.endY - b.endY)
    for (let i = 1; i < sorted.length; i++) if (sorted[i].endY - sorted[i - 1].endY < 14) return []
    return paths
  }, [paths])

  return (
    <figure className="chart">
      {visible.length > 1 && (
        <figcaption className="chart__legend">
          {visible.map((s) => (
            <span key={s.id} className="chart__key">
              <span className="chart__swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <div ref={ref} className="chart__frame" style={{ height }}>
        {geo && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={title}
            aria-describedby={descId}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setHoverT(null)}
          >
            <g className="chart__grid">
              {geo.yt.map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={geo.sy(v)} y2={geo.sy(v)} />
                  <text x={M.left - 8} y={geo.sy(v)} dy="0.32em" textAnchor="end">
                    {(yTickFormat ?? yFormat)(v)}
                  </text>
                </g>
              ))}
            </g>
            <line className="chart__baseline" x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} />
            <g className="chart__xaxis">
              {geo.xt.ticks.map((t) => (
                <text key={t} x={geo.sx(t)} y={height - M.bottom + 18} textAnchor="middle">
                  {xTick(t, geo.xt.step)}
                </text>
              ))}
            </g>
            {area &&
              paths.length === 1 &&
              paths.map(({ s, d, firstX }) => (
                <path key={`a-${s.id}`} d={`${d}V${height - M.bottom}H${firstX}Z`} fill={s.color} opacity={0.1} />
              ))}
            {paths.map(({ s, d }) => (
              <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {paths.map(({ s, endX, endY }) => (
              <circle key={`e-${s.id}`} cx={endX} cy={endY} r={4} fill={s.color} stroke="var(--paper)" strokeWidth={2} />
            ))}
            {endLabels.map(({ s, endX, endY, last }) => (
              <text key={`l-${s.id}`} className="chart__endlabel" x={endX + 8} y={endY} dy="0.32em">
                {yFormat(last)}
              </text>
            ))}
            {hoverT !== null && (
              <g className="chart__cross">
                <line x1={tipLeft} x2={tipLeft} y1={M.top} y2={height - M.bottom} />
                {readout.map(({ s, v }) =>
                  v ? <circle key={s.id} cx={tipLeft} cy={geo.sy(v[1])} r={4} fill={s.color} stroke="var(--paper)" strokeWidth={2} /> : null,
                )}
              </g>
            )}
            <rect
              x={M.left}
              y={M.top}
              width={Math.max(0, geo.innerW)}
              height={Math.max(0, geo.innerH)}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHoverT(null)}
              onPointerDown={onMove}
            />
          </svg>
        )}
        {geo && hoverT !== null && readout.some((r) => r.v) && (
          <div
            className="chart__tooltip"
            style={{ left: Math.min(Math.max(tipLeft, 90), width - 90) }}
            role="status"
            aria-live="polite"
          >
            <div className="chart__tooltip-time">{fmtX(step ? hoverT : (readout.find((r) => r.v)?.v?.[0] ?? hoverT))}</div>
            {readout.map(({ s, v }) =>
              v ? (
                <div key={s.id} className="chart__tooltip-row">
                  <span className="chart__linekey" style={{ background: s.color }} />
                  <strong>{yFormat(v[1])}</strong>
                  {visible.length > 1 && <span>{s.label}</span>}
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
      <p id={descId} className="visually-hidden">
        {title}. Mit den Pfeiltasten links und rechts durch die Werte gehen.
      </p>
      <ChartTable series={visible} title={title} yFormat={yFormat} xFormat={fmtX} />
    </figure>
  )
}

function ChartTable({
  series,
  title,
  yFormat,
  xFormat,
}: {
  series: Series[]
  title: string
  yFormat: (v: number) => string
  xFormat: (t: number) => string
}) {
  const [open, setOpen] = useState(false)
  const rows = useMemo(() => {
    if (!open) return []
    const times = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => b - a).slice(0, 60)
    return times.map((t) => ({ t, values: series.map((s) => s.points.find((p) => p[0] === t)?.[1]) }))
  }, [open, series])
  return (
    <details className="chart__table" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Werte als Tabelle</summary>
      {open && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={`${title} als Tabelle`}>
          <table>
            <caption className="visually-hidden">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Zeitpunkt</th>
                {series.map((s) => (
                  <th key={s.id} scope="col">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.t}>
                  <th scope="row">{xFormat(r.t)}</th>
                  {r.values.map((v, i) => (
                    <td key={series[i].id} className="tabular">
                      {v === undefined ? '–' : yFormat(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 60 && <p className="note">Die letzten 60 Messpunkte.</p>}
        </div>
      )}
    </details>
  )
}
