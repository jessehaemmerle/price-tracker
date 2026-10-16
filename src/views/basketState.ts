import { useCallback } from 'react'
import type { StoreId } from '../../shared/types'
import { newBasketItem, type BasketItem } from '../lib/basket'
import type { Product } from '../lib/data'
import { useStoredState } from '../lib/storage'

function queryFromName(name: string): string {
  return name
    .replace(/\d+([.,]\d+)?\s*(x\s*)?(g|kg|ml|l|cl|stk|stück|st|wl|m)\b\.?/gi, '')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 4)
    .join(' ')
}

export function useBasket() {
  const [items, setItems] = useStoredState<BasketItem[]>('basket', [])

  const add = useCallback((query: string) => {
    if (!query.trim()) return
    setItems((prev) => [...prev, newBasketItem(query)])
  }, [setItems])

  const addProduct = useCallback(
    (p: Product) => {
      const item = newBasketItem(queryFromName(p.name))
      item.picks = { [p.store]: p.id }
      setItems((prev) => [...prev, item])
    },
    [setItems],
  )

  const update = useCallback(
    (id: string, patch: Partial<BasketItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    [setItems],
  )

  const pick = useCallback(
    (id: string, store: StoreId, productId: string) =>
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, picks: { ...i.picks, [store]: productId } } : i))),
    [setItems],
  )

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((i) => i.id !== id)), [setItems])
  const clear = useCallback(() => setItems([]), [setItems])

  return { items, add, addProduct, update, pick, remove, clear }
}
