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
 * Intenta encontrar un elemento visible probando múltiples selectores.
 * Retorna el primer locator visible, o null si ninguno funciona.
 */
async function locateWithFallbacks(page, selectors, timeout = 5000) {
  for (const sel of selectors) {
    try {
      const loc = locate(page, sel);
      const visible = await loc.first().isVisible({ timeout }).catch(() => false);
      if (visible) return loc.first();
    } catch {
      // probar siguiente
    }
  }
  return null;
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
  // ARCA puede redirigir a distintas URLs: /contribuyente/, /portal/, /portalcf/, etc.
  try {
    await page.waitForURL((url) => !url.href.includes('login.xhtml'), { timeout: TIMEOUT_NAV });
    log(`Login exitoso. URL: ${page.url()}`);
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
    log(`Login exitoso (URL alternativa). URL: ${page.url()}`);
  }

  // Dar tiempo al portal para cargar completamente
  await page.waitForTimeout(3000);
}

async function abrirMisComprobantes(page) {
  log('Buscando enlace "Mis Comprobantes"...');
  log(`URL actual post-login: ${page.url()}`);

  // Esperar a que la página del portal se estabilice (SPA que carga dinámicamente)
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT_NAV }).catch(() => {
    log('networkidle timeout — continuando de todas formas...');
  });
  // El portal SPA necesita tiempo extra para renderizar los servicios
  await page.waitForTimeout(5000);

  // Loguear qué links hay en la página para debug
  const allLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).slice(0, 30).map(a => ({
      text: (a.textContent || '').trim().substring(0, 80),
      href: a.href || '',
    }));
  }).catch(() => []);
  log(`Links en la página (${allLinks.length}): ${JSON.stringify(allLinks.filter(l => l.text).slice(0, 15).map(l => l.text))}`);

  // Loguear elementos con texto "comprobantes" (case insensitive)
  const compLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*')).filter(el => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('comprobante') && el.children.length < 3;
    }).slice(0, 10).map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().substring(0, 100),
      href: el.href || '',
      class: el.className || '',
    }));
  }).catch(() => []);
  if (compLinks.length > 0) {
    log(`Elementos con "comprobante": ${JSON.stringify(compLinks)}`);
  }

  // Estrategia 1: buscar el link en el portal
  const linkStrategies = [
    { desc: 'filter hasText', sel: SELECTORS.portal.misComprobantesLink },
    { desc: 'text exact', sel: { text: 'Mis Comprobantes' } },
    { desc: 'text partial link', sel: { locator: 'a:has-text("Mis Comprobantes")' } },
    { desc: 'any element', sel: { locator: '*:has-text("Mis Comprobantes"):not(:has(*:has-text("Mis Comprobantes")))' } },
    { desc: 'href comprobantes', sel: { locator: 'a[href*="misComprobantes"], a[href*="mis-comprobantes"], a[href*="miscomprobantes"]' } },
  ];

  let link = null;
  for (const { desc, sel } of linkStrategies) {
    try {
      const loc = locate(page, sel);
      const visible = await loc.first().isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        log(`Enlace encontrado con estrategia: ${desc}`);
        link = loc.first();
        break;
      }
    } catch {
      // probar siguiente
    }
  }

  // Estrategia 1b: buscar en el portal SPA con search/buscador
  if (!link) {
    log('Buscando servicio via search bar del portal...');
    const searchInput = await locateWithFallbacks(page, [
      { locator: 'input[placeholder*="uscar"], input[placeholder*="ervicio"], input[type="search"]' },
      { role: 'searchbox' },
      { role: 'textbox', name: /[Bb]uscar/ },
    ], 5000);

    if (searchInput) {
      log('Search bar encontrado, buscando "Mis Comprobantes"...');
      await searchInput.click();
      await searchInput.fill('Mis Comprobantes');
      await page.waitForTimeout(3000); // esperar resultados

      // Buscar el resultado
      link = await locateWithFallbacks(page, [
        { locator: 'a:has-text("Mis Comprobantes")' },
        { text: 'Mis Comprobantes' },
        { locator: '*:has-text("Mis Comprobantes"):not(:has(*:has-text("Mis Comprobantes")))' },
      ], 5000);
      if (link) log('Enlace encontrado via búsqueda.');
    }
  }

  if (link) {
    log('Abriendo Mis Comprobantes...');
    try {
      const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
      await link.click();
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
      log(`Popup de Mis Comprobantes abierto. URL: ${popup.url()}`);
      return popup;
    } catch {
      log('No se abrió popup, verificando navegación en la misma página...');
      await page.waitForTimeout(3000);
      const currentUrl = page.url();
      if (currentUrl.includes('comprobantes') || currentUrl.includes('Comprobantes')) {
        log(`Mis Comprobantes abierto en la misma página: ${currentUrl}`);
        // Verificar que NO sea "Constatación"
        const title = await page.title().catch(() => '');
        if (title.toLowerCase().includes('constataci')) {
          log('ADVERTENCIA: Se abrió "Constatación" en vez de "Mis Comprobantes", continuando con URLs directas...');
        } else {
          return page;
        }
      }
    }
  } else {
    log('No se encontró el enlace "Mis Comprobantes" en el portal.');
    const debugPath = path.join(CSV_DIR, `debug_portal_${Date.now()}.png`);
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    log(`Screenshot de debug guardado en: ${debugPath}`);
  }

  // Estrategia 2: URLs directas al servicio "Mis Comprobantes"
  // NOTA: https://serviciosweb.afip.gob.ar/genericos/comprobantes/ redirige a
  // "Constatación de Comprobantes" que es OTRO servicio. Las URLs correctas son:
  log('Intentando navegar directamente a Mis Comprobantes...');
  const directUrls = [
    'https://rfrcel.afip.gob.ar/misComprobantes/',
    'https://serviciosweb.afip.gob.ar/genericos/misComprobantes/',
    'https://portalcf.cloud.afip.gob.ar/portal/app/service/772',  // ID típico de Mis Comprobantes
    'https://portalcf.cloud.afip.gob.ar/portal/app/service/773',
  ];

  for (const url of directUrls) {
    try {
      log(`Probando URL directa: ${url}`);
      await page.goto(url, { timeout: TIMEOUT_NAV, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const currentUrl = page.url();
      const title = await page.title().catch(() => '');
      log(`Resultado: URL=${currentUrl}, Título="${title}"`);

      if (currentUrl.includes('auth.afip') || currentUrl.includes('login')) {
        log('Redirigido al login, probando siguiente URL...');
        continue;
      }
      // Verificar que NO sea "Constatación"
      if (title.toLowerCase().includes('constataci')) {
        log('Se abrió "Constatación" — no es el servicio correcto.');
        continue;
      }
      log(`Mis Comprobantes abierto directamente: ${currentUrl}`);
      return page;
    } catch {
      log(`URL ${url} falló, probando siguiente...`);
    }
  }

  // Estrategia 3: Último recurso — abrir la vieja URL de Mis Comprobantes
  // y si nos lleva a Constatación, intentar navegar desde ahí
  log('Último recurso: abriendo desde Constatación...');
  try {
    await page.goto('https://serviciosweb.afip.gob.ar/genericos/comprobantes/', {
      timeout: TIMEOUT_NAV, waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    const title = await page.title().catch(() => '');
    log(`Cargado: "${title}" — ${currentUrl}`);

    // Buscar link a "Mis Comprobantes" dentro de Constatación
    const misCompLink = await locateWithFallbacks(page, [
      { locator: 'a:has-text("Mis Comprobantes")' },
      { locator: 'a[href*="misComprobantes"]' },
    ], 5000);

    if (misCompLink) {
      log('Encontrado link a Mis Comprobantes desde Constatación.');
      await misCompLink.click();
      await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
      return page;
    }

    // Si no encontramos el link, usar Constatación de todas formas pero
    // con un flujo diferente — los comprobantes propios se pueden buscar acá también
    log('ADVERTENCIA: Usando Constatación como fallback para obtener comprobantes.');
    return page;
  } catch (err) {
    log(`Error en último recurso: ${err.message}`);
  }

  throw new Error('No se pudo abrir "Mis Comprobantes". ARCA puede haber cambiado su interfaz. Verificá manualmente en https://auth.afip.gob.ar');
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

  // Intentar múltiples selectores para el input de fecha
  let fechaInput;
  if (section.fechaInputs) {
    fechaInput = await locateWithFallbacks(popup, section.fechaInputs, TIMEOUT_ACTION);
    if (!fechaInput) {
      // Último recurso: cualquier input de texto visible
      fechaInput = await locateWithFallbacks(popup, [
        { locator: 'input[type="text"]' },
      ], 5000);
    }
    if (!fechaInput) throw new Error('No se encontró el input de fecha');
  } else {
    fechaInput = locate(popup, section.fechaInput);
    await fechaInput.waitFor({ state: 'visible', timeout: TIMEOUT_ACTION });
  }
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

  // Intentar múltiples selectores para "Menú Principal"
  if (SELECTORS.emitidos.menuPrincipalLinks) {
    const menuLink = await locateWithFallbacks(popup, SELECTORS.emitidos.menuPrincipalLinks, 10000);
    if (menuLink) {
      await menuLink.click({ timeout: TIMEOUT_ACTION });
      await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
      log('En menú principal.');
      return;
    }
    // Fallback: navegar atrás
    log('Link de menú no encontrado, navegando atrás...');
    await popup.goBack({ timeout: TIMEOUT_NAV });
    await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
    log('En menú principal (vía navegación atrás).');
  } else {
    const menuLink = locate(popup, SELECTORS.emitidos.menuPrincipalLink);
    await menuLink.waitFor({ state: 'visible', timeout: TIMEOUT_ACTION });
    await menuLink.click({ timeout: TIMEOUT_ACTION });
    await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
    log('En menú principal.');
  }
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
    await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
    await popup.waitForTimeout(2000); // Esperar a que la página se estabilice

    // Log del HTML para debug si falla
    const pageTitle = await popup.title().catch(() => 'N/A');
    log(`Página actual: "${pageTitle}" — URL: ${popup.url()}`);

    // Buscar link de Emitidos con fallbacks
    const emitidosLink = await locateWithFallbacks(popup, SELECTORS.emitidos.links, TIMEOUT_ACTION);
    if (emitidosLink) {
      log('Link de Emitidos encontrado, clickeando...');
      await emitidosLink.click({ timeout: TIMEOUT_ACTION });
      await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
    } else {
      // Si no hay link, tal vez ya estamos en la página de comprobantes
      log('Link de Emitidos no encontrado — verificando si ya estamos en la sección correcta...');
      // Tomar screenshot para debug
      const debugPath = path.join(CSV_DIR, `debug_emitidos_${Date.now()}.png`);
      await popup.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
      log(`Screenshot de debug: ${debugPath}`);
      // Intentar buscar si hay un tab/sección de emitidos
      const emitidosTab = await locateWithFallbacks(popup, [
        { locator: '[data-tab="emitidos"], [data-section="emitidos"], .tab-emitidos' },
        { locator: 'button:has-text("Emitidos"), [role="tab"]:has-text("Emitidos")' },
      ], 5000);
      if (emitidosTab) {
        log('Tab de Emitidos encontrado, clickeando...');
        await emitidosTab.click({ timeout: TIMEOUT_ACTION });
        await popup.waitForTimeout(2000);
      }
    }

    await popup.waitForTimeout(2000);
    await setDateRange(popup, SELECTORS.emitidos, rangeStr);
    await buscarYDescargarCSV(popup, SELECTORS.emitidos, emitidosPath);

    // 4. Volver al menú para ir a Recibidos
    await volverAlMenu(popup);

    // 5. Recibidos
    log('── Comprobantes Recibidos ──');
    await popup.waitForTimeout(2000);

    const recibidosLink = await locateWithFallbacks(popup, SELECTORS.recibidos.links, TIMEOUT_ACTION);
    if (recibidosLink) {
      log('Link de Recibidos encontrado, clickeando...');
      await recibidosLink.click({ timeout: TIMEOUT_ACTION });
      await popup.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_NAV });
    } else {
      log('Link de Recibidos no encontrado — verificando tabs...');
      const recibidosTab = await locateWithFallbacks(popup, [
        { locator: '[data-tab="recibidos"], [data-section="recibidos"], .tab-recibidos' },
        { locator: 'button:has-text("Recibidos"), [role="tab"]:has-text("Recibidos")' },
      ], 5000);
      if (recibidosTab) {
        log('Tab de Recibidos encontrado, clickeando...');
        await recibidosTab.click({ timeout: TIMEOUT_ACTION });
        await popup.waitForTimeout(2000);
      }
    }

    await popup.waitForTimeout(2000);
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
