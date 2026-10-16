import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Uhr auf den Stand der Testdaten setzen, damit "heute" zu den Daten passt.
const FIXTURE_NOW = new Date(JSON.parse(readFileSync('tests/fixtures/data/fuel/latest.json', 'utf8')).updatedAt)
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXTURE_NOW)
})

const ROUTES = [
  { path: '/', heading: 'Heute günstig tanken in Vorarlberg' },
  { path: '/sprit', heading: 'Spritpreise in Vorarlberg' },
  { path: '/einkaufen', heading: 'Einkaufen' },
  { path: '/einkaufen/aktionen', heading: 'Einkaufen' },
  { path: '/einkaufen/warenkorb', heading: 'Einkaufen' },
  { path: '/einkaufen/flugblaetter', heading: 'Einkaufen' },
  { path: '/energie', heading: 'Energie' },
  { path: '/merkliste', heading: 'Merkliste und Preisalarm' },
  { path: '/info', heading: 'Datenquellen und Grenzen' },
]

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  return errors
}

for (const route of ROUTES) {
  test(`${route.path} lädt ohne Fehler und ohne schwere Barrierefreiheitsprobleme`, async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto(`/#${route.path}`)
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, 'kein horizontales Scrollen').toBe(false)
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      // Kartenkacheln stammen von basemap.at und sind nicht Teil der Seite.
      .exclude('.leaflet-tile-pane')
      .analyze()
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}×)`)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('Spritpreise: Sortenwahl und Merken funktionieren', async ({ page }) => {
  await page.goto('/#/sprit')
  const first = page.locator('.station-row').first()
  await expect(first).toBeVisible()
  await page.getByRole('button', { name: 'Super 95' }).click()
  await expect(page).toHaveURL(/sorte=SUP/)
  await first.getByRole('button', { name: /merken/ }).click()
  await page.goto('/#/merkliste')
  await expect(page.locator('.watch-row')).toHaveCount(1)
})

test('Produktsuche findet Treffer und öffnet die Detailseite', async ({ page }) => {
  await page.goto('/#/einkaufen')
  await page.getByRole('searchbox', { name: 'Produkt suchen' }).fill('milch')
  const firstLink = page.locator('.product-row__name').first()
  await expect(firstLink).toBeVisible()
  const name = await firstLink.textContent()
  await firstLink.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name!)
  await expect(page.getByRole('heading', { name: 'Preisverlauf' })).toBeVisible()
})

test('Warenkorb vergleicht Händler', async ({ page }) => {
  await page.goto('/#/einkaufen/warenkorb')
  await page.getByLabel('Artikel hinzufügen').fill('Milch')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(page.locator('.basket-total').first()).toBeVisible()
  await expect(page.getByRole('table', { name: /Warenkorb/ })).toBeVisible()
})

test('Diagramme sind per Tastatur bedienbar', async ({ page }) => {
  await page.goto('/#/energie')
  const chart = page.getByRole('img', { name: /Strom-Börsenpreis je Stunde/ })
  await chart.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.chart__tooltip').first()).toBeVisible()
})
