#!/usr/bin/env node
/**
 * ARCA Scraper — Descarga CSVs de comprobantes emitidos y recibidos
 * desde "Mis Comprobantes" de ARCA (ex AFIP) usando Playwright.
 *
 * Uso:
 *   node src/scraper/arca-scraper.js --periodo 2026-01
 *   node src/scraper/arca-scraper.js --periodo 2026-02
 *
 * Variables de entorno requeridas (.env):
 *   ARCA_CUIT          — CUIT sin guiones (ej: 27359538931)
 *   ARCA_PASSWORD       — Clave de ARCA
 *   PLAYWRIGHT_HEADLESS — "true" (default) o "false" para debug visual
 */

const path = require('path');
const fs = require('fs');

// Cargar .env desde la raíz del proyecto
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: true });

const { chromium } = require('playwright');
const SELECTORS = require('./selectors');

// ─── Configuración ────────────────────────────────────────────────────
const ARCA_CUIT     = process.env.ARCA_CUIT || process.env.ARCA_USERNAME;
const ARCA_PASSWORD = process.env.ARCA_PASSWORD;
const HEADLESS      = (process.env.PLAYWRIGHT_HEADLESS || 'true') === 'true';

const TIMEOUT_NAV    = 60_000; // navegación / carga de página
const TIMEOUT_ACTION = 30_000; // clicks, fills, esperas de elementos
const TIMEOUT_DOWNLOAD = 60_000; // descarga de archivos CSV

const CSV_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'csv') : path.resolve(__dirname, '../../data/csv');

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Resuelve un descriptor de selector a un Playwright Locator.
 */
function locate(page, sel) {
  if (sel.role) {
    const opts = {};
    if (sel.name) opts.name = sel.name;
    return page.getByRole(sel.role, opts);
  }
  if (sel.locator) {
    let loc = page.locator(sel.locator);
    if (sel.filter) loc = loc.filter(sel.filter);
    return loc;
  }
  if (sel.text) {
    return page.getByText(sel.text);
  }
  throw new Error(`Selector inválido: ${JSON.stringify(sel)}`);
}

/**
 * Parsea "YYYY-MM" y devuelve primer y último día del mes en formato DD/MM/YYYY.
 */
