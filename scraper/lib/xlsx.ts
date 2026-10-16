import { strFromU8, unzipSync } from 'fflate'

/**
 * Minimaler XLSX-Leser für einfache Tabellen: liefert das erste Tabellenblatt
 * als Map "C5" → Wert (Zahl oder Text). Für die Pelletpreis-Tabelle reicht das.
 */
export function readFirstSheet(bytes: Uint8Array): Map<string, string | number> {
  const files = unzipSync(bytes)
  const shared: string[] = []
  const sst = files['xl/sharedStrings.xml']
  if (sst) {
    for (const si of strFromU8(sst).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...si[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''))
    }
  }
  const sheet = files['xl/worksheets/sheet1.xml']
  if (!sheet) throw new Error('XLSX ohne sheet1.xml')
  const cells = new Map<string, string | number>()
  for (const c of strFromU8(sheet).matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, attrs, inner] = c
    const v = inner?.match(/<v>([^<]*)<\/v>/)?.[1]
    if (v === undefined) continue
    cells.set(ref, /t="s"/.test(attrs) ? (shared[Number(v)] ?? '') : Number(v))
  }
  return cells
}

export function colToIndex(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

export function indexToCol(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
