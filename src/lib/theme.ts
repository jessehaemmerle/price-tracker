import { useEffect, useState } from 'react'
import { useStoredState } from './storage'

export type ThemeChoice = 'system' | 'light' | 'dark'

export function useTheme(): [ThemeChoice, () => void] {
  const [theme, setTheme] = useStoredState<ThemeChoice>('theme', 'system')
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])
  const cycle = () => setTheme((t) => (t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system'))
  return [theme, cycle]
}

/** Tatsächlich aktives Farbschema (System oder manuelle Wahl), reagiert auf Wechsel. */
export function useIsDark(): boolean {
  const read = () => getComputedStyle(document.documentElement).colorScheme.includes('dark')
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setDark(read())
    mq.addEventListener('change', update)
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      mo.disconnect()
    }
  }, [])
  return dark
}
