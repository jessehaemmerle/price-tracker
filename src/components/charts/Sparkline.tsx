/** Kleiner Verlauf ohne Achsen – nur als Ergänzung zu einer sichtbaren Zahl, daher aria-hidden. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = 'var(--slate)',
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const sx = (i: number) => 2 + (i / (values.length - 1)) * (width - 6)
  const sy = (v: number) => 3 + (1 - (v - min) / (max - min || 1)) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(v)}`).join('')
  const last = values[values.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="sparkline">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(values.length - 1)} cy={sy(last)} r={3.5} fill={color} stroke="var(--paper)" strokeWidth={2} />
    </svg>
  )
}
