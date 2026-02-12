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

  // ─── Sección Emitidos (dentro del popup de Mis Comprobantes) ────────
  emitidos: {
    link:              { role: 'link', name: 'Emitidos Comprobantes' },
    fechaInput:        { role: 'textbox', name: 'Fecha del Comprobante *' },
    aplicarBtn:        { role: 'button', name: 'Aplicar' },
    buscarBtn:         { role: 'button', name: 'Buscar' },
    csvBtn:            { role: 'button', name: 'CSV' },
    menuPrincipalLink: { role: 'link', name: 'Menú Principal' },
  },

  // ─── Sección Recibidos (dentro del popup de Mis Comprobantes) ───────
  recibidos: {
    link:       { role: 'link', name: 'Recibidos Comprobantes' },
    fechaInput: { role: 'textbox', name: 'Fecha del Comprobante *' },
    aplicarBtn: { role: 'button', name: 'Aplicar' },
    buscarBtn:  { role: 'button', name: 'Buscar' },
    csvBtn:     { role: 'button', name: 'CSV' },
  },
};

module.exports = SELECTORS;
