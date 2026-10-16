import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { FuelStatPoint } from '../../shared/types'
import { decimal, weekdayHour } from '../lib/format'
import { useSize } from './charts/useSize'

/**
 * Der „Preisgrat“: Die Bergsilhouette im Kopf der Startseite ist ein echtes
 * Diagramm einer Sorte über die letzten Tage. Hinten liegt die Kette des
 * Durchschnittspreises, vorne die des günstigsten Preises. Durch die
 * Mittagsregel (Erhöhung nur um 12 Uhr) entstehen tägliche Zacken wie eine
 * Gebirgskette.
 */

const H = 230
const M = { top: 40, right: 8, bottom: 0, left: 0 }

/** Dekorative Ersatz-Silhouette, solange noch kein Verlauf gesammelt ist. */
function FallbackRidge() {
  return (
    <svg className="ridge__fallback" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 200V120l90-38 70 30 110-70 80 52 60-24 120 60 90-80 70 40 110-62 90 58 80-30 120 50 110-40V200Z" fill="var(--ridge-far)" />
      <path d="M0 200v-48l120-34 90 26 130-56 100 50 90-20 140 44 110-58 120 46 150-30 150 40V200Z" fill="var(--ridge-near)" />
    </svg>
  )
}

interface Props {
  label: string
  color: string
  points: FuelStatPoint[]
  days?: number
}

export function Ridge({ label, color, points, days = 7 }: Props) {
  const [ref, width] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const windowed = useMemo(() => {
    const latest = points.length ? points[points.length - 1][0] : 0
    return points.filter((p) => p[0] >= latest - days * 86_400)
  }, [points, days])

  const enough = windowed.length >= 3

  const geo = useMemo(() => {
    if (!enough || width < 100) return null
    const x0 = windowed[0][0]
    const x1 = windowed[windowed.length - 1][0]
    const values = windowed.flatMap((p) => [p[1], p[2]])
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = Math.max((hi - lo) * 0.15, 0.004)
    // Unten mehr Luft, damit die vordere Kette nicht am Rand klebt
    const y0 = lo - pad * 3
    const y1 = hi + pad
    const innerW = width - M.left - M.right
    const sx = (t: number) => M.left + ((t - x0) / (x1 - x0 || 1)) * innerW
    const sy = (v: number) => M.top + (1 - (v - y0) / (y1 - y0)) * (H - M.top - M.bottom)
    return { x0, x1, sx, sy, innerW }
  }, [enough, windowed, width])

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    if (!geo) return
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const t = geo.x0 + ((e.clientX - rect.left - M.left) / geo.innerW) * (geo.x1 - geo.x0)
    let best = 0
    windowed.forEach((p, i) => {
      if (Math.abs(p[0] - t) < Math.abs(windowed[best][0] - t)) best = i
    })
    setHover(best)
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const n = windowed.length
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1))
    else if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1))
    else if (e.key === 'Escape') setHover(null)
    else return
    e.preventDefault()
  }

  if (!geo) {
    return (
      <div className="ridge" ref={ref}>
        <FallbackRidge />
        {!enough && (
          <div className="page ridge__note">
            <p>Der Preisgrat wächst mit jeder stündlichen Messung. Nach ein paar Stunden ist hier der Verlauf zu sehen.</p>
          </div>
        )}
      </div>
    )
  }

  const line = (idx: 1 | 2) => windowed.map((p, i) => `${i ? 'L' : 'M'}${geo.sx(p[0])},${geo.sy(p[idx])}`).join('')
  const area = (idx: 1 | 2) => `${line(idx)}L${width},${geo.sy(windowed[windowed.length - 1][idx])}L${width},${H}L0,${H}Z`
  const last = windowed[windowed.length - 1]
  const lastX = geo.sx(last[0])
  const hp = hover !== null ? windowed[hover] : null

  return (
    <div className="ridge" ref={ref}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${label} in Vorarlberg, letzte ${days} Tage: zuletzt im Durchschnitt ${decimal(last[1], 3)} Euro, günstigster ${decimal(last[2], 3)} Euro.`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {/* Hinten: Durchschnitt (ferne Kette), vorne: günstigster Preis */}
        <path d={area(1)} fill="var(--ridge-far)" />
        <path d={line(1)} fill="none" stroke="var(--slate)" strokeWidth={1.5} strokeLinejoin="round" />
        <path d={area(2)} fill="var(--ridge-near)" />
        <path d={line(2)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={lastX} cy={geo.sy(last[1])} r={3.5} fill="var(--slate)" stroke="var(--paper)" strokeWidth={2} />
        <circle cx={lastX} cy={geo.sy(last[2])} r={4} fill={color} stroke="var(--paper)" strokeWidth={2} />
        <g className="ridge__label" textAnchor="end">
          <text x={lastX - 10} y={geo.sy(last[1]) - 12}>
            Durchschnitt {decimal(last[1], 3)}
          </text>
          <text x={lastX - 10} y={geo.sy(last[2]) + 20}>
            Günstigster {decimal(last[2], 3)}
          </text>
        </g>
        {hp && (
          <g className="ridge__cross">
            <line x1={geo.sx(hp[0])} x2={geo.sx(hp[0])} y1={M.top - 20} y2={H} />
            <circle cx={geo.sx(hp[0])} cy={geo.sy(hp[1])} r={3.5} fill="var(--slate)" stroke="var(--paper)" strokeWidth={2} />
            <circle cx={geo.sx(hp[0])} cy={geo.sy(hp[2])} r={4} fill={color} stroke="var(--paper)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={0}
          y={0}
          width={width}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hp && (
        <div className="chart__tooltip ridge__tooltip" style={{ left: Math.min(Math.max(geo.sx(hp[0]), 100), width - 100) }} role="status">
          <div className="chart__tooltip-time">{weekdayHour(hp[0] * 1000)} Uhr</div>
          <div className="chart__tooltip-row">
            <span className="chart__linekey" style={{ background: 'var(--slate)' }} />
            <strong>{decimal(hp[1], 3)} €</strong>
            <span>Durchschnitt</span>
          </div>
          <div className="chart__tooltip-row">
            <span className="chart__linekey" style={{ background: color }} />
            <strong>{decimal(hp[2], 3)} €</strong>
            <span>günstigster</span>
          </div>
        </div>
      )}
    </div>
  )
}
