/**
 * Erzeugt kleine Testdaten für die Browser-Tests aus einem echten Datenstand.
 *
 *   npx tsx tests/fixtures/build.ts [quelle=./data]
 *
 * Pro Händler werden ca. 120 Produkte übernommen (bevorzugt solche, die zu
 * typischen Suchbegriffen passen), dazu ihr Verlauf.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { HISTORY_BUCKETS, historyBucket, type ShopHistoryBucket, type ShopIndexFile, type ShopLatestFile } from '../../shared/types'

const src = process.argv[2] ?? 'data'
const out = 'tests/fixtures/data'
const WORDS = ['milch', 'butter', 'kaffee', 'brot', 'banane', 'zahnpasta', 'shampoo', 'windel', 'waschmittel', 'bohr', 'schraube']
const PER_STORE = 120

const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(join(src, p), 'utf8')) as T
const write = async (p: string, v: unknown) => {
  await mkdir(join(out, p, '..'), { recursive: true })
  await writeFile(join(out, p), JSON.stringify(v))
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })
for (const dir of ['fuel', 'energy']) await cp(join(src, dir), join(out, dir), { recursive: true })
await cp(join(src, 'meta.json'), join(out, 'meta.json'))

const index = await read<ShopIndexFile>('shops/index.json')
const stores: ShopIndexFile['stores'] = []
for (const info of index.stores) {
  const file = `shops/${info.id}/latest.json`
  if (!existsSync(join(src, file))) continue
  const latest = await read<ShopLatestFile>(file)
  const matching = latest.items.filter((t) => WORDS.some((w) => t[1].toLowerCase().includes(w)))
  const picked = [...matching.slice(0, PER_STORE * 0.75), ...latest.items.filter((t) => t[6] > t[5]).slice(0, PER_STORE * 0.25)]
  const unique = [...new Map(picked.map((t) => [t[0], t])).values()]
  await write(file, { ...latest, items: unique })
  const buckets: ShopHistoryBucket[] = Array.from({ length: HISTORY_BUCKETS }, () => ({}))
  for (let i = 0; i < HISTORY_BUCKETS; i++) {
    const p = `shops/${info.id}/history/${i}.json`
    if (existsSync(join(src, p))) {
      const b = await read<ShopHistoryBucket>(p)
      for (const t of unique) if (historyBucket(t[0]) === i && b[t[0]]) buckets[i][t[0]] = b[t[0]]
    }
  }
  for (let i = 0; i < HISTORY_BUCKETS; i++) await write(`shops/${info.id}/history/${i}.json`, buckets[i])
  stores.push({ ...info, count: unique.length, stale: false, error: undefined })
}
await write('shops/index.json', { ...index, stores })
if (existsSync(join(src, 'shops/highlights.json'))) await cp(join(src, 'shops/highlights.json'), join(out, 'shops/highlights.json'))
console.log(`Testdaten in ${out}: ${stores.map((s) => `${s.id} ${s.count}`).join(', ')}`)
