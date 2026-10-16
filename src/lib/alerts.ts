import { useEffect, useState } from 'react'
import { FUEL_LABELS, type FuelLatestFile, type FuelStationsFile, type StoreId } from '../../shared/types'
import { storeName } from '../../shared/stores'
import { loadJson, loadProducts, type Product } from './data'
import { decimal, euro } from './format'
import { readStored, writeStored } from './storage'
import { useWatchlist, watchKey, type WatchItem } from './watchlist'

export interface WatchStatus {
  key: string
  item: WatchItem
  /** Aktueller Wert: Cent (Produkt) oder Euro (Sprit) */
  current: number | null
  /** Text zum aktuellen Wert, z. B. "1,529 € bei OMV Dornbirn" */
  detail: string
  triggered: boolean
  product?: Product
}

async function computeStatuses(items: WatchItem[]): Promise<WatchStatus[]> {
  const needFuel = items.some((i) => i.kind !== 'product')
  const [stations, fuel] = needFuel
    ? await Promise.all([
        loadJson<FuelStationsFile>('fuel/stations.json').catch(() => null),
        loadJson<FuelLatestFile>('fuel/latest.json').catch(() => null),
      ])
    : [null, null]
  const stores = [...new Set(items.filter((i) => i.kind === 'product').map((i) => (i as { store: StoreId }).store))]
  const products = new Map<string, Product>()
  await Promise.all(
    stores.map((s) =>
      loadProducts(s)
        .then((list) => list.forEach((p) => products.set(`${s}:${p.id}`, p)))
        .catch(() => undefined),
    ),
  )

  return items.map((item): WatchStatus => {
    const key = watchKey(item)
    if (item.kind === 'product') {
      const p = products.get(`${item.store}:${item.id}`)
      const current = p ? p.price : null
      return {
        key,
        item,
        current,
        product: p,
        detail: p ? `${euro(p.price)} bei ${storeName(item.store)}` : 'Derzeit nicht im Online-Sortiment',
        triggered: current !== null && item.below !== undefined && current <= item.below,
      }
    }
    if (item.kind === 'station') {
      const v = fuel?.prices[String(item.id)]?.[item.fuel]
      const current = typeof v === 'number' ? v : null
      return {
        key,
        item,
        current,
        detail: current !== null ? `${decimal(current, 3)} €` : 'Preis derzeit nicht veröffentlicht',
        triggered: current !== null && item.below !== undefined && current <= item.below,
      }
    }
    let best: { price: number; label: string } | null = null
    for (const s of stations?.stations ?? []) {
      if (item.district && s.district !== item.district) continue
      const v = fuel?.prices[String(s.id)]?.[item.fuel]
      if (typeof v === 'number' && (!best || v < best.price)) best = { price: v, label: `${s.name}, ${s.city}` }
    }
    return {
      key,
      item,
      current: best?.price ?? null,
      detail: best ? `${decimal(best.price, 3)} € bei ${best.label}` : 'Keine Preise verfügbar',
      triggered: best !== null && item.below !== undefined && best.price <= item.below,
    }
  })
}

export function useWatchStatuses(): { statuses: WatchStatus[]; loading: boolean } {
  const { items } = useWatchlist()
  const [state, setState] = useState<{ statuses: WatchStatus[]; loading: boolean }>({ statuses: [], loading: items.length > 0 })
  const signature = JSON.stringify(items)
  useEffect(() => {
    let alive = true
    if (!items.length) {
      setState({ statuses: [], loading: false })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    computeStatuses(items).then((statuses) => alive && setState({ statuses, loading: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  return state
}

export function watchTitle(item: WatchItem, product?: Product): string {
  if (item.kind === 'product') return product?.name ?? item.name
  if (item.kind === 'station') return `${FUEL_LABELS[item.fuel]} bei ${item.name}, ${item.city}`
  return `${FUEL_LABELS[item.fuel]}, günstigste Tankstelle ${item.district ? `im Bezirk ${item.district}` : 'in Vorarlberg'}`
}

/**
 * Prüft beim Öffnen der Seite die Merkliste und zeigt – wenn erlaubt – eine
 * Browser-Benachrichtigung für neu ausgelöste Alarme. Liefert die Anzahl
 * ausgelöster Alarme für das Abzeichen in der Navigation.
 */
export function useAlertCheck(): number {
  const { statuses } = useWatchStatuses()
  const triggered = statuses.filter((s) => s.triggered)
  const signature = triggered.map((s) => `${s.key}=${s.current}`).join('|')
  useEffect(() => {
    if (!triggered.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const notified = readStored<Record<string, number>>('notified', {})
    let changed = false
    for (const s of triggered) {
      if (s.current === null || notified[s.key] === s.current) continue
      try {
        new Notification(`Preisalarm: ${watchTitle(s.item, s.product)}`, { body: s.detail, tag: s.key })
      } catch {
        /* z. B. mobile Browser ohne Notification-Konstruktor */
      }
      notified[s.key] = s.current
      changed = true
    }
    if (changed) writeStored('notified', notified)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  return triggered.length
}
