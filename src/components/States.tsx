import type { ReactNode } from 'react'
import { relativeTime, dateTime } from '../lib/format'
import { IconInfo } from './Icons'

export function Loading({ label = 'Lädt Daten …' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  )
}

export function ErrorNote({ error, what }: { error: Error; what: string }) {
  const missing = /Noch keine Daten/.test(error.message)
  return (
    <div className="notice" role="status">
      <IconInfo />
      <p>
        {missing
          ? `${what}: Noch keine Daten vorhanden. Sie erscheinen nach dem ersten Lauf der automatischen Aktualisierung.`
          : `${what} konnten nicht geladen werden. Lade die Seite neu oder versuche es später noch einmal.`}
      </p>
    </div>
  )
}

export function Empty({
  title,
  children,
  action,
  level = 2,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  /** Überschriftenebene passend zur Umgebung (Standard h2) */
  level?: 1 | 2 | 3
}) {
  const H = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
  return (
    <div className="empty">
      <H className="empty__title">{title}</H>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Freshness({ iso, source }: { iso: string | null | undefined; source?: string }) {
  if (!iso) return null
  return (
    <span className="freshness">
      <time dateTime={iso} title={dateTime(iso)}>
        Aktualisiert {relativeTime(iso)}
      </time>
      {source ? `, Quelle: ${source}` : ''}
    </span>
  )
}
