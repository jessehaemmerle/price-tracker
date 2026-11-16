import type { StoreCategory, StoreId } from './types'

export interface TrackedStore {
  id: StoreId
  name: string
  category: StoreCategory
  coverage: 'voll' | 'auswahl' | 'angebote'
  offersUrl: string
}

/** Händler, deren Online-Preise automatisch erfasst werden. */
export const TRACKED_STORES: TrackedStore[] = [
  { id: 'billa', name: 'BILLA', category: 'lebensmittel', coverage: 'voll', offersUrl: 'https://shop.billa.at/aktionen' },
  {
    id: 'kaufland',
    name: 'Kaufland Lindau',
    category: 'lebensmittel',
    coverage: 'angebote',
    offersUrl: 'https://filiale.kaufland.de/angebote/uebersicht.html',
  },
  { id: 'dm', name: 'dm', category: 'drogerie', coverage: 'voll', offersUrl: 'https://www.dm.at/angebote' },
  { id: 'bipa', name: 'BIPA', category: 'drogerie', coverage: 'voll', offersUrl: 'https://www.bipa.at/' },
  { id: 'obi', name: 'OBI', category: 'baumarkt', coverage: 'auswahl', offersUrl: 'https://www.obi.at/angebote' },
]

export interface LinkedStore {
  name: string
  category: StoreCategory | 'elektronik'
  url: string
  note: string
}

/**
 * Händler ohne automatisch abrufbare Online-Preise (Bot-Schutz oder kein
 * Online-Shop). Für sie gibt es nur einen Link zum aktuellen Flugblatt.
 */
export const LINKED_STORES: LinkedStore[] = [
  {
    name: 'SPAR',
    category: 'lebensmittel',
    url: 'https://www.spar.at/produktwelt/',
    note: 'Produktwelt mit Preisen und Angeboten (automatischer Abruf gesperrt)',
  },
  { name: 'HOFER', category: 'lebensmittel', url: 'https://www.hofer.at/de/angebote.html', note: 'Wochenangebote' },
  { name: 'Lidl', category: 'lebensmittel', url: 'https://www.lidl.at/', note: 'Angebote und Flugblatt' },
  { name: 'PENNY', category: 'lebensmittel', url: 'https://www.penny.at/angebote', note: 'Wochenangebote' },
  {
    name: 'MPREIS',
    category: 'lebensmittel',
    url: 'https://www.mpreis.at/aktionen/aktuell/alle-produkte-in-aktion',
    note: 'Aktuelle Aktionen',
  },
  {
    name: 'Sutterlüty',
    category: 'lebensmittel',
    url: 'https://www.sutterluety.at/flugblatt-jetzt-online/',
    note: 'Flugblatt des Vorarlberger Nahversorgers',
  },
  { name: 'Müller', category: 'drogerie', url: 'https://www.mueller.at/', note: 'Drogerie, Parfümerie, Spielwaren' },
  { name: 'MediaMarkt', category: 'elektronik', url: 'https://www.mediamarkt.at/', note: 'Angebote online' },
  { name: 'Hartlauer', category: 'elektronik', url: 'https://www.hartlauer.at/', note: 'Elektronik, Foto, Optik' },
  { name: 'Expert', category: 'elektronik', url: 'https://www.expert.at/', note: 'Elektrohandel' },
  { name: 'EP:', category: 'elektronik', url: 'https://www.ep.at/angebote', note: 'Elektrohandel' },
  { name: 'HORNBACH', category: 'baumarkt', url: 'https://www.hornbach.at/angebote/', note: 'Baumarkt-Angebote' },
  {
    name: 'Alle Flugblätter',
    category: 'lebensmittel',
    url: 'https://www.aktionsfinder.at/',
    note: 'Flugblatt-Sammlung aller Händler (aktionsfinder.at)',
  },
]

export const CATEGORY_LABELS: Record<StoreCategory | 'elektronik', string> = {
  lebensmittel: 'Lebensmittel',
  drogerie: 'Drogerie',
  baumarkt: 'Baumarkt',
  elektronik: 'Elektronik',
}

export function storeName(id: StoreId): string {
  return TRACKED_STORES.find((s) => s.id === id)?.name ?? id
}

/** Händler, von denen nur Wochenangebote vorliegen (kein Gesamtsortiment). */
export function isOffersOnly(id: StoreId): boolean {
  return TRACKED_STORES.find((s) => s.id === id)?.coverage === 'angebote'
}
