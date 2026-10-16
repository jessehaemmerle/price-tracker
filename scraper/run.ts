/**
 * Einstiegspunkt für alle Datenläufe.
 *
 *   tsx scraper/run.ts fuel
 *   tsx scraper/run.ts shops --only=spar,dm
 *   tsx scraper/run.ts energy
 *   tsx scraper/run.ts alerts
 *   tsx scraper/run.ts all --data=./data
 *
 * Jede Quelle läuft unabhängig: Fällt eine aus, bleiben ihre letzten guten
 * Daten erhalten und `meta.json` vermerkt den Fehler.
 */
import { readdir } from 'node:fs/promises'
import {
  HISTORY_BUCKETS,
  dayNumber,
  type DailySeriesFile,
  type FuelHistoryFile,
  type FuelLatestFile,
  type FuelStationsFile,
  type HighlightsFile,
  type MetaFile,
  type ShopHistoryBucket,
  type ShopIndexFile,
  type ProductTuple,
  type ShopLatestFile,
  type SpotPriceFile,
  type StoreInfo,
  type TariffFile,
} from '../shared/types'
import { TRACKED_STORES } from '../shared/stores'
import { dataPath, readJson, setDataDir, writeJson } from './lib/files'
import { mergeShopSnapshot, pruneHistory } from './lib/shopHistory'
import { formatReport, validateProducts } from './lib/validate'
import { runAlerts } from './alerts'
import { billa } from './sources/billa'
import { bipa } from './sources/bipa'
import { dm } from './sources/dm'
import { runHeatingOil, runPellets, runSpot, runTariffs } from './sources/energy'
import { runFuel } from './sources/fuel'
import { obi } from './sources/jsonld'
import { spar } from './sources/spar'
import type { ShopSource } from './sources/types'

const SHOP_SOURCES: ShopSource[] = [spar, billa, dm, bipa, obi]

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)

let metaQueue: Promise<void> = Promise.resolve()

/** meta.json wird von parallel laufenden Quellen aktualisiert – darum nacheinander schreiben. */
function updateMeta(source: string, ok: boolean, message?: string): Promise<void> {
  metaQueue = metaQueue.then(async () => {
    const meta = await readJson<MetaFile>('meta.json', { updatedAt: '', sources: {} })
    const now = new Date().toISOString()
    const prev = meta.sources[source]
    meta.sources[source] = ok ? { ok, updatedAt: now } : { ok, updatedAt: prev?.updatedAt ?? null, message }
    meta.updatedAt = now
    await writeJson('meta.json', meta)
  })
  return metaQueue
}

async function guarded(source: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn()
    await updateMeta(source, true)
    return true
  } catch (err) {
    const message = (err as Error).message ?? String(err)
    log(`FEHLER ${source}: ${message}`)
    await updateMeta(source, false, message)
    return false
  }
}

async function fuelTask(): Promise<boolean> {
  return guarded('fuel', async () => {
    const result = await runFuel(
      {
        stations: await readJson<FuelStationsFile | null>('fuel/stations.json', null),
        latest: await readJson<FuelLatestFile | null>('fuel/latest.json', null),
        history: await readJson<FuelHistoryFile | null>('fuel/history.json', null),
      },
      log,
    )
    await writeJson('fuel/stations.json', result.stations, { lines: true })
    await writeJson('fuel/latest.json', result.latest)
    await writeJson('fuel/history.json', result.history)
  })
}

async function loadBuckets(store: string): Promise<ShopHistoryBucket[]> {
  let files: string[] = []
  try {
    files = await readdir(dataPath('shops', store, 'history'))
  } catch {
    return []
  }
  if (!files.length) return []
  const buckets: ShopHistoryBucket[] = []
  for (let i = 0; i < HISTORY_BUCKETS; i++) buckets.push(await readJson<ShopHistoryBucket>(`shops/${store}/history/${i}.json`, {}))
  return buckets
}

