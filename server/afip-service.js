const { parseMontoAR, tipoComprobanteName, parseFecha, nombreMes, calcularResumenFromComprobantes, calcularIvaDiario } = require('./utils');

const AFIP_SDK_BASE = 'https://app.afipsdk.com/api/v1';
const POLL_INTERVAL = 5000;
const MAX_POLLS = 60; // 5 min máximo

class AfipService {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async _fetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AFIP SDK error ${res.status}: ${text}`);
    }
    return res.json();
  }

  /**
   * Lanza una automatización "mis-comprobantes" y pollea hasta que termine.
   * @param {'E'|'R'} tipo - "E" emitidos, "R" recibidos
   * @param {string} cuit
   * @param {string} username
   * @param {string} password
   * @param {string} fechaDesde - dd/mm/yyyy
   * @param {string} fechaHasta - dd/mm/yyyy
   * @returns {Array} comprobantes
   */
  async getComprobantes(tipo, cuit, username, password, fechaDesde, fechaHasta) {
    const body = {
      automation: 'mis-comprobantes',
      params: {
        cuit,
        username,
        password,
        filters: {
          t: tipo,
          fechaEmision: `${fechaDesde} - ${fechaHasta}`,
        },
      },
    };

    const { id } = await this._fetch(`${AFIP_SDK_BASE}/automations`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Pollear hasta que termine
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const result = await this._fetch(`${AFIP_SDK_BASE}/automations/${id}`);

      if (result.status === 'complete') {
        return result.data || [];
      }
      if (result.status === 'error') {
        throw new Error(`Automatización falló: ${result.error || 'Error desconocido'}`);
      }
    }

    throw new Error('Timeout esperando respuesta de ARCA');
  }

  /**
   * Normaliza un comprobante crudo de ARCA a formato interno.
   */
  normalizeComprobante(raw) {
    const tipoCodigo = parseInt(raw['Tipo de Comprobante'] || raw['Tipo'] || '0', 10);
    return {
      fecha: raw['Fecha de Emisión'] || raw['Fecha'] || '',
      tipoCodigo,
      tipoNombre: tipoComprobanteName(tipoCodigo),
      puntoVenta: raw['Punto de Venta'] || '',
      numeroDesde: raw['Número Desde'] || '',
      numeroHasta: raw['Número Hasta'] || '',
      denominacion: raw['Denominación Receptor'] || raw['Denominación Emisor'] || '',
      nroDoc: raw['Nro. Doc. Receptor'] || raw['Nro. Doc. Emisor'] || '',
      netoGravado: parseMontoAR(raw['Imp. Neto Gravado']),
      netoNoGravado: parseMontoAR(raw['Imp. Neto No Gravado']),
      exento: parseMontoAR(raw['Imp. Op. Exentas']),
      iva: parseMontoAR(raw['IVA']),
      otrosTributos: parseMontoAR(raw['Otros Tributos']),
      total: parseMontoAR(raw['Imp. Total']),
      cae: raw['Cód. Autorización'] || '',
      moneda: raw['Moneda'] || 'PES',
      tipoCambio: parseMontoAR(raw['Tipo Cambio'] || '1'),
    };
  }

  /**
   * Calcula la posición de IVA completa.
   */
  calcularPosicion(emitidas, recibidas, fechaDesde) {
    const normEmitidas = emitidas.map((c) => this.normalizeComprobante(c));
    const normRecibidas = recibidas.map((c) => this.normalizeComprobante(c));

    const fp = parseFecha(fechaDesde);
    const periodo = fp ? `${nombreMes(parseInt(fp.mes, 10))} ${fp.anio}` : '';

    return {
      periodo,
      resumen: calcularResumenFromComprobantes(normEmitidas, normRecibidas),
      emitidas: normEmitidas,
      recibidas: normRecibidas,
      iva_diario: calcularIvaDiario(normEmitidas, normRecibidas),
    };
  }
}

module.exports = AfipService;