function parsePeriodo(periodo) {
  const match = periodo.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Formato de período inválido: "${periodo}". Usar YYYY-MM (ej: 2026-01)`);

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) throw new Error(`Mes inválido: ${month}`);

  const primerDia = new Date(year, month - 1, 1);
  const ultimoDia = new Date(year, month, 0); // día 0 del mes siguiente = último día del mes actual

  const fmt = (d) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  return {
    desde: fmt(primerDia),
    hasta: fmt(ultimoDia),
    rangeStr: `${fmt(primerDia)} - ${fmt(ultimoDia)}`,
  };
}

/**
 * Lee argumentos de la línea de comandos.
 * --periodo YYYY-MM (obligatorio)
 * --desde DD/MM/YYYY (opcional, override del primer día del mes)
 * --hasta DD/MM/YYYY (opcional, override del último día del mes)
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const idxP = args.indexOf('--periodo');
  if (idxP === -1 || !args[idxP + 1]) {
    console.error('Uso: node src/scraper/arca-scraper.js --periodo YYYY-MM [--desde DD/MM/YYYY] [--hasta DD/MM/YYYY]');
    process.exit(1);
  }
  const periodo = args[idxP + 1];

  const idxD = args.indexOf('--desde');
  const idxH = args.indexOf('--hasta');
  const desde = (idxD !== -1 && args[idxD + 1]) ? args[idxD + 1] : null;
  const hasta = (idxH !== -1 && args[idxH + 1]) ? args[idxH + 1] : null;

  return { periodo, desde, hasta };
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('es-AR');
  console.log(`[${ts}] ${msg}`);
}

// ─── Pasos del scraper ───────────────────────────────────────────────

async function login(page) {
  log('Navegando al login de ARCA...');
  await page.goto(SELECTORS.login.url, { timeout: TIMEOUT_NAV, waitUntil: 'domcontentloaded' });

  log(`Ingresando CUIT: ${ARCA_CUIT}...`);
  const cuitInput = locate(page, SELECTORS.login.cuitInput);
  await cuitInput.click({ timeout: TIMEOUT_ACTION });
  await cuitInput.fill(ARCA_CUIT);

  log('Click en Siguiente...');
  await locate(page, SELECTORS.login.siguienteBtn).click({ timeout: TIMEOUT_ACTION });

  log('Ingresando contraseña...');
  const passInput = locate(page, SELECTORS.login.passwordInput);
  await passInput.waitFor({ state: 'visible', timeout: TIMEOUT_ACTION });
  await passInput.click();
  await passInput.fill(ARCA_PASSWORD);

  log('Click en Ingresar...');
  await locate(page, SELECTORS.login.ingresarBtn).click({ timeout: TIMEOUT_ACTION });

  // Esperar a que cargue el portal (la URL cambia después del login)
  try {
    await page.waitForURL('**/contribuyente/**', { timeout: TIMEOUT_NAV });
    log('Login exitoso.');
  } catch {
    // Si la URL no cambió, verificar si seguimos en la página de login
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      // Buscar mensaje de error con múltiples estrategias
      const errorText = await page.locator('.alert-danger, .error-message, [class*="error"], [class*="Error"], [style*="color: red"], .text-danger')
        .first()
        .textContent()
        .catch(() => null);

      // También buscar texto de error conocido de ARCA
      const claveIncorrecta = await page.getByText('Clave o usuario incorrecto')
        .isVisible()
        .catch(() => false);

      if (claveIncorrecta) {
        throw new Error('Login fallido: Clave o usuario incorrecto');
      }
      if (errorText) {
        throw new Error(`Login fallido: ${errorText.trim()}`);
      }
      throw new Error('Login fallido: la página no avanzó del login. Verificá las credenciales.');
    }
    // Si la URL cambió pero no matchea el patrón, puede estar ok
    log('Login exitoso (URL alternativa).');
  }
}

async function abrirMisComprobantes(page) {
  log('Buscando enlace "Mis Comprobantes"...');
  const link = locate(page, SELECTORS.portal.misComprobantesLink);
  await link.waitFor({ state: 'visible', timeout: TIMEOUT_NAV });

  // "Mis Comprobantes" abre un popup
  log('Abriendo Mis Comprobantes (popup)...');
  const popupPromise = page.waitForEvent('popup', { timeout: TIMEOUT_NAV });
  await link.click();
  const popup = await popupPromise;

  // Esperar a que el popup cargue
  await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
  log('Popup de Mis Comprobantes abierto.');

  return popup;
}

/**
 * Setea el rango de fechas en el daterangepicker de ARCA.
 *
 * Estrategia:
 * 1. Buscar TODOS los inputs con daterangepicker (via jQuery .data('daterangepicker'))
 * 2. Si no hay jQuery/daterangepicker, usar fill() + trigger de eventos JS
 * 3. Click en "Aplicar" para confirmar
 */
async function setDateRange(popup, section, rangeStr) {
  log(`Configurando rango de fechas: ${rangeStr}`);

  const fechaInput = locate(popup, section.fechaInput);
  await fechaInput.waitFor({ state: 'visible', timeout: TIMEOUT_ACTION });
  await fechaInput.click({ timeout: TIMEOUT_ACTION });

  // Esperar a que el daterangepicker se abra
  await popup.waitForTimeout(1500);

  // Intentar setear via jQuery daterangepicker API — buscar en TODOS los inputs
  const setViaAPI = await popup.evaluate((dateRange) => {
    const $ = window.jQuery || window.$;
    if (!$) return false;

    // Buscar cualquier input que tenga un daterangepicker asociado
    const allInputs = $('input');
    let found = false;
    allInputs.each(function () {
      const picker = $(this).data('daterangepicker');
      if (picker) {
        const parts = dateRange.split(' - ');
        picker.setStartDate(parts[0]);
        picker.setEndDate(parts[1]);
        $(this).val(dateRange);
        $(this).trigger('change').trigger('apply.daterangepicker', picker);
        found = true;
        return false; // break
      }
    });
    return found;
  }, rangeStr);

  if (setViaAPI) {
    log('Fechas seteadas via daterangepicker API.');
  } else {
    // Fallback: triple clear + fill + dispatch events para que el componente lo registre
    log('Daterangepicker API no disponible, usando fill() + eventos...');
    await fechaInput.click({ clickCount: 3 }); // select all
    await popup.keyboard.press('Backspace');
    await fechaInput.type(rangeStr, { delay: 50 }); // type char by char
    await popup.waitForTimeout(500);

    // Dispatch input/change events via JS para que el daterangepicker los capture
    await fechaInput.evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, rangeStr);
    await popup.waitForTimeout(500);
  }

  // Click en "Aplicar" para confirmar el rango
  log('Click en Aplicar...');
  await locate(popup, section.aplicarBtn).click({ timeout: TIMEOUT_ACTION });
  await popup.waitForTimeout(500);

  // Verificar que la fecha se aplicó correctamente
  const appliedValue = await fechaInput.inputValue().catch(() => '');
  if (appliedValue && !appliedValue.includes(rangeStr.split(' - ')[0].substring(3))) {
    log(`ADVERTENCIA: Fecha aplicada "${appliedValue}" no coincide con la solicitada "${rangeStr}"`);
  } else {
    log(`Fecha aplicada: "${appliedValue}"`);
  }
}

/**
 * Busca comprobantes y descarga el CSV.
 * Retorna el path del archivo descargado.
 */
async function buscarYDescargarCSV(popup, section, outputPath) {
  log('Click en Buscar...');
  await locate(popup, section.buscarBtn).click({ timeout: TIMEOUT_ACTION });

  // Esperar a que se carguen los resultados (la tabla o algún indicador)
  log('Esperando resultados...');
  await popup.waitForTimeout(5000); // ARCA puede tardar bastante

  // Esperar a que el botón CSV esté disponible (aparece cuando hay resultados)
  const csvBtn = locate(popup, section.csvBtn);
  await csvBtn.waitFor({ state: 'visible', timeout: TIMEOUT_NAV });

  // IMPORTANTE: registrar la espera de descarga ANTES de clickear CSV
  log('Descargando CSV...');
  const downloadPromise = popup.waitForEvent('download', { timeout: TIMEOUT_DOWNLOAD });
  await csvBtn.click({ timeout: TIMEOUT_ACTION });
  const download = await downloadPromise;

  // Guardar el archivo descargado
  await download.saveAs(outputPath);
  log(`CSV guardado en: ${outputPath}`);

  return outputPath;
}

async function volverAlMenu(popup) {
  log('Volviendo al menú principal...');
  const menuLink = locate(popup, SELECTORS.emitidos.menuPrincipalLink);
  await menuLink.waitFor({ state: 'visible', timeout: TIMEOUT_ACTION });
  await menuLink.click({ timeout: TIMEOUT_ACTION });
  await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
  log('En menú principal.');
}

// ─── Flujo principal ─────────────────────────────────────────────────

async function main() {
  // Validar configuración
  if (!ARCA_CUIT) {
    console.error('Error: ARCA_CUIT (o ARCA_USERNAME) no configurado en .env');
    process.exit(1);
  }
  if (!ARCA_PASSWORD) {
    console.error('Error: ARCA_PASSWORD no configurado en .env');
    process.exit(1);
  }

  const { periodo, desde: desdeOverride, hasta: hastaOverride } = parseArgs();
  const parsed = parsePeriodo(periodo);
  // Usar fechas custom si se proporcionan, sino las del mes completo
  const desde = desdeOverride || parsed.desde;
  const hasta = hastaOverride || parsed.hasta;
  const rangeStr = `${desde} - ${hasta}`;

  log(`══════════════════════════════════════════════════`);
  log(`  ARCA Scraper — Período: ${periodo}`);
  log(`  Rango: ${desde} → ${hasta}${desdeOverride ? ' (rango personalizado)' : ''}`);
  log(`  Headless: ${HEADLESS}`);
  log(`══════════════════════════════════════════════════`);

  // Asegurar que existe el directorio de salida
  fs.mkdirSync(CSV_DIR, { recursive: true });

  const emitidosPath  = path.join(CSV_DIR, `${periodo}_emitidos.csv`);
  const recibidosPath = path.join(CSV_DIR, `${periodo}_recibidos.csv`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_ACTION);

  try {
    // 1. Login
    await login(page);

    // 2. Abrir Mis Comprobantes (popup)
    const popup = await abrirMisComprobantes(page);
    popup.setDefaultTimeout(TIMEOUT_ACTION);

    // 3. Emitidos
    log('── Comprobantes Emitidos ──');
    await locate(popup, SELECTORS.emitidos.link).click({ timeout: TIMEOUT_ACTION });
    await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });

    await setDateRange(popup, SELECTORS.emitidos, rangeStr);
    await buscarYDescargarCSV(popup, SELECTORS.emitidos, emitidosPath);

    // 4. Volver al menú para ir a Recibidos
    await volverAlMenu(popup);

    // 5. Recibidos
    log('── Comprobantes Recibidos ──');
    await locate(popup, SELECTORS.recibidos.link).click({ timeout: TIMEOUT_ACTION });
    await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });

    await setDateRange(popup, SELECTORS.recibidos, rangeStr);
    await buscarYDescargarCSV(popup, SELECTORS.recibidos, recibidosPath);

    log('══════════════════════════════════════════════════');
    log('  Scraping completado exitosamente.');
    log(`  Emitidos:  ${emitidosPath}`);
    log(`  Recibidos: ${recibidosPath}`);
    log('══════════════════════════════════════════════════');
  } catch (err) {
    console.error('\n[ERROR] El scraping falló:');

    if (err.message.includes('Login fallido')) {
      console.error('  → Credenciales incorrectas o cuenta bloqueada.');
    } else if (err.name === 'TimeoutError' || err.message.includes('Timeout')) {
      console.error('  → Timeout: ARCA tardó demasiado en responder.');
      console.error('  → Intentá de nuevo o usá PLAYWRIGHT_HEADLESS=false para depurar.');
    } else if (err.message.includes('waiting for locator') || err.message.includes('selector')) {
      console.error('  → Selector no encontrado: es posible que ARCA haya cambiado su interfaz.');
      console.error(`  → Detalle: ${err.message.split('\n')[0]}`);
    } else {
      console.error(`  → ${err.message}`);
    }

    // Capturar screenshot para debug
    const screenshotPath = path.join(CSV_DIR, `error_${Date.now()}.png`);
    try {
      const pages = context.pages();
      const activePage = pages[pages.length - 1];
      await activePage.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`  → Screenshot de error guardado en: ${screenshotPath}`);
    } catch {
      // Si no se puede capturar el screenshot, no pasa nada
    }

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
