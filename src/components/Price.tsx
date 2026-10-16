import { decimal, euro, fuelParts } from '../lib/format'
import { IconArrowDown, IconArrowUp } from './Icons'

/** Spritpreis wie auf der Preistafel: 1,58⁹ – die dritte Nachkommastelle hochgestellt. */
export function FuelPrice({ value, size, unit }: { value: number; size?: string; unit?: string }) {
  const [main, last] = fuelParts(value)
  return (
    <span className="price" style={size ? { fontSize: size } : undefined}>
      <span className="visually-hidden">
        {decimal(value, 3)} Euro{unit ? ` pro ${unit === 'kg' ? 'Kilogramm' : 'Liter'}` : ''}
      </span>
      <span aria-hidden="true">
        {main}
        <sup>{last}</sup>
        {unit !== undefined && <span className="price__unit">€/{unit}</span>}
      </span>
    </span>
  )
}

/** Preis in Cent in der Schmalschrift */
export function Money({ cents, size, className }: { cents: number; size?: string; className?: string }) {
  return (
    <span className={`price ${className ?? ''}`} style={size ? { fontSize: size } : undefined}>
      {euro(cents)}
    </span>
  )
}

/**
 * Preisänderung mit Symbol und Text – nie nur Farbe.
 * Bei Preisen ist "gefallen" gut (grün), "gestiegen" schlecht.
 */
export function Delta({ diff, format, label }: { diff: number; format: (v: number) => string; label?: string }) {
  if (!diff || !Number.isFinite(diff)) {
    return <span className="delta delta--flat">{label ? `${label}: ` : ''}unverändert</span>
  }
  const down = diff < 0
  const Icon = down ? IconArrowDown : IconArrowUp
  return (
    <span className={`delta ${down ? 'delta--down' : 'delta--up'}`}>
      <Icon width={14} height={14} />
      <span className="visually-hidden">{down ? 'gefallen um' : 'gestiegen um'}</span>
      {format(Math.abs(diff))}
      {label && <span className="delta__label"> {label}</span>}
    </span>
  )
}
