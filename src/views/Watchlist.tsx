import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { FUEL_LABELS, FUEL_TYPES, type AlertRule, type FuelType } from '../../shared/types'
import { IconBell, IconCheck, IconCopy, IconExternal, IconX } from '../components/Icons'
import { Delta } from '../components/Price'
import { Empty, Loading } from '../components/States'
import { useWatchStatuses, watchTitle, type WatchStatus } from '../lib/alerts'
import { decimal, euro } from '../lib/format'
import { toNumber } from '../../shared/units'
import { useWatchlist, type WatchItem } from '../lib/watchlist'

const REPO = 'jessehaemmerle/price-tracker'

function thresholdText(item: WatchItem): string {
  if (item.below === undefined) return ''
  return item.kind === 'product' ? decimal(item.below / 100, 2) : decimal(item.below, 3)
}

function WatchRow({ s }: { s: WatchStatus }) {
  const { update, remove } = useWatchlist()
  const [draft, setDraft] = useState(thresholdText(s.item))
  const isProduct = s.item.kind === 'product'
  const title = watchTitle(s.item, s.product)

  const save = () => {
    const v = toNumber(draft.replace('€', ''))
    if (!draft.trim() || !Number.isFinite(v) || v <= 0) {
      update(s.key, { below: undefined })
      return
    }
    update(s.key, { below: isProduct ? Math.round(v * 100) : Math.round(v * 1000) / 1000 })
  }

  const link =
    s.item.kind === 'product'
      ? `/produkt/${s.item.store}/${encodeURIComponent(s.item.id)}`
      : s.item.kind === 'station'
        ? `/sprit/${s.item.id}`
        : `/sprit${s.item.fuel === 'DIE' ? '' : `?sorte=${s.item.fuel}`}`

  return (
    <li className={`watch-row${s.triggered ? ' watch-row--hit' : ''}`}>
      <div className="watch-row__main">
        <Link to={link} className="watch-row__title">
          {title}
        </Link>
        <span className="watch-row__detail">
          {s.detail}
          {s.item.kind === 'product' && s.current !== null && s.current !== s.item.addedPrice && (
            <>
              {' '}
              <Delta diff={s.current - s.item.addedPrice} format={euro} label="seit dem Merken" />
            </>
          )}
        </span>
      </div>
      <label className="field watch-row__threshold">
        Alarm unter
        <span className="input-affix">
          <input
            className="input"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={isProduct ? 'z. B. 1,99' : 'z. B. 1,599'}
            aria-label={`Alarm-Schwelle in Euro für ${title}`}
          />
          <span aria-hidden="true">€</span>
        </span>
      </label>
      <span className="watch-row__status">
        {s.item.below === undefined ? (
          <span className="status status--muted">kein Alarm</span>
        ) : s.triggered ? (
          <span className="status status--good">
            <IconCheck /> Schwelle erreicht
          </span>
        ) : (
          <span className="status status--muted">noch darüber</span>
        )}
      </span>
      <button type="button" className="icon-button" aria-label={`${title} von der Merkliste entfernen`} onClick={() => remove(s.key)}>
        <IconX />
      </button>
    </li>
  )
}

function NotificationControl() {
  const supported = typeof Notification !== 'undefined'
  const [perm, setPerm] = useState(supported ? Notification.permission : 'denied')
  if (!supported) return <p className="note">Dein Browser unterstützt keine Benachrichtigungen. Ausgelöste Alarme siehst du hier und in der Navigation.</p>
  if (perm === 'granted') {
    return (
      <p className="status status--good">
        <IconCheck /> Browser-Benachrichtigungen sind an. Du wirst beim Öffnen der Seite benachrichtigt, wenn eine Schwelle erreicht ist.
      </p>
    )
  }
  if (perm === 'denied') {
    return <p className="note">Benachrichtigungen sind im Browser blockiert. Du kannst sie in den Website-Einstellungen wieder erlauben.</p>
  }
  return (
    <button type="button" className="button" onClick={() => Notification.requestPermission().then(setPerm)}>
      <IconBell /> Browser-Benachrichtigungen erlauben
    </button>
  )
}

