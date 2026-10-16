import { useEffect, useState } from 'react'
import {
  historyBucket,
  type DailySeriesFile,
  type FuelHistoryFile,
  type FuelLatestFile,
  type FuelStationsFile,
  type HighlightsFile,
  type MetaFile,
  type MonthlySeriesFile,
  type ProductTuple,
  type ShopHistoryBucket,
  type ShopIndexFile,
  type ShopLatestFile,
  type SpotPriceFile,
  type StoreId,
  type TariffFile,
} from '../../shared/types'

const BASE = `${import.meta.env.BASE_URL}data/`

const cache = new Map<string, Promise<unknown>>()

export class DataError extends Error {
  constructor(
    public path: string,
    public status: number,
  ) {
    super(status === 404 ? `Noch keine Daten (${path})` : `Daten konnten nicht geladen werden (${path}, HTTP ${status})`)
  }
}

export function loadJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = fetch(BASE + path, { cache: 'no-cache' }).then(async (res) => {
      if (!res.ok) throw new DataError(path, res.status)
      return (await res.json()) as T
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p
}

export interface Loadable<T> {
  data: T | null
  error: Error | null
  loading: boolean
}

export function useJson<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ data: null, error: null, loading: Boolean(path) })
  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false })
      return
    }
    let alive = true
    setState((s) => ({ data: s.data, error: null, loading: true }))
    loadJson<T>(path).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error: Error) => alive && setState({ data: null, error, loading: false }),
    )
    return () => {
      alive = false
    }
  }, [path])
  return state
}

export const useMeta = () => useJson<MetaFile>('meta.json')
export const useStations = () => useJson<FuelStationsFile>('fuel/stations.json')
export const useFuelLatest = () => useJson<FuelLatestFile>('fuel/latest.json')
export const useFuelHistory = () => useJson<FuelHistoryFile>('fuel/history.json')
export const useShopIndex = () => useJson<ShopIndexFile>('shops/index.json')
export const useHighlights = () => useJson<HighlightsFile>('shops/highlights.json')
export const useSpot = () => useJson<SpotPriceFile>('energy/spot.json')
export const useHeatingOil = () => useJson<DailySeriesFile>('energy/heatingoil.json')
export const usePellets = () => useJson<MonthlySeriesFile>('energy/pellets.json')
export const useTariffs = () => useJson<TariffFile>('energy/tariffs.json')

export const loadShop = (store: StoreId) => loadJson<ShopLatestFile>(`shops/${store}/latest.json`)

export function loadProductHistory(store: StoreId, id: string) {
  return loadJson<ShopHistoryBucket>(`shops/${store}/history/${historyBucket(id)}.json`).then((b) => b[id] ?? [])
}

/* --------------------------- Produkte als Objekte --------------------------- */

export interface Product {
  store: StoreId
  id: string
  name: string
  brand: string
  category: string
  quantity: string
  price: number
  regularPrice: number
  unitPrice: number
  baseUnit: string
  promo: string
  url: string
  image: string
  previousPrice: number
  changedDay: number
  minPrice: number
  maxPrice: number
  firstSeenDay: number
  /** Vorberechneter, normalisierter Suchtext */
  haystack: string
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
}

export function toProduct(file: Pick<ShopLatestFile, 'store' | 'urlPrefix' | 'imagePrefix'>, t: ProductTuple): Product {
  return {
    store: file.store,
    id: t[0],
    name: t[1],
    brand: t[2],
    category: t[3],
    quantity: t[4],
    price: t[5],
    regularPrice: t[6],
    unitPrice: t[7],
    baseUnit: t[8],
    promo: t[9],
    url: t[10] ? (t[10].startsWith('http') ? t[10] : file.urlPrefix + t[10]) : '',
    image: t[11] ? (t[11].startsWith('http') ? t[11] : file.imagePrefix + t[11]) : '',
    previousPrice: t[12],
    changedDay: t[13],
    minPrice: t[14],
    maxPrice: t[15],
    firstSeenDay: t[16],
    haystack: ' ' + normalize(`${t[2]} ${t[1]} ${t[3]}`),
  }
}

const productCache = new Map<StoreId, Promise<Product[]>>()

export function loadProducts(store: StoreId): Promise<Product[]> {
  let p = productCache.get(store)
  if (!p) {
    p = loadShop(store).then((file) => file.items.map((t) => toProduct(file, t)))
    p.catch(() => productCache.delete(store))
    productCache.set(store, p)
  }
  return p
}

/** Lädt die Sortimente mehrerer Händler; liefert Teilergebnisse, sobald einzelne Händler fertig sind. */
export function useProducts(stores: StoreId[]): { products: Product[]; loaded: StoreId[]; failed: StoreId[]; loading: boolean } {
  const key = stores.join(',')
  const [state, setState] = useState<{ byStore: Partial<Record<StoreId, Product[]>>; failed: StoreId[] }>({
    byStore: {},
    failed: [],
  })
  useEffect(() => {
    let alive = true
    setState({ byStore: {}, failed: [] })
    for (const s of stores) {
      loadProducts(s).then(
        (list) => alive && setState((prev) => ({ ...prev, byStore: { ...prev.byStore, [s]: list } })),
        () => alive && setState((prev) => ({ ...prev, failed: [...prev.failed, s] })),
      )
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const loaded = stores.filter((s) => state.byStore[s])
  const products = loaded.flatMap((s) => state.byStore[s]!)
  return { products, loaded, failed: state.failed, loading: loaded.length + state.failed.length < stores.length }
}

export function productKey(p: { store: StoreId; id: string }): string {
  return `${p.store}:${p.id}`
}
