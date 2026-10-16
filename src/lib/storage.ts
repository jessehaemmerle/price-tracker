import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'gspart.'

/**
 * localStorage kann fehlen oder werfen (privates Fenster, gesperrte
 * Website-Daten). Dann läuft die Seite einfach ohne Speicherung weiter.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStored<T>(key: string, value: T): void {
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
      if (e.key === PREFIX + key) setValue(readStored(key, fallback))
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
