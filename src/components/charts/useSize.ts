import { useEffect, useRef, useState } from 'react'

export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** "Schöne" Achsenwerte (1, 2, 2,5, 5 × 10^n) */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const start = Math.ceil(min / step - 1e-9) * step
  const ticks: number[] = []
  // "|| 0" macht aus -0 eine 0 (sonst steht "-0,0" an der Achse)
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step || 0)
  return ticks
}

const H = 3600_000
const D = 24 * H
const STEPS = [H, 3 * H, 6 * H, 12 * H, D, 2 * D, 7 * D, 14 * D, 30 * D, 91 * D, 182 * D, 365 * D, 2 * 365 * D, 5 * 365 * D]

/** Zeitachsen-Ticks: Schrittweite so, dass höchstens `maxTicks` Beschriftungen passen. */
export function timeTicks(from: number, to: number, maxTicks: number): { ticks: number[]; step: number } {
  const span = to - from
  const step = STEPS.find((s) => span / s <= maxTicks) ?? STEPS[STEPS.length - 1]
  const ticks: number[] = []
  if (step >= 30 * D) {
    // Monatsanfänge
    const d = new Date(from)
    d.setUTCDate(1)
    d.setUTCHours(0, 0, 0, 0)
    const months = Math.round(step / (30 * D))
    while (d.getTime() <= to) {
      if (d.getTime() >= from && d.getUTCMonth() % months === 0) ticks.push(d.getTime())
      d.setUTCMonth(d.getUTCMonth() + 1)
    }
  } else {
    // Wiener Mitternacht ≈ UTC 23:00/22:00 – auf volle Stunde UTC runden reicht für die Achse.
    const offset = step >= D ? new Date(from).getTimezoneOffset() * 60_000 : 0
    let t = Math.ceil((from - offset) / step) * step + offset
    for (; t <= to; t += step) ticks.push(t)
  }
  return { ticks, step }
}
