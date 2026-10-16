import { useCallback } from 'react'
import type { FuelType, StoreId } from '../../shared/types'
import { useStoredState } from './storage'

export type WatchItem =
  | {
      kind: 'product'
      store: StoreId
      id: string
      name: string
      /** Alarm-Schwelle in Cent */
      below?: number
      addedPrice: number
      addedAt: string
    }
  | {
      kind: 'station'
      id: number
      fuel: FuelType
      name: string
      city: string
      /** Alarm-Schwelle in Euro pro Liter */
      below?: number
      addedAt: string
    }
  | {
      kind: 'fuel'
      fuel: FuelType
      district?: string
      below?: number
      addedAt: string
    }

export function watchKey(item: WatchItem): string {
  switch (item.kind) {
    case 'product':
      return `product:${item.store}:${item.id}`
    case 'station':
      return `station:${item.id}:${item.fuel}`
    case 'fuel':
      return `fuel:${item.fuel}:${item.district ?? 'alle'}`
  }
}

export function useWatchlist() {
  const [items, setItems] = useStoredState<WatchItem[]>('watchlist', [])

  const has = useCallback((key: string) => items.some((i) => watchKey(i) === key), [items])

  const toggle = useCallback(
    (item: WatchItem) =>
      setItems((prev) => {
        const key = watchKey(item)
        return prev.some((i) => watchKey(i) === key) ? prev.filter((i) => watchKey(i) !== key) : [...prev, item]
      }),
    [setItems],
  )

  const update = useCallback(
    (key: string, patch: Partial<WatchItem>) =>
      setItems((prev) => prev.map((i) => (watchKey(i) === key ? ({ ...i, ...patch } as WatchItem) : i))),
    [setItems],
  )

  const remove = useCallback((key: string) => setItems((prev) => prev.filter((i) => watchKey(i) !== key)), [setItems])

  return { items, has, toggle, update, remove }
}
