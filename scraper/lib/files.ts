import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

let dataDir = resolve(process.env.DATA_DIR ?? 'data')

export function setDataDir(dir: string): void {
  dataDir = resolve(dir)
}

export function dataPath(...parts: string[]): string {
  return join(dataDir, ...parts)
}

export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(dataPath(rel), 'utf8')) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw err
  }
}

/**
 * JSON atomar schreiben (erst temporäre Datei, dann umbenennen), damit ein
 * abgebrochener Lauf nie eine halbe Datei hinterlässt.
 *
 * `lines: true` schreibt Arrays/Objekte der obersten Ebene zeilenweise – so
 * bleiben Git-Diffs im Daten-Branch klein, weil sich pro Tag nur wenige
 * Zeilen ändern.
 */
export async function writeJson(rel: string, value: unknown, opts: { lines?: boolean } = {}): Promise<void> {
  const path = dataPath(rel)
  await mkdir(dirname(path), { recursive: true })
  const text = opts.lines ? toLineJson(value) : JSON.stringify(value)
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, text + '\n', 'utf8')
  await rename(tmp, path)
}

function toLineJson(value: unknown): string {
  if (Array.isArray(value)) return '[\n' + value.map((v) => JSON.stringify(v)).join(',\n') + '\n]'
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
      // Große Arrays (z. B. items) zusätzlich zeilenweise.
      if (Array.isArray(v) && v.length > 20) return `${JSON.stringify(k)}: ${toLineJson(v)}`
      return `${JSON.stringify(k)}: ${JSON.stringify(v)}`
    })
    return '{\n' + entries.join(',\n') + '\n}'
  }
  return JSON.stringify(value)
}
