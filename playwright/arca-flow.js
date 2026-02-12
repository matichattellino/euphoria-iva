/**
 * Script generado por Playwright Codegen (referencia).
 * NO ejecutar directamente — usar src/scraper/arca-scraper.js en su lugar.
 *
 * Este archivo documenta el flujo exacto capturado en ARCA:
 * Login → Mis Comprobantes (popup) → Emitidos → CSV → Recibidos → CSV
 */
import { test, expect } from '@playwright/test';
test('test', async ({ page }) => {
  await page.goto('https://auth.afip.gob.ar/contribuyente_/login.xhtml');
  await page.getByRole('spinbutton').click();
  await page.getByRole('spinbutton').fill('27359538931');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('textbox', { name: 'TU CLAVE' }).click();
  await page.getByRole('textbox', { name: 'TU CLAVE' }).fill('1');
  await page.getByRole('textbox', { name: 'TU CLAVE' }).press('CapsLock');
  await page.getByRole('textbox', { name: 'TU CLAVE' }).fill('1Natacha111');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  const page1Promise = page.waitForEvent('popup');
  await page.locator('a').filter({ hasText: 'Mis Comprobantes' }).click();
  const page1 = await page1Promise;
  await page1.getByRole('link', { name: '  Emitidos Comprobantes' }).click();
  await page1.getByRole('textbox', { name: 'Fecha del Comprobante *' }).click();
  await page1.getByRole('columnheader').first().click();
  await page1.getByRole('cell', { name: '1' }).nth(1).click();
  await page1.locator('.calendar.right > .calendar-table > .table-condensed > thead > tr > .prev > .fa').click();
  await page1.locator('.calendar.right > .calendar-table > .table-condensed > thead > tr > .prev > .fa').click();
  await page1.getByRole('cell', { name: '31' }).nth(3).click();
  await page1.getByRole('button', { name: 'Aplicar' }).click();
  await page1.getByRole('button', { name: 'Buscar' }).click();
  const downloadPromise = page1.waitForEvent('download');
  await page1.getByRole('button', { name: 'CSV' }).click();
  const download = await downloadPromise;
  await page1.locator('div').filter({ hasText: 'Consulta Resultados Historial' }).first().click();
  await page1.getByRole('link', { name: 'Menú Principal' }).click();
  await page1.getByRole('link', { name: '  Recibidos Comprobantes' }).click();
  await page1.getByText('Fecha del Comprobante * Rango').click();
  await page1.getByRole('row', { name: ' Febrero' }).locator('i').click();
  await page1.getByRole('cell', { name: '1' }).nth(1).click();
  await page1.getByRole('columnheader').filter({ hasText: /^$/ }).nth(2).click();
  await page1.getByRole('columnheader').filter({ hasText: /^$/ }).nth(2).click();
  await page1.getByRole('cell', { name: '31' }).nth(3).click();
  await page1.getByRole('button', { name: 'Aplicar' }).click();
  await page1.getByRole('button', { name: 'Buscar' }).click();
  const download1Promise = page1.waitForEvent('download');
  await page1.getByRole('button', { name: 'CSV' }).click();
  const download1 = await download1Promise;
});
