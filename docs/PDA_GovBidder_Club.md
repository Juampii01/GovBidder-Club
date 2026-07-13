# PDA — Project Development Audit: GovBidder Club
**Fecha:** 2026-07-13
**Alcance:** Auditoría completa de arquitectura, backend, frontend, seguridad, consistencia de negocio y estado de infraestructura, para servir de base a la siguiente ronda de planificación de desarrollo.

---

## 1. Qué es GovBidder Club — objetivo y funcionalidad del producto

### 1.1 Objetivo / misión

GovBidder Club nace bajo la visión de **Santo González**, creador del programa **"Tu Primer Contrato"** y fundador del ecosistema GovBidder, con la misión de **empoderar a emprendedores hispanos para que monetización su conocimiento de contratación gubernamental**, ayudándolos a aplicar, ganar y ejecutar contratos con el gobierno de Estados Unidos ("venderle al cliente más poderoso del mundo"). La membresía **no es un producto de mercado abierto**: es exclusiva para alumnos y exalumnos de "Tu Primer Contrato" o GovBidder Academy — es la comunidad de continuidad para gente que ya pasó por la capacitación inicial y ahora necesita herramientas, soporte y capital para ejecutar en la práctica.

### 1.2 A quién sirve

Contratistas hispanos — muchas veces pequeñas empresas o freelancers recién formalizados — que buscan licitar y ejecutar contratos B2G (business-to-government) en EE.UU. El caso de uso de referencia usado en toda la demo es servicios de limpieza/jardinería (NAICS 561720/561730), pero el modelo aplica a cualquier rubro de servicios a instituciones públicas (escuelas, universidades, municipios, agencias estatales/federales).

### 1.3 Problema que resuelve

Ganar un contrato gubernamental no es el final del camino, es el principio de un problema logístico y de capital:
- **Descubrimiento**: SAM.gov y Grants.gov publican decenas de miles de oportunidades; encontrar las relevantes para el rubro/estado de cada miembro es un trabajo en sí mismo.
- **Lenguaje burocrático**: cada agencia clasifica productos/servicios con un sistema de códigos distinto (NAICS, SIC, PSC, UNSPSC, NIGP) — sin saber traducir entre ellos, un contratista puede perderse oportunidades relevantes solo porque están catalogadas bajo un código que no reconoce.
- **Preparación de propuestas**: arma una propuesta competitiva requiere soporte que un contratista chico normalmente no tiene en su equipo.
- **Capital de ejecución**: este es el cuello de botella más crítico — una vez adjudicado el contrato (con la Purchase Order en mano), el contratista tiene que comprar mercancía o pagar servicios **antes** de que el gobierno le pague, y ese pago puede tardar semanas o meses. Muchos contratos ganados nunca se ejecutan, o se ejecutan mal, únicamente por falta de capital de trabajo — no por falta de capacidad.

GovBidder Club ataca los 3 frentes con productos concretos: **descubrimiento** (Opportunities, Grants Hub, Market Intelligence), **preparación** (Support Desk, Code Intelligence, Buyer Geography, Competitive Intel), y **ejecución** (GovBidder Alliance para el capital, Task Work como ingreso adicional mientras tanto).

### 1.4 Cómo funciona — recorrido del usuario