/** true, wenn mindestens ein Händler erfolgreich aktualisiert wurde. */
async function shopTask(only: string[] | null): Promise<boolean> {
  const index = await readJson<ShopIndexFile>('shops/index.json', { updatedAt: '', stores: [] })
  const byId = new Map(index.stores.map((s) => [s.id, s]))
  // Nach jedem Händler schreiben, damit ein Abbruch keinen veralteten Index hinterlässt.
  const writeIndex = () => {
    const stores = TRACKED_STORES.map((s) => byId.get(s.id)).filter((s): s is StoreInfo => Boolean(s))
    return writeJson('shops/index.json', { updatedAt: new Date().toISOString(), stores } satisfies ShopIndexFile)
  }
  let anyOk = false
  for (const source of SHOP_SOURCES) {
    if (only && !only.includes(source.id)) continue
    const meta = TRACKED_STORES.find((s) => s.id === source.id)!
    const ok = await guarded(source.id, async () => {
      const started = Date.now()
      const previous = await readJson<ShopLatestFile | null>(`shops/${source.id}/latest.json`, null)
      const raw = await source.fetch(log)
      const { items, report } = validateProducts(raw, { minCount: source.minCount, previousCount: previous?.items.length })
      log(formatReport(source.id, report))
      const now = new Date()
      const day = dayNumber(now)
      const merged = mergeShopSnapshot({
        store: source.id,
        day,
        now: now.toISOString(),
        urlPrefix: source.urlPrefix,
        imagePrefix: source.imagePrefix,
        items,
        previous,
        buckets: await loadBuckets(source.id),
      })
      pruneHistory(merged.buckets, day)
      await writeJson(`shops/${source.id}/latest.json`, merged.latest, { lines: true })
      for (let i = 0; i < merged.buckets.length; i++) {
        await writeJson(`shops/${source.id}/history/${i}.json`, merged.buckets[i])
      }
      byId.set(source.id, {
        id: source.id,
        name: meta.name,
        category: meta.category,
        coverage: meta.coverage,
        count: merged.latest.items.length,
        updatedAt: merged.latest.updatedAt,
      })
      log(
        `${source.id}: ${merged.latest.items.length} Produkte, ${merged.changed} Preisänderungen, ` +
          `${merged.added} neu, ${merged.removed} entfallen (${Math.round((Date.now() - started) / 1000)} s)`,
      )
    })
    if (ok) anyOk = true
    else {
      const prev = byId.get(source.id)
      const message = (await readJson<MetaFile>('meta.json', { updatedAt: '', sources: {} })).sources[source.id]?.message
      byId.set(source.id, {
        ...(prev ?? { id: source.id, name: meta.name, category: meta.category, coverage: meta.coverage, count: 0, updatedAt: null }),
        stale: true,
        error: message,
      } satisfies StoreInfo)
    }
    await writeIndex()
  }
  await writeIndex()
  await writeHighlights()
  return anyOk
}

/** Startseiten-Auswahl aus allen Händlern: größte Preissenkungen und Rabatte. */
async function writeHighlights(): Promise<void> {
  const highlights: HighlightsFile = { updatedAt: new Date().toISOString(), prefixes: {}, drops: [], deals: [] }
  const today = dayNumber()
  for (const store of TRACKED_STORES) {
    const file = await readJson<ShopLatestFile | null>(`shops/${store.id}/latest.json`, null)
    if (!file) continue
    highlights.prefixes[store.id] = { url: file.urlPrefix, image: file.imagePrefix }
    for (const item of file.items) {
      // Preissenkung innerhalb der letzten zwei Tage, mindestens 5 %
      if (item[12] > item[5] && item[13] >= today - 1 && item[5] <= item[12] * 0.95) highlights.drops.push({ store: store.id, item })
      if (item[6] > item[5] && item[5] <= item[6] * 0.8) highlights.deals.push({ store: store.id, item })
    }
  }
  const dropRatio = (x: { item: ProductTuple }) => x.item[5] / x.item[12]
  const dealRatio = (x: { item: ProductTuple }) => x.item[5] / x.item[6]
  highlights.drops = highlights.drops.sort((a, b) => dropRatio(a) - dropRatio(b)).slice(0, 60)
  highlights.deals = highlights.deals.sort((a, b) => dealRatio(a) - dealRatio(b)).slice(0, 60)
  await writeJson('shops/highlights.json', highlights)
}

async function energyTask(): Promise<boolean> {
  const results = await Promise.all([
    guarded('spot', async () => {
      await writeJson('energy/spot.json', await runSpot(await readJson<SpotPriceFile | null>('energy/spot.json', null), log))
    }),
    guarded('heatingoil', async () => {
      const prev = await readJson<DailySeriesFile | null>('energy/heatingoil.json', null)
      await writeJson('energy/heatingoil.json', await runHeatingOil(prev, log))
    }),
    guarded('pellets', async () => {
      await writeJson('energy/pellets.json', await runPellets(log))
    }),
    guarded('tariffs', async () => {
      const prev = await readJson<TariffFile | null>('energy/tariffs.json', null)
      await writeJson('energy/tariffs.json', await runTariffs(prev, log))
    }),
  ])
  return results.every(Boolean)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const tasks = args.filter((a) => !a.startsWith('--'))
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const dir = flag('data')
  if (dir) setDataDir(dir)
  const only = flag('only')?.split(',') ?? null
  if (!tasks.length) {
    console.error('Aufruf: tsx scraper/run.ts <fuel|shops|energy|alerts|all> [--only=spar,dm] [--data=./data]')
    process.exit(2)
  }
  const want = (t: string) => tasks.includes(t) || tasks.includes('all')
  const outcomes: boolean[] = []
  if (want('fuel')) outcomes.push(await fuelTask())
  if (want('energy')) outcomes.push(await energyTask())
  if (want('shops')) outcomes.push(await shopTask(only))
  if (want('alerts')) await runAlerts(log)
  // Nur scheitern, wenn gar nichts geklappt hat – Teilerfolge sollen trotzdem committet werden.
  if (outcomes.length && outcomes.every((o) => !o)) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
