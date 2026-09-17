# MVP — Suscripción mensual con descuento automático de 12 meses

Aplicación mínima en **React + TypeScript + Vite** y **Node.js + Express** que valida
un flujo de suscripción con cupón de descuento en **Stripe (modo test)**.

El caso de uso concreto:

| Mes | Se cobra | Quién lo decide |
|-----|----------|-----------------|
| 1 a 12 | **$700.00 MXN** | Stripe (cupón del 30%) |
| 13 en adelante | **$1,000.00 MXN** | Stripe (retira el descuento solo) |

No hay ningún cron, job programado ni tarea manual que cambie el precio en el mes 13.

---

## Estrategia técnica

### El problema

Aplicar un descuento recurrente durante exactamente 12 meses y que después el cobro
vuelva solo al precio normal, sin crear 12 cupones ni ejecutar nada cada mes.

### La solución vigente en Stripe

Un **único cupón** configurado así:

```
duration          = "repeating"
duration_in_months = 12
percent_off        = 30
```

Ese par de campos es toda la lógica. Según la
[documentación de Stripe](https://docs.stripe.com/billing/subscriptions/coupons#coupon-duration):

> *"Duration defaults to `once`, which applies only to the first invoice. Set
> `duration=repeating` with `duration_in_months` to apply a discount for multiple
> months."*

Cuando ese cupón se aplica a una suscripción, Stripe crea un objeto
[`Discount`](https://docs.stripe.com/api/discounts/object) con `start` y `end`, donde
`end = start + 12 meses`. Stripe aplica el descuento a cada factura dentro de esa
ventana y **lo retira automáticamente al vencer**. La factura 13 sale a precio completo
sin que nadie intervenga.

### Cómo se conecta

Sobre el cupón se crea un **Promotion Code** (`PROMO30`), que es el texto que teclea la
persona usuaria. Un cupón puede tener muchos promotion codes; el cupón define *cuánto* y
*por cuánto tiempo* se descuenta, el promotion code define *quién* puede canjearlo.

Al crear el Checkout Session se adjunta con el parámetro **`discounts`**:

```js
discounts: [{ promotion_code: 'promo_1A2b3C...' }]
```

`discounts` es el parámetro vigente. Los antiguos `coupon` y `promotion_code` de nivel
superior están **deprecados**; además `discounts` permite apilar hasta 20 descuentos.

### Qué se descartó y por qué

| Alternativa | Por qué no |
|-------------|-----------|
| 12 cupones de `duration: once` | Exige aplicar uno cada mes a mano. Justo lo que se pidió evitar. |
| Un cron que cambie el precio en el mes 13 | Lógica manual, propensa a fallar, y rompe el criterio 10. |
| [Subscription Schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules) con dos fases | Funciona, pero es innecesariamente complejo aquí. Se justifica cuando cambia el *precio* o el *plan* entre fases, no cuando solo vence un descuento. |
| `duration: forever` | El descuento no terminaría nunca. |

---

## Estructura

```
.
├── backend/                    Única capa que conoce la STRIPE_SECRET_KEY
│   ├── src/
│   │   ├── server.js           Express: monta rutas y middleware
│   │   ├── config.js           Variables de entorno, validadas al arrancar
│   │   ├── stripe.js           Cliente de Stripe (instancia única)
│   │   ├── routes/
│   │   │   ├── plan.js         GET  /api/plan
│   │   │   ├── coupon.js       POST /api/coupon/validate
│   │   │   ├── checkout.js     POST /api/checkout/session
│   │   │   └── webhook.js      POST /api/webhooks/stripe
│   │   ├── services/
│   │   │   ├── planService.js      Lee el precio desde Stripe
│   │   │   ├── couponService.js    Valida el cupón contra Stripe
│   │   │   └── checkoutService.js  Crea la sesión con el descuento
│   │   └── lib/
│   │       ├── pricing.js      Aritmética de importes y formato
│   │       ├── errors.js       Errores y su traducción a HTTP
│   │       └── rateLimit.js    Freno contra fuerza bruta de cupones
│   └── scripts/
│       ├── setup-stripe.mjs        Crea producto, precio, cupón y promo code
│       ├── verify-discount.mjs     Verifica la configuración
│       └── verify-test-clock.mjs   Simula 14 meses y comprueba los cobros
│
├── frontend/                   React + TypeScript + Vite. Sin claves secretas.
│   └── src/
│       ├── App.tsx             Orquesta el flujo completo
│       ├── api.ts              Cliente HTTP del backend
│       ├── types.ts            Tipos de las respuestas de la API
│       └── components/         PlanCard, CouponForm, DiscountSummary, SuccessPanel
│
├── .env.example
└── README.md
```

### Arquitectura

```
React  ──HTTP──>  Backend API  ──STRIPE_SECRET_KEY──>  Stripe API
```

El navegador nunca ve la clave secreta y nunca decide precios.

---

## Puesta en marcha

### Requisitos

- **Node.js 20.6 o superior** (se usa el flag nativo `--env-file`, sin `dotenv`)
- Una cuenta de Stripe en **modo test**

### 1. Instalar dependencias

```bash
npm run install:all
```

### 2. Configurar las claves

```bash
cp .env.example backend/.env
```

Abre `backend/.env` y pega tus claves de test desde
[Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys):

```bash
STRIPE_SECRET_KEY=sk_test_...        # Solo backend. Nunca al navegador.
STRIPE_PUBLISHABLE_KEY=pk_test_...   # Pública por diseño.
```

`STRIPE_PRICE_ID` lo obtendrás en el paso siguiente.

### 3. Crear el producto, el precio y el cupón en Stripe

Hay dos caminos. **El automático hace los pasos 1 a 6 que pediste, de una vez.**

#### Opción A — automática (recomendada)

```bash
npm run setup:stripe
```

El script es idempotente: crea lo que falte y reutiliza lo que ya exista.

1. Producto **Plan Pro**
2. Precio **$1,000.00 MXN / mes** (recurrente)
3. Cupón **30%**, `duration=repeating`, `duration_in_months=12`
4. Promotion Code **PROMO30**

Al terminar imprime la línea que falta en tu `.env`:

```
STRIPE_PRICE_ID=price_1A2b3C...
```

Pégala en `backend/.env`.

#### Opción B — manual, desde el Dashboard

<details>
<summary>Desplegar los pasos manuales</summary>

**1. Crear el producto**
[Productos](https://dashboard.stripe.com/test/products) → **+ Añadir producto**.
Nombre: `Plan Pro`.

**2. Crear el precio mensual**
En el mismo formulario:
- Modelo: **Estándar**
- Precio: `1000.00`, moneda **MXN**
- Periodo de facturación: **Mensual**

Guarda y copia el **ID del precio** (`price_...`) → va en `STRIPE_PRICE_ID`.

**3. Crear el cupón**
[Cupones](https://dashboard.stripe.com/test/coupons) → **+ Nuevo**.
- Tipo: **Porcentaje de descuento** → `30`%
- **Duración: Varios meses** ← el campo decisivo

**4. Configurar la duración de 12 mensualidades**
En **Número de meses**, escribe `12`.

Esto es lo que produce `duration=repeating` y `duration_in_months=12`. Si eliges
"Una vez" el descuento solo aplicará a la primera factura; si eliges "Para siempre"
no terminará nunca.

**5. Crear el Promotion Code**
En el mismo formulario del cupón, marca **Usar códigos promocionales para clientes**
y escribe `PROMO30`.

**6. Obtener los IDs necesarios**

| Dato | Dónde | Formato |
|------|-------|---------|
| Clave secreta | Developers → API keys | `sk_test_...` |
| Clave publicable | Developers → API keys | `pk_test_...` |
| ID del precio | Producto → sección Precios | `price_...` |
| Secreto del webhook | Lo imprime `stripe listen` | `whsec_...` |

</details>

### 4. Verificar la configuración

```bash
npm run verify
```

Comprueba contra Stripe que el precio es mensual, que `PROMO30` está activo y que el
cupón es `repeating` con `duration_in_months=12`. Después imprime la proyección de
cobros mes a mes.

### 5. Levantar la aplicación

Ambos procesos a la vez:

```bash
npm run dev
```

O por separado, en dos terminales:

```bash
npm run dev:backend    # http://localhost:3000
npm run dev:frontend   # http://localhost:5173
```

Abre **http://localhost:5173**.

---

## Webhooks en local

### Instalar el Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows
scoop install stripe

# Linux y otros: https://docs.stripe.com/stripe-cli#install
```

### Autenticar y redirigir los eventos

```bash
stripe login

stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

El comando imprime algo así:

```
> Ready! Your webhook signing secret is whsec_1a2b3c4d...
```

Copia ese valor a `STRIPE_WEBHOOK_SECRET` en `backend/.env` y **reinicia el backend**.

> Sin `STRIPE_WEBHOOK_SECRET`, el endpoint responde `503` a propósito: es preferible
> rechazar un evento que procesar uno sin verificar su firma.

### Probar los webhooks

Con `stripe listen` abierto, en otra terminal:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

El backend registra cada evento en consola.

### Eventos que maneja

| Evento | Qué hace |
|--------|----------|
| `checkout.session.completed` | Checkout terminado, suscripción creada |
| `customer.subscription.created` | Alta de suscripción |
| `customer.subscription.updated` | Cambios — **incluye el vencimiento del descuento en el mes 13** |
| `customer.subscription.deleted` | Cancelación |
| `invoice.paid` / `invoice.payment_succeeded` | Cobro mensual exitoso |
| `invoice.payment_failed` | Cobro mensual fallido |

---

## Tarjetas de prueba

En Stripe Checkout, con cualquier fecha futura y cualquier CVC:

| Número | Resultado |
|--------|-----------|
| `4242 4242 4242 4242` | Pago aprobado |
| `4000 0000 0000 9995` | Rechazada por fondos insuficientes |
| `4000 0000 0000 0002` | Rechazada genérica |
| `4000 0025 0000 3155` | Requiere autenticación 3D Secure |
| `4000 0000 0000 0341` | Se adjunta, pero falla el cobro recurrente |

Lista completa: [docs.stripe.com/testing](https://docs.stripe.com/testing)

---

## Probar el MVP completo

1. Abre **http://localhost:5173**
2. Verás **Plan Pro — $1,000.00 / mes MXN**
3. Escribe **`PROMO30`** y pulsa **Aplicar cupón**
4. El resumen muestra:
   - Precio: ~~$1,000.00~~ / mes
   - Descuento: 30% (−$300.00 / mes)
   - **Precio durante los primeros 12 meses: $700.00 / mes**
   - Después del mes 12: $1,000.00 / mes
5. Pulsa **Suscribirme** → Stripe Checkout
6. Paga con `4242 4242 4242 4242`
7. Vuelves a la app: *"Suscripción creada correctamente"*, con la fecha exacta en que
   Stripe retirará el descuento

### Comprobar que Stripe quedó bien configurado

Copia el ID de la suscripción (`sub_...`) que muestra la pantalla de confirmación:

```bash
cd backend && npm run verify -- sub_1A2b3C...
```

Verifica que el descuento existe, que es `repeating` y que su ventana es de 12 meses.

### La prueba definitiva: simular 14 meses

```bash
npm run verify:testclock
```

Usa los [Test Clocks](https://docs.stripe.com/billing/testing/test-clocks) de Stripe
para adelantar el reloj mes a mes y leer lo que Stripe factura de verdad:

```
    #    Importe cobrado    Descuento aplicado
    --   ---------------    ------------------
     1   $700.00            sí
    ...
    12   $700.00            sí
    13   $1,000.00          no  <- vuelve al precio normal
    14   $1,000.00          no

    Facturas con descuento    12  (esperado: 12)
    CORRECTO: el descuento se aplicó 12 meses y después Stripe volvió
    al precio completo por sí solo.
```

Tarda varios minutos y al terminar borra el test clock y todo lo que creó.

---

## Seguridad

Lo que implementa este MVP:

| Medida | Dónde |
|--------|-------|
| `STRIPE_SECRET_KEY` solo en backend | `backend/src/stripe.js` es el único módulo que la recibe |
| El frontend no recibe claves secretas | Solo se expone la publishable key, que es pública por diseño |
| El precio nunca llega desde React | `checkoutService.js` resuelve el precio desde `STRIPE_PRICE_ID` |
| El cupón se revalida al crear la suscripción | `createCheckoutSession()` llama otra vez a `validateCoupon()` |
| No se exponen ids de descuento al cliente | `routes/coupon.js` omite `promotionCodeId` y `couponId` |
| Firma de webhook verificada | `stripe.webhooks.constructEvent()` con el cuerpo crudo |
| El webhook usa el cuerpo sin parsear | La ruta se monta **antes** de `express.json()` |
| No se almacenan ni procesan tarjetas | Todo el pago ocurre en Stripe Checkout |
| Respuestas de Stripe validadas | Se comprueba `active`, `recurring`, `valid`, `unit_amount` |
| CORS restringido | Solo `FRONTEND_URL`, sin comodines |
| Límite de peticiones | 20/min en cupones, 10/min en checkout |
| Errores sin fugas | Los detalles se registran; al cliente va un mensaje genérico |
| Cuerpos de petición acotados | `express.json({ limit: '10kb' })` |
| Aviso si la clave no es de test | `config.js` aborta si no empieza por `sk_test_` |

### Antes de llevarlo a producción

Este MVP no lo cubre y habría que añadirlo:

- **Persistencia.** Los webhooks solo registran en consola; falta guardar el estado.
- **Idempotencia de webhooks.** Stripe reintenta: hay que descartar `event.id` repetidos.
- **Autenticación.** No hay usuarios; cualquiera puede crear una suscripción.
- **Límite de peticiones distribuido.** El actual vive en memoria y sirve para un solo nodo.
- **HTTPS y cabeceras de seguridad** (`helmet` o equivalente).
- **Fijar `apiVersion`** en el cliente de Stripe para evitar sorpresas al actualizar.

---

## Verificación realizada

El código se validó de punta a punta contra un mock de la API de Stripe, porque este
entorno no tiene claves reales:

- `GET /api/plan` devuelve `$1,000.00 MXN` leído del precio de Stripe
- `PROMO30` (y `promo30`, en minúsculas) valida y calcula **$700.00 / mes, 12 meses**
- Un código inexistente devuelve `400 COUPON_NOT_FOUND`
- El checkout envía exactamente `discounts[0][promotion_code]`, sin `allow_promotion_codes`
- Sin cupón envía `allow_promotion_codes=true`, sin `discounts` (son excluyentes)
- Mandar `price`, `amount` o `finalAmount` desde el cliente **no altera nada**: se sigue
  usando el `price_id` del backend
- Una firma de webhook inválida devuelve `400`; una válida se procesa y devuelve `200`
- El límite de peticiones responde `429` tras 20 intentos por minuto
- El frontend compila sin errores de TypeScript

Lo que **no** se pudo verificar aquí, por no haber claves reales: el cobro real en
Stripe y la simulación de 14 meses con test clocks. Para eso, ejecuta
`npm run verify:testclock` con tus propias claves de test.