1. El miembro se registra eligiendo un plan: **Elevate** ($69/mes), **Prime** ($119/mes) o **Legacy** ($219/mes). Hoy el alta es vía un formulario de solicitud que revisa manualmente el equipo de GovBidder (no hay self-signup automático con cobro inmediato).
2. Entra al **Command Center**: dashboard con KPIs de su actividad, oportunidades recientes de SAM.gov, grants recientes, y un "AI Daily Brief" generado por IA.
3. Busca oportunidades reales en **Opportunities** (SAM.gov) y **Grants Hub** (Grants.gov), filtradas por su NAICS/estado.
4. Usa **Code Intelligence** para traducir su código NAICS a los códigos que usa cada agencia (SIC/PSC/UNSPSC/NIGP) — una barrera de entrada real para quien no conoce el sistema.
5. Usa **Buyer Geography** y **Market/Competitive Intelligence** para entender qué estados/condados gastan más en su rubro, y quiénes son los competidores ya establecidos ahí.
6. Si necesita ayuda puntual (armar una propuesta, revisar documentos, resolver una duda), abre un ticket en **Support Desk** — con un límite mensual de "BID Supports" según su plan (1/3/5 por mes).
7. Cuando gana un contrato y tiene la PO pero no el capital para ejecutarla, aplica a **GovBidder Alliance** (solo si es Prime/Legacy y tiene 60+ días de antigüedad como miembro): sube 5 documentos (PO, adjudicación, cotización, cronograma, estado de cuenta bancaria) y, si se aprueba, recibe hasta 60%/90% del costo de mercancía — devolviendo el aporte más un 20% de la ganancia neta cuando el gobierno le paga. Explícitamente **no es un préstamo ni cobra intereses fijos** — es un modelo de participación en la ganancia, con tope de $15,000 por operación.
8. Mientras arma su pipeline de contratos propios, puede generar ingresos extra postulándose a **Task Work**: una bolsa de trabajo interna de 15 tareas fijas (crear DUNS number, análisis de códigos, etc.) que el propio GovBidder asigna, exclusivas por plan (un miembro Elevate solo ve/postula a tareas de Elevate, no a las de planes superiores).
9. Del otro lado, el **equipo de GovBidder** (rol admin) gestiona todo desde el **Panel de Admin**: aprueba/rechaza solicitudes de Alliance, responde tickets de soporte, crea y asigna tareas de Task Work, y revisa las solicitudes de membresía nuevas.

### 1.5 Estructura de planes y pilares construidos

| Beneficio | Elevate | Prime | Legacy |
|---|---|---|---|
| BID Supports (soporte)/mes | 1 | 3 | 5 |
| Descuento GovBidder Shop | 10% | 20% | 50% |
| Acceso a GovBidder Alliance | ❌ No califica | Hasta 60% del costo | Hasta 90% del costo |

**Los 3 pilares funcionales ya construidos:**
- **GovBidder Alliance**: programa de apoyo económico privado (no es un préstamo, nunca se llama "financiamiento") para ejecutar Purchase Orders del gobierno cuando el miembro ya tiene el contrato adjudicado pero no el capital. Fee fijo del 20% sobre la ganancia neta, tope $15,000/operación (configurable).
- **Task Work**: bolsa de trabajo interna con catálogo fijo de 15 tareas, exclusivas por plan (match exacto, no jerárquico).
- **Support Desk**: sistema de tickets con respuesta del admin y adjuntos PDF.

Además: Command Center (dashboard), Opportunities (SAM.gov), Grants Hub (Grants.gov), Market Intelligence / Competitive Intel / Buyer Geography (USASpending.gov), Code Intelligence (crosswalk NAICS↔SIC↔PSC↔UNSPSC↔NIGP), Bid Pipeline (kanban), y un Panel de Admin con 5 pestañas.

---

## 2. Arquitectura técnica

- **Frontend**: un único archivo `public/index.html` (3732 líneas) — HTML + CSS + JS inline, sin build step, sin framework. SPA con navegación por `nav()`/`showPage()`.
- **Backend**: 8 funciones serverless en `api/*.js` (Vercel), ruteadas vía `vercel.json`:
  - `auth.js` (246 líneas) — autenticación (Supabase Auth).
  - `club.js` (475 líneas) — el corazón del negocio: Alliance, Task Work, Support Desk, Admin (28 acciones).
  - `opportunities.js` (98 líneas) — proxy a SAM.gov.
  - `grants.js` (67 líneas) — proxy a Grants.gov.
  - `geography.js` (270 líneas) — Buyer Geography (USASpending + datos estáticos curados).
  - `spending.js` (191 líneas) — Market Intelligence / Competitive Intel (USASpending).
  - `codes.js` (876 líneas) — crosswalk NAICS/SIC/PSC/UNSPSC/NIGP, ~715 códigos hardcodeados en el propio archivo.
  - `ai.js` (72 líneas) — proxy a Claude API para los "AI Daily Brief" / "AI Strategy Tip".
