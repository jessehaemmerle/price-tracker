import { useState, type KeyboardEvent } from 'react'
import { niceTicks, useSize } from './useSize'

export interface Bar {
  key: string | number
  value: number
  /** Kurzbeschriftung der x-Achse (z. B. "14") – leer lassen für keine */
  tick?: string
  /** Text im Tooltip */
  label: string
  /** Hervorgehobene Balken (z. B. günstigste Stunden) */
  highlight?: boolean
  /** Markierung "jetzt" */
  current?: boolean
}

interface Props {
  bars: Bar[]
  title: string
  yFormat: (v: number) => string
  height?: number
  /** Trennlinie mit Beschriftung vor diesem Index (z. B. Tageswechsel) */
  divider?: { index: number; label: string }
}

const M = { top: 22, right: 8, bottom: 28, left: 44 }

/**
 * Säulendiagramm mit fester Breite (max. 24 px), 2 px Fläche zwischen Säulen,
 * 4 px abgerundetem Ende und Tooltip je Säule (auch per Tastatur).
 */
export function BarChart({ bars, title, yFormat, height = 220, divider }: Props) {
  const [ref, width] = useSize<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  if (!bars.length) return null
  const values = bars.map((b) => b.value)
  const yt = niceTicks(Math.min(0, ...values), Math.max(...values), 4)
  const y0 = Math.min(0, yt[0] ?? 0)
  const y1 = Math.max(yt[yt.length - 1] ?? 1, ...values)
  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = height - M.top - M.bottom
  const band = innerW / bars.length
  const barW = Math.max(2, Math.min(24, band - 2))
  const sy = (v: number) => M.top + (1 - (v - y0) / (y1 - y0 || 1)) * innerH
  const zero = sy(0)

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(bars.length - 1, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? bars.length) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const bar = (b: Bar, i: number) => {
    const x = M.left + i * band + (band - barW) / 2
    const top = sy(Math.max(0, b.value))
    const bottom = sy(Math.min(0, b.value))
    const h = Math.max(1, bottom - top)
    const r = Math.min(4, barW / 2, h)
    // Abgerundet nur am Datenende, eckig an der Nulllinie.
    const d =
      b.value >= 0
        ? `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${bottom}Z`
        : `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + barW - r}Q${x + barW},${bottom} ${x + barW},${bottom - r}V${top}Z`
    return (
      <g key={b.key}>
        <path
          d={d}
          className={`chart__bar${b.highlight ? ' chart__bar--hi' : ''}${active === i ? ' chart__bar--active' : ''}`}
        />
        <rect
          x={M.left + i * band}
          y={M.top}
          width={band}
          height={innerH}
          fill="transparent"
          onPointerEnter={() => setActive(i)}
          onPointerDown={() => setActive(i)}
        />
      </g>
    )
  }

  const activeBar = active !== null ? bars[active] : null
  const activeX = active !== null ? M.left + active * band + band / 2 : 0
  const current = bars.findIndex((b) => b.current)

  return (
    <figure className="chart">
      <div ref={ref} className="chart__frame" style={{ height }} onPointerLeave={() => setActive(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={title} tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)}>
            <g className="chart__grid">
              {yt.map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={sy(v)} y2={sy(v)} />
                  <text x={M.left - 8} y={sy(v)} dy="0.32em" textAnchor="end">
                    {yFormat(v)}
                  </text>
                </g>
              ))}
            </g>
            <line className="chart__baseline" x1={M.left} x2={width - M.right} y1={zero} y2={zero} />
            {divider && divider.index > 0 && (
              <g className="chart__divider">
                <line x1={M.left + divider.index * band} x2={M.left + divider.index * band} y1={M.top - 14} y2={height - M.bottom} />
                <text x={M.left + divider.index * band + 6} y={M.top - 6}>
                  {divider.label}
                </text>
              </g>
            )}
            {current >= 0 && (
              <g className="chart__now">
                <line x1={M.left + current * band + band / 2} x2={M.left + current * band + band / 2} y1={M.top - 4} y2={height - M.bottom} />
              </g>
            )}
            {bars.map(bar)}
            <g className="chart__xaxis">
              {bars.map((b, i) =>
                b.tick ? (
                  <text key={b.key} x={M.left + i * band + band / 2} y={height - M.bottom + 18} textAnchor="middle">
                    {b.tick}
                  </text>
                ) : null,
              )}
            </g>
          </svg>
        )}
        {activeBar && (
          <div className="chart__tooltip" style={{ left: Math.min(Math.max(activeX, 90), width - 90) }} role="status" aria-live="polite">
            <div className="chart__tooltip-time">{activeBar.label}</div>
            <div className="chart__tooltip-row">
              <strong>{yFormat(activeBar.value)}</strong>
            </div>
          </div>
        )}
      </div>
      <details className="chart__table">
        <summary>Werte als Tabelle</summary>
        <div className="table-scroll" tabIndex={0} role="region" aria-label={`${title} als Tabelle`}>
          <table>
            <caption className="visually-hidden">{title}</caption>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key}>
                  <th scope="row">
                    {b.label}
                    {b.highlight ? ' (hervorgehoben)' : ''}
                  </th>
                  <td className="tabular">{yFormat(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