function FuelAlarmForm() {
  const { toggle, has } = useWatchlist()
  const [fuel, setFuel] = useState<FuelType>('DIE')
  const [district, setDistrict] = useState('')
  const exists = has(`fuel:${fuel}:${district || 'alle'}`)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!exists) toggle({ kind: 'fuel', fuel, district: district || undefined, addedAt: new Date().toISOString() })
  }
  return (
    <form className="toolbar" onSubmit={submit}>
      <label className="field">
        Sorte
        <select className="select" value={fuel} onChange={(e) => setFuel(e.target.value as FuelType)}>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {FUEL_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Gebiet
        <select className="select" value={district} onChange={(e) => setDistrict(e.target.value)}>
          <option value="">Ganz Vorarlberg</option>
          {['Bludenz', 'Bregenz', 'Dornbirn', 'Feldkirch'].map((d) => (
            <option key={d} value={d}>
              Bezirk {d}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="button" disabled={exists}>
        {exists ? 'Bereits auf der Merkliste' : 'Günstigsten Preis beobachten'}
      </button>
    </form>
  )
}

/** Merkliste → Regeln für config/alerts.json (Push über GitHub Actions + ntfy). */
function toRules(items: WatchItem[]): AlertRule[] {
  return items.flatMap((i): AlertRule[] => {
    if (i.below === undefined) return []
    if (i.kind === 'product') return [{ id: `${i.store}-${i.id}`, type: 'product', store: i.store, product: i.id, below: i.below / 100 }]
    if (i.kind === 'station') return [{ id: `station-${i.id}-${i.fuel}`, type: 'fuel', fuel: i.fuel, below: i.below, stations: [i.id] }]
    return [
      {
        id: `fuel-${i.fuel}-${i.district ?? 'vorarlberg'}`.toLowerCase(),
        type: 'fuel',
        fuel: i.fuel,
        below: i.below,
        ...(i.district ? { districts: [i.district] } : {}),
      },
    ]
  })
}

function PushSetup({ items }: { items: WatchItem[] }) {
  const [copied, setCopied] = useState(false)
  const [exampleTopic] = useState(() => `gspart-${Math.random().toString(36).slice(2, 8)}`)
  const json = useMemo(
    () =>
      JSON.stringify(
        { siteUrl: `${location.origin}${location.pathname}`, rules: toRules(items) },
        null,
        2,
      ),
    [items],
  )
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  const rules = toRules(items)
  return (
    <section className="section" aria-labelledby="push-title">
      <div className="section__head">
        <div>
          <h2 id="push-title">Push-Nachricht aufs Handy</h2>
          <p>
            Damit Alarme auch bei geschlossener Seite ankommen, prüft die automatische Aktualisierung auf GitHub nach jedem Lauf die Datei{' '}
            <code>config/alerts.json</code> und schickt eine Nachricht über ntfy.
          </p>
        </div>
      </div>
      <ol className="steps">
        <li>
          Installiere die kostenlose App <a href="https://ntfy.sh/" target="_blank" rel="noreferrer">ntfy</a> und abonniere ein Thema mit einem
          schwer zu erratenden Namen, z. B. <code>{exampleTopic}</code>.
        </li>
        <li>
          Lege im Repository unter Settings → Secrets and variables → Actions ein Secret <code>NTFY_TOPIC</code> mit genau diesem Namen an.
        </li>
        <li>
          Setz oben bei deinen Merkposten eine Alarm-Schwelle, kopiere die Regeln und ersetze damit den Inhalt von <code>config/alerts.json</code>.
        </li>
      </ol>
      {rules.length ? (
        <>
          <pre className="code-block" tabIndex={0} aria-label="Regeln für config/alerts.json">
            {json}
          </pre>
          <div className="toolbar">
            <button type="button" className="button" onClick={copy}>
              {copied ? <IconCheck /> : <IconCopy />} {copied ? 'Kopiert' : 'Regeln kopieren'}
            </button>
            <a className="button button--quiet" href={`https://github.com/${REPO}/edit/main/config/alerts.json`} target="_blank" rel="noreferrer">
              <IconExternal /> alerts.json auf GitHub bearbeiten
            </a>
          </div>
        </>
      ) : (
        <p className="note">Setz bei mindestens einem Merkposten eine Alarm-Schwelle, dann erscheinen hier die passenden Regeln.</p>
      )}
    </section>
  )
}

export default function Watchlist() {
  const { items } = useWatchlist()
  const { statuses, loading } = useWatchStatuses()
  const hits = statuses.filter((s) => s.triggered)
  return (
    <div className="page">
      <header className="view-head">
        <h1>Merkliste und Preisalarm</h1>
        <p>Merk dir Tankstellen und Produkte mit dem Stern und leg eine Schwelle fest. Die Merkliste bleibt in diesem Browser gespeichert.</p>
      </header>
      {hits.length > 0 && (
        <div className="notice notice--alert" role="status">
          <IconBell />
          <p>
            {hits.length === 1 ? 'Ein Alarm hat' : `${hits.length} Alarme haben`} die Schwelle erreicht:{' '}
            {hits.map((h) => watchTitle(h.item, h.product)).join(', ')}.
          </p>
        </div>
      )}
      <section className="section" aria-labelledby="wl-title">
        <div className="section__head">
          <h2 id="wl-title">Beobachtet</h2>
          <NotificationControl />
        </div>
        {items.length === 0 ? (
          <Empty
            level={3}
            title="Noch nichts gemerkt."
            action={
              <p>
                <Link to="/sprit">Tankstellen ansehen</Link> oder <Link to="/einkaufen">Produkte suchen</Link> und mit dem Stern merken.
              </p>
            }
          >
            Oder beobachte unten gleich den günstigsten Spritpreis in deiner Gegend.
          </Empty>
        ) : loading && !statuses.length ? (
          <Loading />
        ) : (
          <ul className="watch-list">
            {statuses.map((s) => (
              <WatchRow key={s.key} s={s} />
            ))}
          </ul>
        )}
        <h3 className="subhead">Günstigsten Spritpreis beobachten</h3>
        <FuelAlarmForm />
      </section>
      <PushSetup items={items} />
    </div>
  )
}