- **Base de datos**: Supabase Postgres, 8 tablas (`profiles`, `task_catalog`, `work_pool_jobs`, `job_applications`, `support_tickets`, `alliance_requests`, `membership_requests`, `platform_settings`), todas con RLS habilitado.
- **Storage**: 2 buckets privados (`alliance-documents`, `support-documents`), acceso vía signed URLs de 300s generadas server-side.
- **Auth**: Supabase Auth (email/password + un flujo de sesión anónima para trial, construido pero sin UI que lo dispare — ver §5).
- **Despliegue**: Vercel, dominio actual `govbidder-club.vercel.app`. Dominio propio `govbidder.net` registrado pero **sus nameservers apuntan a Cloudflare, no a Vercel** — no está conectado al proyecto todavía.

**Estado de datos actual (producción, con datos de demo/prueba):** 7 perfiles, 13 trabajos, 5 postulaciones, 8 tickets, 5 solicitudes Alliance, 15 ítems de catálogo, 0 solicitudes de membresía reales.

---

## 3. Inventario de páginas — qué es real y qué es demo

| Página | Fuente de datos | Estado |
|---|---|---|
| Command Center (Home) | Mixta | KPIs de Opps/Grants/NAICS/Estado son reales; **"Bids Activos: 3", "Win Rate: 36%" están hardcodeados y nunca se actualizan** |
| Opportunities | SAM.gov (real) | Requiere `SAM_API_KEY` — **no configurada en producción hoy** (ver §6) |
| Grants Hub | Grants.gov (real) | Funcional, sin API key necesaria |
| Market Intelligence / Competitive Intel | USASpending.gov (real) | Funcional |
| Buyer Geography | Mixta | Gasto por estado/condado es real (USASpending); listas de distritos escolares/universidades son curadas a mano y solo cubren 5 de 52 estados |
| Code Intelligence | Estático (por diseño) | ~715 códigos NAICS con crosswalk; el propio Santo confirmó que es un borrador incompleto, tiene el documento completo pendiente de compartir |
| Bid Pipeline | **100% estático/demo** | Tarjetas hardcodeadas en el HTML, sin tabla en Supabase ni endpoint en backend. El drag & drop (recién construido) solo reordena el DOM — se resetea al refrescar |
| Support Desk | Real (Supabase) | Completo: tickets, adjuntos PDF, respuesta admin, marcar resuelto |
| Funding Access (Alliance) | Real (Supabase) | Completo: formulario con 6 campos + 5 documentos + T&C, cálculo con tope configurable |
| Task Work | Real (Supabase) | Completo: catálogo, postulación con gateo exacto de plan, asignación directa por admin, leaderboard |
| Admin | Real (Supabase) | 5 pestañas, todas conectadas 1:1 a acciones de backend, sin ids huérfanos |
| Herramientas | Estático | 4 tarjetas de enlace a otros productos GovBidder (App, AI, Connect, Academy) — sin JS propio |

**Placeholders identificados que simulan una acción sin ejecutarla:** en el modal de detalle de oportunidad/grant, el botón "+ Pipeline" y "🎯 Soporte" solo disparan un `alert()` — no agregan nada al Pipeline (que ni siquiera persiste) ni crean un ticket real.

**Feature construida en backend sin UI**: `api/auth.js` tiene la acción `start_trial` completa (sign-in anónimo + perfil con trial de 7 días) pero no hay ningún botón en el frontend que la dispare.

---

## 4. Modelo de negocio — verificado consistente

Un agente dedicado confirmó, comparando frontend y backend línea por línea:
- El cálculo de Alliance (aporte = costo de mercancía × % del plan, nunca % del valor de la PO) es **idéntico** en los 3 lugares donde se calcula (calculadora pública, preview del formulario, tabla de admin) y en el tope de $15,000.
- El gateo de Task Work usa **match exacto de plan** (no jerárquico) de forma consistente entre backend (`job_apply`) y frontend (`renderOpenJob`, conteo de elegibles) — esto fue una corrección explícita pedida por el usuario en esta misma sesión.
- Las constantes `PLAN_LIMITS` (límites por plan) son idénticas byte a byte entre `api/club.js` y `public/index.html`.
- El flujo de elegibilidad "Academy" en el registro público está conectado end-to-end (formulario → backend → tabla → panel admin).

