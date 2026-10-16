import { readFile } from 'node:fs/promises'
import {
  FUEL_LABELS,
  type AlertRule,
  type AlertsConfig,
  type AlertsState,
  type DailySeriesFile,
  type FuelLatestFile,
  type FuelStationsFile,
  type ShopLatestFile,
  type SpotPriceFile,
} from '../shared/types'
import { storeName } from '../shared/stores'
import { readJson, writeJson } from './lib/files'
import { USER_AGENT } from './lib/http'
import type { Logger } from './sources/types'

export interface AlertHit {
  value: number
  title: string
  message: string
  click?: string
}

const eur = (v: number, digits = 2) => v.toLocaleString('de-AT', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export interface AlertData {
  stations: FuelStationsFile | null
  fuel: FuelLatestFile | null
  spot: SpotPriceFile | null
  heatingOil: DailySeriesFile | null
  shop: (store: string) => Promise<ShopLatestFile | null>
  now: Date
}

/** Prüft eine Regel gegen die aktuellen Daten. `null` = Schwelle nicht erreicht. */
export async function evaluateRule(rule: AlertRule, d: AlertData, siteUrl = ''): Promise<AlertHit | null> {
  switch (rule.type) {
    case 'fuel': {
      if (!d.fuel || !d.stations) return null
      const candidates = d.stations.stations.filter(
        (s) =>
          (!rule.stations?.length || rule.stations.includes(s.id)) &&
          (!rule.postalCodes?.length || rule.postalCodes.includes(s.postalCode)) &&
          (!rule.districts?.length || rule.districts.includes(s.district)),
      )
      let best: { price: number; name: string; city: string } | null = null
      for (const s of candidates) {
        const price = d.fuel.prices[String(s.id)]?.[rule.fuel]
        if (typeof price === 'number' && (!best || price < best.price)) best = { price, name: s.name, city: s.city }
      }
      if (!best || best.price > rule.below) return null
      return {
        value: best.price,
        title: `${FUEL_LABELS[rule.fuel]} um ${eur(best.price, 3)} €`,
        message: `${best.name}, ${best.city} – unter deiner Schwelle von ${eur(rule.below, 3)} €.`,
        click: siteUrl ? `${siteUrl}#/sprit` : undefined,
      }
    }
    case 'product': {
      const file = await d.shop(rule.store)
      const item = file?.items.find((t) => t[0] === rule.product)
      if (!item) return null
      const price = item[5] / 100
      if (price > rule.below) return null
      return {
        value: price,
        title: `${item[1]} um ${eur(price)} €`,
        message: `${storeName(rule.store)}${item[9] ? ` · ${item[9]}` : ''} – unter deiner Schwelle von ${eur(rule.below)} €.`,
        click: file && item[10] ? (item[10].startsWith('http') ? item[10] : file.urlPrefix + item[10]) : undefined,
      }
    }
    case 'spot': {
      if (!d.spot) return null
      const nowTs = Math.floor(d.now.getTime() / 1000)
      const upcoming = d.spot.hours.filter(([t]) => t >= nowTs - 3600 && t <= nowTs + 36 * 3600)
      if (!upcoming.length) return null
      const [t, ct] = upcoming.reduce((a, b) => (b[1] < a[1] ? b : a))
      if (ct > rule.belowCt) return null
      const when = new Date(t * 1000).toLocaleString('de-AT', {
        timeZone: 'Europe/Vienna',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
      return {
        value: ct,
        title: `Strom-Börsenpreis ${eur(ct)} ct/kWh`,
        message: `Günstigste Stunde: ${when} Uhr (netto, ohne Netz und Abgaben).`,
        click: siteUrl ? `${siteUrl}#/energie` : undefined,
      }
    }
    case 'heatingoil': {
      const last = d.heatingOil?.series[d.heatingOil.series.length - 1]
      if (!last || last[1] > rule.below) return null
      return {
        value: last[1],
        title: `Heizöl um ${eur(last[1])} € pro 100 l`,
        message: `Österreich-Durchschnitt unter deiner Schwelle von ${eur(rule.below)} €.`,
        click: siteUrl ? `${siteUrl}#/energie` : undefined,
      }
    }
  }
}

/**
 * Erneut melden, wenn der Wert seit der letzten Meldung weiter gefallen ist
 * oder die letzte Meldung länger als 24 Stunden zurückliegt.
 */
export function shouldNotify(prev: AlertsState[string] | undefined, value: number, now: Date): boolean {
  if (!prev) return true
  if (value < prev.value - 1e-9) return true
  return now.getTime() - new Date(prev.at).getTime() > 24 * 3600 * 1000
}

async function sendNtfy(hit: AlertHit, server: string, topic: string, token?: string): Promise<void> {
  const res = await fetch(server.replace(/\/$/, ''), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      topic,
      title: hit.title,
      message: hit.message,
      tags: ['moneybag'],
      priority: 4,
      ...(hit.click ? { click: hit.click } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`ntfy antwortete mit HTTP ${res.status}`)
}

export async function runAlerts(log: Logger, configPath = process.env.ALERTS_CONFIG ?? 'config/alerts.json'): Promise<void> {
  const topic = process.env.NTFY_TOPIC
  if (!topic) {
    log('alerts: NTFY_TOPIC ist nicht gesetzt – Push-Alarme übersprungen')
    return
  }
  let config: AlertsConfig
  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as AlertsConfig
  } catch (err) {
    log(`alerts: ${configPath} nicht lesbar (${(err as Error).message}) – übersprungen`)
    return
  }
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh'
  const now = new Date()
  const shopCache = new Map<string, Promise<ShopLatestFile | null>>()
  const data: AlertData = {
    stations: await readJson<FuelStationsFile | null>('fuel/stations.json', null),
    fuel: await readJson<FuelLatestFile | null>('fuel/latest.json', null),
    spot: await readJson<SpotPriceFile | null>('energy/spot.json', null),
    heatingOil: await readJson<DailySeriesFile | null>('energy/heatingoil.json', null),
    shop: (store) => {
      if (!shopCache.has(store)) shopCache.set(store, readJson<ShopLatestFile | null>(`shops/${store}/latest.json`, null))
      return shopCache.get(store)!
    },
    now,
  }
  const state = await readJson<AlertsState>('alerts-state.json', {})
  const next: AlertsState = {}
  for (const rule of config.rules ?? []) {
    const hit = await evaluateRule(rule, data, config.siteUrl)
    if (!hit) continue
    if (shouldNotify(state[rule.id], hit.value, now)) {
      try {
        await sendNtfy(hit, server, topic, process.env.NTFY_TOKEN)
        next[rule.id] = { value: hit.value, at: now.toISOString() }
        log(`alerts: gemeldet – ${rule.id}: ${hit.title}`)
      } catch (err) {
        log(`alerts: Senden fehlgeschlagen für ${rule.id}: ${(err as Error).message}`)
        if (state[rule.id]) next[rule.id] = state[rule.id]
      }
    } else {
      next[rule.id] = state[rule.id]
    }
  }
  await writeJson('alerts-state.json', next)
}
