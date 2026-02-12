# Euphoria · Dashboard de Posición de IVA / ARCA

## Objetivo

App web fullstack (Node.js + React) que se conecta a ARCA (ex AFIP) para obtener automáticamente:
1. Comprobantes emitidos del mes (facturación de ventas)
2. Comprobantes recibidos del mes (facturas de compra/proveedores)
3. Cálculo de posición de IVA: Débito Fiscal - Crédito Fiscal = saldo a pagar o a favor

El negocio es **Euphoria**, una marca de lencería y ropa interior con tienda física y e-commerce en Rafaela, Santa Fe, Argentina. El CUIT es Responsable Inscripto, emite Facturas A y B.

## Stack técnico

- **Backend:** Node.js + Express
- **Frontend:** React (Vite o Next.js, lo que resulte más práctico)
- **Conexión AFIP:** Afip SDK (@afipsdk/afip.js) — ver https://docs.afipsdk.com
- **Base de datos:** Opcional. SQLite si se necesita cachear comprobantes para no re-consultar.
- **Estilos:** Tailwind CSS o CSS-in-JS. Dark theme estilo fintech.

## Cómo funciona la conexión a ARCA

### Comprobantes emitidos y recibidos (método principal)

Se usa la **automatización "mis-comprobantes"** de Afip SDK. No es un web service directo de AFIP sino una automatización que simula el acceso a la app "Mis Comprobantes" de ARCA.

**Endpoint:** POST `https://app.afipsdk.com/api/v1/automations`

```json
{
  "automation": "mis-comprobantes",
  "params": {
    "cuit": "20XXXXXXXXX",
    "username": "20XXXXXXXXX",
    "password": "clave_arca",
    "filters": {
      "t": "E",  // "E" = Emitidos, "R" = Recibidos
      "fechaEmision": "01/02/2026 - 28/02/2026"
    }
  }
}
```

**Respuesta:** devuelve un `id` y `status: "in_process"`. Hay que pollear GET `/api/v1/automations/:id` cada 5 segundos hasta que `status` sea `"complete"`.

El resultado es un array con objetos que incluyen:
- `Fecha de Emisión`, `Tipo de Comprobante` (código numérico), `Punto de Venta`, `Número Desde/Hasta`
- `Imp. Neto Gravado`, `Imp. Neto No Gravado`, `Imp. Op. Exentas`, `IVA`, `Otros Tributos`, `Imp. Total`
- `Denominación Receptor`, `Nro. Doc. Receptor`, `Cód. Autorización` (CAE)
- `Moneda`, `Tipo Cambio`

**IMPORTANTE:** Los montos vienen en formato argentino con coma decimal: `"1.234,56"`. Hay que parsearlos.

**Header requerido:** `Authorization: Bearer TU_ACCESS_TOKEN`

### Consulta individual de comprobantes emitidos (método secundario)

Para obtener detalle de alícuotas de IVA de un comprobante propio, usar el WS `wsfev1` método `FECompConsultar` vía Afip SDK:

```js
const Afip = require('@afipsdk/afip.js');
const afip = new Afip({ CUIT: 20123456789, access_token: 'xxx' });

// Obtener info de un comprobante
const info = await afip.ElectronicBilling.getVoucherInfo(numero, puntoVenta, tipoComprobante);
// Devuelve: ImpNeto, ImpIVA, ImpTotal, array Iva con AlicIva [{Id, BaseImp, Importe}]

// Obtener último comprobante autorizado
const ultimo = await afip.ElectronicBilling.getLastVoucher(puntoVenta, tipoComprobante);
```

### Tipos de comprobante (códigos AFIP)

| Código | Tipo |
|--------|------|
| 1 | Factura A |
| 2 | Nota de Débito A |
| 3 | Nota de Crédito A |
| 6 | Factura B |
| 7 | Nota de Débito B |
| 8 | Nota de Crédito B |
| 11 | Factura C |
| 12 | Nota de Débito C |
| 13 | Nota de Crédito C |

## Arquitectura del proyecto

```
euphoria-iva/
├── CLAUDE.md
├── .env                    # Credenciales (no commitear)
├── .env.example
├── package.json
├── server/
│   ├── index.js            # Express server, API routes
│   ├── afip-service.js     # Clase que encapsula toda la lógica de ARCA
│   └── utils.js            # Parseo de montos AR, helpers de fechas
├── client/                 # React app
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Dashboard.jsx       # Vista principal con cards de resumen
│   │   │   ├── GaugeChart.jsx      # Proporción débito/crédito
│   │   │   ├── DailyChart.jsx      # Gráfico de barras IVA diario
│   │   │   ├── ComprobantesTable.jsx # Tabla con tabs emitidos/recibidos
│   │   │   └── ConfigPanel.jsx     # Panel para ingresar credenciales
│   │   └── utils/
│   │       └── format.js           # formatMoney, etc.
│   └── index.html
└── README.md
```