**Deuda menor identificada:** la constante `PLAN_LEVEL` (jerarquía Elevate<Prime<Legacy) sigue definida en ambos archivos pero ya no se usa en ningún lado desde que se cambió a match exacto — es código muerto que conviene borrar para que nadie lo reintroduzca por error en un futuro endpoint.

---

## 5. Seguridad

Un agente dedicado revisó línea por línea los 8 archivos de `api/*.js` y rastreó las 64 ocurrencias de `.innerHTML =` en `public/index.html` hasta su origen de datos. Hallazgos priorizados por severidad:

### 🔴 Alto
**`api/ai.js` y `api/opportunities.js` validan que el token sea válido, pero nunca chequean si la membresía del usuario está activa o expiró** (a diferencia de `club.js`/`auth.js`, que sí lo hacen). Esto se combina con que **`api/auth.js` todavía expone la acción `start_trial`** (crea una sesión anónima + perfil trial instantáneo, sin CAPTCHA, sin límite de tasa) aunque el frontend ya no la llama en ningún lado. **Escenario de falla concreto:** un script puede generar tokens ilimitados vía `start_trial` y usarlos contra `/api/ai` y `/api/opportunities` para consumir sin control el presupuesto de `ANTHROPIC_API_KEY` y la cuota de `SAM_API_KEY` — ambas compartidas por todos los miembros reales. Es una vía de abuso de costo/DoS contra las dos claves pagas de la plataforma que no requiere ninguna membresía real.

### 🟡 Medio
- `requireMember()` en `api/club.js` no valida expiración de membresía (`isExpired`), solo `profile.active` — si el trial/plan vence a mitad de sesión, el usuario sigue pudiendo crear tickets, solicitudes Alliance y postularse a tareas hasta que el JWT expire naturalmente (~1h).
- **Riesgo de límite de payload de Vercel**: `alliance_request_create` acepta hasta 5 PDFs de 3MB cada uno en el mismo POST (en base64, ~4MB c/u ya codificado) — un miembro legítimo adjuntando varios documentos cercanos al máximo puede superar el límite estándar de Vercel Serverless Functions (4.5MB) y recibir un 413 genérico sin mensaje útil.
- `uploadPdf()` solo valida la extensión `.pdf` del nombre de archivo, no el contenido real (sin chequeo de magic bytes) — mitigado parcialmente porque el upload fuerza `contentType: 'application/pdf'` en Storage.

### 🟢 Bajo
- `ticket_create`: el chequeo de cuota mensual (count + insert) no es atómico — dos submits concurrentes cerca del límite podrían ambos pasar y exceder la cuota de BID Helps.
- `ticket_mark_resolved` no valida server-side que exista `admin_response` antes de dejar que el miembro marque su ticket como resuelto (la UI sí lo oculta, el backend no lo replica) — gap de integridad de flujo, no de seguridad entre usuarios.
- `alliance_request_create` no valida longitud/formato de los campos de texto nuevos (EIN, dirección, entidad, referencia, fechas) — no es explotable como inyección, pero puede producir errores 500 poco descriptivos o inflar la tabla con datos malformados.
- La tabla de Admin Alliance nunca muestra `company`/`description`/EIN/dirección/entidad/referencia/fechas — el admin depende de abrir los PDFs para conocer el detalle completo de a quién le está aprobando el adelanto (gap de completitud, no de seguridad).

### ✅ Confirmado sin hallazgos
- **Todas** las ~20 acciones `admin_*` de `api/club.js` pasan por el gate `requireMember()` + chequeo de `profile.role === 'admin'` antes de ejecutar cualquier lógica — revisadas una por una.
- Race conditions cerradas correctamente con el patrón `.update(...).eq('status','open')` en `job_apply`, `admin_application_review` y `admin_job_assign`.
- XSS: todo dato con origen en la API (Mi Perfil, Support Desk, Task Work, Admin Alliance, Admin Membership) pasa por `escapeHtml()` antes de insertarse en `innerHTML`. El Bid Pipeline es data estática, no es un vector real.
- Signed URLs expiran a los 300s en los 3 paths que las generan — razonable.
- Sin path traversal en Storage (nombre de archivo sanitizado + prefijo por `memberId`).
- Sin IDOR: los endpoints de miembro (`ticket_get_document`, `ticket_mark_resolved`, etc.) filtran siempre por `member_id` propio.

