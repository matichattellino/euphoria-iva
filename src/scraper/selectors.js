/**
 * Selectores extraídos del script de Playwright Codegen (playwright/arca-flow.js).
 *
 * Cada selector es un descriptor que se usa con la función `locate(page, sel)`:
 *   - { role, name? }       → page.getByRole(role, { name })
 *   - { locator, filter? }  → page.locator(locator).filter(filter)
 *   - { text }              → page.getByText(text)
 *
 * Organizados por sección del flujo de ARCA.
 */

const SELECTORS = {
  // ─── Login en auth.afip.gob.ar ──────────────────────────────────────
  login: {
    url: 'https://auth.afip.gob.ar/contribuyente_/login.xhtml',
    cuitInput:    { role: 'spinbutton' },
    siguienteBtn: { role: 'button', name: 'Siguiente' },
    passwordInput:{ role: 'textbox', name: 'TU CLAVE' },
    ingresarBtn:  { role: 'button', name: 'Ingresar' },
  },

  // ─── Portal principal de ARCA (post-login) ──────────────────────────
  portal: {
    misComprobantesLink: { locator: 'a', filter: { hasText: 'Mis Comprobantes' } },
  },

  // ─── Sección Emitidos (dentro de Mis Comprobantes) ────────
  // ARCA cambió la interfaz — los selectores tienen fallbacks
  emitidos: {
    links: [
      { role: 'link', name: 'Emitidos Comprobantes' },
      { role: 'link', name: /[Ee]mitidos/ },
      { locator: 'a:has-text("Emitidos")' },
      { locator: 'a[href*="emitidos"], a[href*="Emitidos"]' },
      { locator: '.menu-item:has-text("Emitidos"), .nav-link:has-text("Emitidos")' },
    ],
    fechaInputs: [
      { role: 'textbox', name: 'Fecha del Comprobante *' },
      { role: 'textbox', name: /[Ff]echa/ },
      { locator: 'input[name*="fecha"], input[name*="Fecha"], input.daterangepicker, input[type="text"][placeholder*="echa"]' },
    ],
    aplicarBtn:        { role: 'button', name: 'Aplicar' },
    buscarBtn:         { role: 'button', name: 'Buscar' },
    csvBtn:            { role: 'button', name: 'CSV' },
    menuPrincipalLinks: [
      { role: 'link', name: 'Menú Principal' },
      { role: 'link', name: /[Mm]en/ },
      { locator: 'a:has-text("Menú"), a:has-text("Menu"), a:has-text("Inicio"), a:has-text("Volver")' },
    ],
  },

  // ─── Sección Recibidos (dentro de Mis Comprobantes) ───────
  recibidos: {
    links: [
      { role: 'link', name: 'Recibidos Comprobantes' },
      { role: 'link', name: /[Rr]ecibidos/ },
      { locator: 'a:has-text("Recibidos")' },
      { locator: 'a[href*="recibidos"], a[href*="Recibidos"]' },
      { locator: '.menu-item:has-text("Recibidos"), .nav-link:has-text("Recibidos")' },
    ],
    fechaInputs: [
      { role: 'textbox', name: 'Fecha del Comprobante *' },
      { role: 'textbox', name: /[Ff]echa/ },
      { locator: 'input[name*="fecha"], input[name*="Fecha"], input.daterangepicker, input[type="text"][placeholder*="echa"]' },
    ],
    aplicarBtn: { role: 'button', name: 'Aplicar' },
    buscarBtn:  { role: 'button', name: 'Buscar' },
    csvBtn:     { role: 'button', name: 'CSV' },
  },
};

module.exports = SELECTORS;
