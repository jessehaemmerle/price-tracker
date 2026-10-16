import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'gspart.'

/**
 * Zuletzt geschriebene Werte im Arbeitsspeicher. localStorage kann fehlen oder
 * werfen (privates Fenster, gesperrte Website-Daten) – dann arbeitet die Seite
 * mit diesen Werten weiter, bis sie neu geladen wird.
 */
const memory = new Map<string, unknown>()

export function readStored<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStored<T>(key: string, value: T): void {
  memory.set(key, value)
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* Speicher nicht verfügbar – ignorieren */
  }
}

const listeners = new Map<string, Set<(v: unknown) => void>>()

/** useState, das in localStorage gespiegelt und zwischen Komponenten synchron gehalten wird. */
export function useStoredState<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))

  useEffect(() => {
    const set = listeners.get(key) ?? new Set()
    const fn = (v: unknown) => setValue(v as T)
    set.add(fn)
    listeners.set(key, set)
    const onStorage = (e: StorageEvent) => {
      // Änderung aus einem anderen Tab: Arbeitsspeicher-Stand verwerfen
      if (e.key === PREFIX + key) {
        memory.delete(key)
        setValue(readStored(key, fallback))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      set.delete(fn)
      window.removeEventListener('storage', onStorage)
    }
    // fallback absichtlich nicht als Abhängigkeit – er ist nur der Startwert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(readStored(key, fallback)) : next
      writeStored(key, resolved)
      for (const fn of listeners.get(key) ?? []) fn(resolved)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  return [value, update]
}