**Hallazgos propios verificados directamente contra Supabase/Vercel:**
- Las 8 tablas tienen RLS habilitado. Las policies existentes usan `auth.uid()` correctamente (ej. `alliance_requests_select_own`, `work_pool_jobs_select` con `status='open' OR claimed_by=auth.uid()`).
- **El frontend nunca usa el cliente de Supabase ni la anon key directamente** — todo pasa por `/api/*` con `service_role` server-side. Esto significa que los grants amplios de `anon`/`authenticated` sobre varias tablas (ej. `profiles` tiene INSERT/UPDATE/DELETE/SELECT otorgado a `anon`) son inertes en la práctica porque nada llama a PostgREST directo desde el navegador — pero es una capa de defensa débil si en el futuro alguien agrega una llamada directa a Supabase desde el cliente sin revisar esto primero.
- `platform_settings` y `membership_requests` no tienen políticas RLS (correcto: deniegan todo acceso salvo `service_role`).
- Bucket `alliance-documents` tiene límite de 3MB y solo permite `application/pdf` a nivel de bucket. **Bucket `support-documents` no tiene ninguna restricción de tamaño ni tipo de archivo a nivel de bucket** — depende 100% de la validación de la aplicación (`uploadPdf()` en `api/club.js`), que solo valida la extensión del nombre de archivo, no el contenido real.
- No se encontraron secretos commiteados en el historial de git; `.gitignore` cubre correctamente `.env*`.

---

## 6. Brechas de lanzamiento (bloqueantes o casi-bloqueantes)

