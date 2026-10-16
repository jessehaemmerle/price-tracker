import type { StoreId } from '../../shared/types'
import type { RawProduct } from '../lib/validate'

export type Logger = (msg: string) => void

export interface ShopSource {
  id: StoreId
  /** Wird von Produkt-URLs abgeschnitten und im Frontend wieder vorangestellt. */
  urlPrefix: string
  imagePrefix: string
  /** Weniger gültige Produkte gilt als Fehler (Schutz vor kaputten Läufen). */
  minCount: number
  fetch(log: Logger): Promise<RawProduct[]>
}