## Variables de entorno (.env)

```env
CUIT=20XXXXXXXXX
ARCA_USERNAME=20XXXXXXXXX
ARCA_PASSWORD=clave_arca
AFIP_SDK_ACCESS_TOKEN=token_de_app.afipsdk.com
AFIP_ENVIRONMENT=dev    # "dev" para homologación, "prod" para producción
PORT=3001
```

## API Endpoints del backend

### POST /api/posicion-iva
Endpoint principal. Recibe credenciales en el body, consulta emitidos y recibidos en paralelo, calcula posición de IVA.

**Request body:**
```json
{
  "cuit": "20XXXXXXXXX",
  "accessToken": "xxx",
  "username": "20XXXXXXXXX",
  "password": "clave",
  "fechaDesde": "01/02/2026",
  "fechaHasta": "07/02/2026"
}
```

**Response:**
```json
{
  "periodo": "Febrero 2026",
  "resumen": {
    "facturacion_emitida": 4825600,
    "facturacion_recibida": 2190300,
    "iva_debito": 1013376,
    "iva_credito": 459963,
    "posicion_iva": 553413,
    "cantidad_emitidas": 142,
    "cantidad_recibidas": 38
  },
  "emitidas": [...],
  "recibidas": [...],
  "iva_diario": [{ "dia": "01", "debito": 85200, "credito": 14070 }]
}
```

### POST /api/emitidas
Devuelve solo comprobantes emitidos con totales.

### POST /api/recibidas
Devuelve solo comprobantes recibidos con totales.

### POST /api/comprobante
Consulta un comprobante individual vía wsfev1 (solo emitidos propios).

### GET /api/health
Health check del servidor.

## Diseño del frontend

**Dark theme fintech.** Fondo #020617, cards con gradientes sutiles, tipografía monospace para números.

### Componentes principales:

1. **Header** — Logo "E" de Euphoria + indicador de conexión (Demo/Conectado) + botón Configurar
2. **Cards de resumen (4 columnas)**:
   - Facturación Emitida (blanco)
   - IVA Débito Fiscal (rojo #ef4444)
   - IVA Crédito Fiscal (verde #10b981)
   - Posición IVA Neta (rojo si a pagar, verde si a favor, con fondo tintado)
3. **Fila media (2 columnas)**:
   - Gauge semicircular de proporción débito/crédito
   - Gráfico de barras diario (débito en rojo, crédito en verde)
4. **Tabla de comprobantes** — Tabs "Emitidos" / "Recibidos" con columnas: Fecha, Tipo (badge con color), Número, Cliente/Proveedor, Neto, IVA, Total. Fila de totales al pie.
5. **Config Panel** — Campos: CUIT, Usuario ARCA, Contraseña ARCA, Access Token. Botón Conectar.
6. **Footer** — Última actualización + "Powered by Afip SDK"

### Datos mock para desarrollo:
El frontend debe arrancar con datos de ejemplo (mock) si no hay conexión, para poder desarrollar y testear la UI sin necesidad de credenciales ARCA reales.

## Parseo de montos argentinos

AFIP devuelve montos como strings con formato `"1.234,56"` (punto = separador de miles, coma = decimal).

```js
function parseMontoAR(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}
```

## Cálculo de posición de IVA

```
IVA Débito Fiscal  = Σ IVA de comprobantes emitidos
IVA Crédito Fiscal = Σ IVA de comprobantes recibidos
Posición = Débito - Crédito

Si Posición > 0 → Saldo a pagar a AFIP
Si Posición < 0 → Saldo a favor del contribuyente
```

**NOTA:** Las Notas de Crédito emitidas reducen el IVA Débito (vienen con montos negativos). Idem para NC recibidas que reducen el Crédito.

## Consideraciones de seguridad

- Las credenciales ARCA se envían por request, NO se guardan en el servidor
- El access token de Afip SDK sí puede ir en .env del servidor
- Usar HTTPS en producción
- No commitear .env al repositorio

## Pasos para desarrollo

1. Inicializar proyecto Node.js con Express
2. Implementar `afip-service.js` con la clase que maneja las automatizaciones
3. Crear las rutas de la API
4. Crear el frontend React con Vite
5. Implementar dashboard con datos mock primero
6. Conectar frontend → backend
7. Testear con credenciales de homologación (dev)
8. Pasar a producción cuando esté listo

## Documentación de referencia

- Afip SDK docs: https://docs.afipsdk.com
- Automatización Mis Comprobantes: https://afipsdk.com/blog/descargar-mis-comprobantes-de-arca-via-api/
- Factura Electrónica SDK: https://docs.afipsdk.com/paso-a-paso/web-services/factura-electronica
- AFIP WS wsfev1 manual: https://www.afip.gob.ar/fe/documentos/manual-desarrollador-ARCA-COMPG-v4-0.pdf
- Afip SDK Python/Node/PHP: https://afipsdk.com
- Registrar access token: https://app.afipsdk.com