1. **`SAM_API_KEY` no está configurada en Vercel** (solo hay `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Esto significa que **Opportunities — una de las páginas centrales del Command Center — no devuelve resultados reales en producción hoy**. El frontend maneja esto con un empty-state guiado ("configura tu API key"), no rompe, pero el feature está inactivo.
2. **`ANTHROPIC_API_KEY` tampoco está configurada** — el "AI Daily Brief" / "AI Strategy Tip" (Claude) no funciona en producción.
3. **Dominio propio `govbidder.net` no está conectado**: está registrado y aparece en el proyecto de Vercel, pero sus nameservers actuales apuntan a Cloudflare en vez de a Vercel — la app hoy solo es accesible por `govbidder-club.vercel.app`.
4. **Cero responsive design**: no hay ni un solo `@media query` en todo el CSS. Sidebar fijo de 272px, grids de columnas fijas (ej. Bid Pipeline en 5 columnas). En un celular la app hoy se ve rota/inutilizable.
5. **Bid Pipeline es 100% demo** sin persistencia — si el negocio realmente necesita seguimiento de licitaciones en curso, hoy no existe (es solo una maqueta visual).
6. **Housekeeping de cuentas de prueba**: la base de producción tiene 7 perfiles de datos de demo/prueba (incluyendo 2 cuentas cuya contraseña fue reseteada a un valor de prueba para poder verificar funcionalidad durante esta sesión). Antes de invitar miembros reales conviene limpiar estos perfiles de demo o al menos rotarles la contraseña.

---

## 7. Fuera de alcance / pendiente de insumos externos (según la última llamada con Santo)

- Integrar HigherGov/GovBidder Connect como fuente de Home en vez de SAM.gov/Grants.gov — sin decisión firme, Santo iba a compartir acceso a su cuenta de HigherGov.
- Recomendaciones personalizadas por NAICS del miembro en Home — depende de lo anterior.
- Decisión sobre mantener o quitar Bid Pipeline (Santo lo dejó pensando en voz alta) — el usuario ya pidió mejorar su estética y agregar drag & drop en esta sesión, pero la decisión de fondo (¿es una feature real del producto o se descarta?) sigue abierta.
- Lista definitiva de tipos de ticket de soporte — Santo iba a mandar una lista propia.
- Herramienta de calendario para agendar llamadas de soporte (tipo Calendly) — sin decidir/compartir.
- Completar el crosswalk NAICS↔SIC↔PSC↔UNSPSC↔NIGP con el documento real de Santo (hoy es un borrador parcial, ~715 de miles de códigos NAICS existentes).
- Idea de marketplace de "leads" de subcontratación — visión a futuro, sin especificación.

---

## 8. Historial de desarrollo (21 commits)

Cronología resumida: setup inicial → rediseño visual premium (tipografía, iconos) → modo oscuro completo → auth real sobre Supabase (reemplazando usuarios hardcodeados) → conversión de "beneficios de marketing" en funcionalidad real (Alliance/Support/Task Work/Admin) → primera ronda de auditoría de seguridad y fixes → carga de documentos PDF en Alliance → ajustes de tipografía/UI → reorganización del panel Admin en pestañas → compactación del sidebar → segunda auditoría completa (registro público real, Counties con USASpending, requerir sesión en más endpoints) → correcciones de la llamada con Santo (topbar, gateo exacto de plan, Support Desk con respuesta, Alliance con 5 documentos y T&C real) → ajustes finales de UX (perfil de usuario, tabla de Alliance por columnas, wording, Bid Pipeline con drag & drop).

---

## 9. Oportunidades de mejora sugeridas (para discutir, no decididas)

Agrupadas por esfuerzo/impacto — a validar con el equipo:

**Rápidas / bajo riesgo:**
- **Retirar o proteger `start_trial`** en `api/auth.js` (hoy expuesta sin uso en el frontend, sin límite de tasa) — es el hallazgo de seguridad más urgente de esta auditoría.
- Agregar el mismo chequeo de expiración de membresía (`isExpired`) a `api/ai.js` y `api/opportunities.js` que ya tienen `auth.js`/`club.js`.
- Configurar `SAM_API_KEY` y `ANTHROPIC_API_KEY` en Vercel (desbloquea 2 features centrales ya construidas).
- Agregar `file_size_limit`/`allowed_mime_types` al bucket `support-documents` (hoy solo `alliance-documents` los tiene).
- Borrar la constante `PLAN_LEVEL` muerta en ambos archivos.
- Conectar el dominio `govbidder.net` (cambiar nameservers a Vercel) si se decide usarlo como dominio de producción.
- Reemplazar los KPIs hardcodeados de Home ("Bids Activos: 3", "Win Rate: 36%") por datos reales o quitarlos si no hay fuente.
- Decidir qué hacer con los botones stub "+ Pipeline"/"🎯 Soporte" del modal de oportunidad — o se conectan de verdad o se quitan para no prometer algo que no pasa.

**Medianas:**
- Diseño responsive/mobile — hoy inexistente, y probablemente relevante si los miembros van a usar la app desde el celular.
- Unificar la lógica de auth duplicada entre `auth.js`/`club.js`/`ai.js`/`opportunities.js` en un solo helper — hoy `ai.js` y `opportunities.js` no chequean si la membresía expiró, solo si el token es válido.
- Decidir si Grants Hub/Market Intelligence/Buyer Geography/Code Intelligence deberían requerir sesión (hoy no la requieren, a diferencia de Opportunities/AI) — si son beneficios pagos de la membresía, hoy cualquiera con la URL los puede consultar sin cuenta.
- Persistir el Bid Pipeline en Supabase si el negocio decide que es una feature real (hoy es 100% demo visual).

**De producto / requieren decisión de Santo:**
- Ver §7 (integraciones externas, calendario, lista de tipos de soporte, crosswalk completo).
- Definir si "start_trial" (ya construido en backend) se activa con un flujo de UI de registro/trial gratuito, o se descarta.

---

## 10. Metodología de esta auditoría

Se lanzaron 4 agentes en paralelo sobre el código actual (inventario exhaustivo de backend, inventario exhaustivo de frontend/páginas, auditoría de seguridad fresca, y verificación de consistencia de lógica de negocio frontend↔backend), más verificación directa mía contra la Supabase Management API (schema, RLS, políticas, grants, buckets), la Vercel CLI (variables de entorno, dominios) y el historial de git — no se basó en suposiciones ni en documentación previa (no existía ningún `.md` de documentación en el repo antes de este documento).
