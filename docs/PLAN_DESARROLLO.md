# Plan de Desarrollo — GovBidder Club

**Fecha:** 2026-07-13
**Base:** `docs/PDA_GovBidder_Club.md` (auditoría completa) + verificación directa contra el código actual + investigación de fuentes públicas de datos.
**Alcance:** Plan ejecutable **hoy**, sin depender de `SAM_API_KEY`, `ANTHROPIC_API_KEY`, documentos de Santo, acceso a HigherGov, decisión de calendario, ni cambio de nameservers. No se escribió código en esta pasada — solo este documento.

---

## 1. Discrepancias encontradas entre el PDA y el código real

No encontré discrepancias materiales. El PDA es preciso en todos los puntos que verifiqué directamente contra el código (ver método abajo). Un matiz que vale la pena precisar:

- El PDA dice que `api/ai.js` y `api/opportunities.js` "no chequean si la membresía está activa o expiró". Es correcto, pero **la realidad es aún más laxa**: ninguno de los dos consulta la tabla `profiles` en absoluto — solo validan que el JWT sea válido con `supabase.auth.getUser(token)` (`api/ai.js:22-25`, `api/opportunities.js:20-23`). No es que les falte el chequeo de expiración nada más; les falta el lookup completo de perfil. Esto se refleja en la Fase 2 de este plan.

Verificado línea por línea: acciones de `api/auth.js` (incluyendo que `start_trial` sigue viva, línea 57), `requireMember()` en `api/club.js:23-30` (no llama a `isExpired`), `isExpired()` en `api/auth.js:41-43` (solo se usa en `login`/`refresh`/`verify`, líneas 147/178/210), los KPIs hardcodeados de Home (`public/index.html:667-672`, sin `id`, nunca tocados por JS), paridad byte a byte de `PLAN_LIMITS` entre `api/club.js:12-16` y `public/index.html:1690-1694`, y que `PLAN_LEVEL` (`api/club.js:20`, `public/index.html:1695`) no se referencia en ningún otro lado.

---

## 2. Decisiones requeridas antes de ejecutar

### Decisión 1 — Bid Pipeline: ¿eliminar, dejar como maqueta honesta, o construir de verdad?

Hoy es 100% estático: tarjetas hardcodeadas en `public/index.html:1095-1140`, sin tabla en Supabase, sin acción en `api/club.js`. El drag & drop que se construyó la sesión pasada solo reordena el DOM — se resetea al refrescar.

| Opción | Qué implica | Esfuerzo | Riesgo |
|---|---|---|---|
| **A. Eliminar la página completa** | Sacar `#page-pipeline`, la entrada del sidebar, las 5 funciones JS de drag&drop, y el CSS exclusivo de pipeline | ~1.5h | Bajo. Reversible por git en cualquier momento. |
| **B. Persistir de verdad en Supabase** | Nueva tabla (`pipeline_items`: título, entidad, etapa, fecha, resultado), RLS, 4-5 acciones en `api/club.js` (list/create/update_stage/delete), reescribir el frontend para leer/escribir vía API en vez de mover el DOM | 10-14h | Medio — es una feature nueva de punta a punta, con superficie de bugs propia |
| **C. Dejarla pero marcarla explícitamente como "Ejemplo ilustrativo / Próximamente"** | Agregar un badge visible + sacarla de la navegación principal (ej. moverla a "Herramientas" como preview) | ~1h | Bajo |

**Mi recomendación: Opción A.** El propio criterio de priorización de este plan dice "sacar una feature falsa vale más que agregar una mediocre" — Bid Pipeline hoy es exactamente eso: una feature que parece funcionar (drag & drop fluido) pero no persiste nada, lo cual es peor que no tenerla, porque el miembro cree que guardó algo y no. Santo tampoco confirmó que la quiere ("quedó pensando en voz alta"). Construir la Opción B (10-14h) para una feature cuya necesidad de negocio no está confirmada viola el mismo criterio de "no completar features que nadie pidió con certeza". La Opción A es barata, reversible, y es trivial reconstruirla (Opción B) el día que Santo confirme que la quiere — con el mismo diseño visual ya probado en el commit `128e302`.

**Este plan asume la Opción A** en la Fase 1. Si preferís B o C, la Fase 1.1 cambia; avisame antes de ejecutar.

### Decisión 2 — Code Intelligence / Buyer Geography: ¿se puede completar sin Santo?

El PDA los daba por "bloqueados esperando documentos de Santo". Investigué las fuentes públicas reales de cada dataset:

| Dataset | ¿Es público y gratis? | Viable sin Santo |
|---|---|---|
| **NAICS 2022 completo** (hoy solo ~715 de los ~1057 códigos de 6 dígitos) | Sí — [Census.gov Industry and Occupation Code Lists](https://www.census.gov/topics/employment/industry-occupation/guidance/code-lists.html) publica el listado oficial completo, gratis | ✅ Sí, 100% |
| **NAICS ↔ SIC** | Sí — Census/BLS publican [crosswalks oficiales](https://www.bls.gov/emp/documentation/crosswalks.htm) gratis, más [bridges académicos](https://www.ddorn.net/data.htm) de respaldo | ✅ Sí, 100% |
| **NAICS ↔ PSC** | Parcial — GSA publica [crosswalks por vehículo de contrato](https://buy.gsa.gov/interact/system/files/OASIS%20PLUS%20Domain%20NAICS%20Codes%20and%20PSCs%209-15-22.xlsx) (no es un mapeo universal 1:1 para todos los códigos) | ⚠️ Parcial — ver nota abajo |
| **UNSPSC completo** (estructurado, para búsqueda) | No del todo — el PDF es gratis, pero el formato estructurado (Excel/TXT) requiere suscripción paga y firmar un addendum de uso comercial en [unspsc.org](https://www.unspsc.org/codeset-downloads) | ❌ No — requiere presupuesto + acuerdo legal |
| **NIGP completo** | No — es propiedad de Periscope Holdings, requiere licencia paga, prohibido redistribuir sin ella | ❌ No, bajo ninguna circunstancia sin pagar |
| **Distritos escolares / universidades por estado** (hoy solo 5 de 52 estados) | Sí — [NCES Common Core of Data](https://nces.ed.gov/ccd/ccddata.asp) tiene el listado completo de distritos y escuelas públicas de EE.UU., con API | ✅ Sí, 100% |

**Nota sobre NAICS↔PSC:** en vez de depender de los crosswalks estáticos de GSA (que solo cubren ciertos vehículos de contrato), hay una alternativa mejor con los datos que la app **ya consume**: USASpending/FPDS incluye tanto el NAICS como el PSC de cada contrato adjudicado. Se puede construir un crosswalk empírico (qué PSC aparece más seguido junto a cada NAICS en adjudicaciones reales) minando esa data — más útil que un mapeo estático oficial, porque refleja el uso real. Es más trabajo que descargar un archivo, pero no depende de Santo ni de ningún tercero.

**Conclusión:** Code Intelligence (NAICS completo + SIC + PSC empírico) y Buyer Geography (distritos/universidades a 52 estados) **se pueden completar sin Santo**. UNSPSC y NIGP **no** — pero ojo, no es un bloqueo de información como el resto de la lista de "Bloqueado por terceros": es un bloqueo de **presupuesto y firma de acuerdo comercial**, va aparte en la §5.

Este plan incluye la mejora de NAICS/SIC/PSC/NCES como Fase 5 (esfuerzo considerable, no crítica para los 4 criterios de priorización, así que va al final).

---

## 3. Plan por fases

### Fase 1 — Que nada mienta

**Objetivo:** que todo lo que el miembro ve en la app haga exactamente lo que parece hacer.
**Criterio de terminado:** cero botones que solo muestran un `alert()`, cero KPIs que nunca cambian, cero páginas que resetean su estado al refrescar sin avisar que es así.

**1.1 — Eliminar Bid Pipeline** (asume Decisión 1 = Opción A)
- Quitar de `public/index.html`: el bloque `#page-pipeline` (línea 1095 hasta el cierre antes de `<!-- SUPPORT -->`), la entrada del sidebar (línea 580), el hook `if (page === 'pipeline') updatePipelineCounts();` (línea 1720), `'pipeline'` del array `MEMBER_PAGES` (línea 1980), las 5 funciones JS (`pipelineDragStart/End/Over/Leave/Drop`, `updatePipelineCounts`, líneas 3203-3260 aprox.), y el CSS exclusivo de pipeline (líneas 181, 182-191, 194-196, 199 — **cuidado**: NO tocar líneas 192-193 y 197-198, `.pipe-card`/`.pipe-card:hover`/`.pipe-card-title`/`.pipe-card-entity` son compartidas con Task Work).
- Esfuerzo: 1.5h. Riesgo: bajo (el único riesgo real es borrar de más y romper Task Work — mitigado con la lista exacta de líneas de arriba).
- Verificación: Task Work se sigue viendo idéntico (mismas tarjetas), "Bid Pipeline" desaparece del sidebar, no queda ningún `id`/función huérfana (`grep -n "pipeline\|pipe-col" public/index.html` no debe devolver nada relacionado a Bid Pipeline, solo lo compartido).

**1.2 — Reemplazar los 2 KPIs hardcodeados de Home por datos reales**
- Hoy "BIDS ACTIVOS: 3" y "WIN RATE: 36%" (`public/index.html:667-672`) son texto plano sin `id`, nunca actualizados. Al eliminar Bid Pipeline (1.1) tampoco tiene sentido dejarlos apuntando a una fuente que ya no existe.
- Reemplazo propuesto (con datos que la app ya tiene disponibles hoy): **"BID Supports usados este mes"** (de la acción `ticket_list`, campo `data.quota.used`/`data.quota.limit`, ya se usa en Support Desk) y **"Tareas Asignadas"** (de `work_pool_list`, `data.mine.length`, ya se usa en Task Work).
- Cambios: agregar `id` a esas 2 tarjetas KPI en el HTML; crear una función `loadHomeKpis()` que llame a ambas acciones (ya existentes, no hay que tocar backend) y las llene; invocarla en el flujo de carga de Home (junto a `fetchOpps()`/`fetchGrants()`).
- Esfuerzo: 3h. Riesgo: bajo (solo lectura de endpoints existentes).
- Verificación: con una cuenta que ya usó 1 BID Support y tiene 1 tarea asignada, loguear y confirmar que Home muestra "1 de X" y "1", no valores fijos.

**1.3 — Conectar o quitar los botones stub del modal de oportunidad**
- `public/index.html:1648` — `"+ Pipeline"` (`onclick="alert('✅ Agregado al Pipeline!')"`): al eliminar Bid Pipeline (1.1), este botón ya no tiene destino → **quitar el botón entero**.
- `public/index.html:1649` — `"🎯 Soporte"` (`onclick="alert('Ticket creado')"`): conectar de verdad — al clickear, navegar a Support Desk con el campo `support-link` precargado con el link de la oportunidad (`o.link`, ya disponible en `openModal(o)`, línea 2247).
- Esfuerzo: 2h. Riesgo: bajo.
- Verificación: abrir el detalle de una oportunidad, clickear "Soporte", confirmar que aterriza en Support Desk con el link ya puesto en el campo, listo para escribir el mensaje y enviar.

---

### Fase 2 — Que no queme plata ni se rompa

**Objetivo:** cerrar el agujero de abuso de costo antes de que las API keys existan, y unificar la validación de sesión.
**Criterio de terminado:** ningún endpoint permite operar con una membresía inactiva/expirada; no existe ninguna vía de generar sesiones sin control.

**2.1 — Eliminar la acción `start_trial` de `api/auth.js`**
- Bloque completo en `api/auth.js:57-90`. No está referenciada en ningún `fetch` de `public/index.html` — es código muerto expuesto, no una feature en uso.
- Esfuerzo: 1h. Riesgo: bajo (nada del frontend la llama, no hay superficie visible que dependa de ella).
- Verificación: `curl -X POST https://govbidder-club.vercel.app/api/auth?action=start_trial` debe responder `{"success":false,"error":"Acción inválida: start_trial"}`.

**2.2 — Unificar la validación de sesión+membresía en un helper compartido**
- Crear `api/_lib/auth.js` con una función `requireActiveMember(token)` que: valide el token (`supabase.auth.getUser`), traiga el `profile`, valide `profile.active` **y** `isExpired(profile)` (portando la función de `api/auth.js:41-43`), y devuelva `{ profile }` o `{ error, status }` con el mismo shape que usa hoy `requireMember()` de `api/club.js` (para minimizar el diff en los ~28 call sites de ese archivo).
- Reemplazar: `requireMember()` en `api/club.js:23-30` (agregarle el chequeo de expiración que hoy no tiene), la validación manual de `api/ai.js:22-25`, y la de `api/opportunities.js:20-23` — los 3 pasan a importar y usar el mismo helper.
- Esfuerzo: 5h (crear el helper + migrar 3 archivos + revisar que ninguna de las ~28 acciones de `club.js` cambie de comportamiento salvo la nueva validación de expiración).
- Riesgo: **medio** — es el punto de entrada de absolutamente todas las acciones de `club.js`; un error acá tumba toda la app. Mitigación: mantener el mismo shape de retorno, correr `node --check` y probar cada acción con `curl` antes de deployar.
- Verificación: tomar una cuenta de prueba, ponerle `plan_expiry` en el pasado directamente en Supabase, y confirmar que **las tres** superficies (`club.js` — cualquier acción, `ai.js`, `opportunities.js`) le devuelven error de sesión expirada — hoy solo `login`/`refresh`/`verify` lo hacen.

**2.3 — Mitigar el riesgo de payload >4.5MB en `alliance_request_create`**
- El límite duro de Vercel Serverless Functions es 4.5MB por request ([confirmado en la doc oficial](https://vercel.com/docs/functions/limitations), error `FUNCTION_PAYLOAD_TOO_LARGE`). Hoy `alliance_request_create` acepta hasta 5 PDFs de 3MB cada uno (`uploadPdf()`, `api/club.js:38-50`, `maxMB=3` por default) — un solo PDF de 3MB ya pesa ~4.1MB en base64, y sumando el resto del JSON del formulario, **un solo documento cerca del máximo ya puede superar el límite**, no hace falta subir los 5.
- Cambio: bajar el límite de los 4 documentos opcionales (adjudicación, cotización, cronograma, estado de cuenta) a 1.5MB cada uno, dejar 3MB solo para la PO (el único obligatorio); y en el frontend (`submitAllianceApp()`, sección de armado del `payload`), sumar el tamaño total en base64 de todos los archivos antes de enviar y mostrar un error claro si supera ~4MB, en vez de dejar que Vercel devuelva un 413 genérico.
- Esfuerzo: 3h. Riesgo: bajo.
- Verificación: subir 5 PDFs de ~1.4MB cada uno (rozando el nuevo límite) → debe enviarse sin problema; forzar un archivo de más de 1.5MB en uno opcional → debe dar el mensaje de error del frontend, no un 413 crudo del servidor.
- **Nota para el futuro (fuera de esta fase):** la solución de fondo si el negocio necesita PDFs más grandes de verdad es subir directo del navegador a Supabase Storage con una signed upload URL, sin pasar el archivo por la función serverless — es un cambio de arquitectura de subida, no lo incluyo en esta ronda.

**2.4 — Gaps de integridad menores**
- `ticket_mark_resolved` (`api/club.js`): agregar chequeo server-side de que `admin_response` no sea null antes de permitir que el miembro marque su ticket como resuelto (hoy solo lo oculta el frontend). Esfuerzo: 30min.
- Borrar la constante muerta `PLAN_LEVEL` de `api/club.js:20` y `public/index.html:1695`. Esfuerzo: 15min.
- `ticket_create`: el chequeo de cuota mensual no es atómico (race condition de bajo impacto — como mucho un miembro manda 1 ticket de más en el mes). **No lo incluyo en esta fase** — cerrarlo del todo requeriría una constraint a nivel de base de datos, desproporcionado para el impacto real; lo dejo anotado como riesgo aceptado.
- Agregar `file_size_limit`/`allowed_mime_types` al bucket `support-documents` (hoy solo `alliance-documents` los tiene) para igualar la protección a nivel de Storage. **Esto toca configuración de producción (Supabase Storage) — requiere tu confirmación explícita antes de ejecutar**, aunque el cambio en sí es de bajo riesgo (solo agrega restricciones, no las quita). Esfuerzo: 15min una vez autorizado.

---

### Fase 3 — Que funcione en el teléfono

**Objetivo:** que la app sea usable en un celular de gama media (375-412px de ancho).
**Criterio de terminado:** las páginas principales (Home, Opportunities, Support Desk, Alliance, Task Work) se navegan y usan completas en un viewport de 390px sin scroll horizontal no intencional ni elementos cortados.

Hoy hay **cero** `@media queries` en todo el CSS (`public/index.html`) — sidebar fijo de 272px, grids de columnas fijas, gran parte del layout definido con estilos inline en vez de clases. Esto hace el trabajo más laborioso que en un proyecto con CSS centralizado, porque cada `@media` tiene que sobreescribir selectores específicos en vez de tocar una sola clase.

- **3.1 Sidebar colapsable en mobile** (botón hamburguesa, sidebar se oculta por default bajo cierto ancho y se abre como overlay) — 4h.
- **3.2 Topbar: stack en columna, ocultar/priorizar elementos secundarios** — 2h.
- **3.3 Grids de KPIs y layouts de 2 columnas (`grid-2b`, `kpi-grid`, etc.) a 1 columna en mobile** — 6h (hay decenas de `grid-template-columns` inline a auditar).
- **3.4 Tablas anchas del panel Admin con scroll horizontal explícito** (ya se agregó en la tabla de Alliance; falta en Tickets, Jobs, Membership) — 2h.
- **3.5 QA completo en viewport 375px/390px/768px para las 5 páginas principales + ajustes finos** — 6h.

**Esfuerzo total estimado: ~20h. Riesgo: medio** (no por complejidad técnica de cada cambio individual, sino porque el volumen de estilos inline hardcodeados hace fácil que algo quede sin cubrir; requiere QA visual exhaustivo, no solo revisar código).

**Verificación:** Chrome DevTools con device toolbar en iPhone SE (375px) y un Android típico (390-412px), recorriendo el login, Home, Opportunities, Support Desk, Alliance y Task Work.

---

### Fase 4 — Que el admin pueda operar

**Objetivo:** que Santo/equipo puedan tomar decisiones (aprobar Alliance, responder tickets) sin tener que abrir PDFs uno por uno para ver datos básicos.
**Criterio de terminado:** el admin ve todo el contexto de una solicitud Alliance sin salir de la tabla/modal, y un miembro puede ver el estado de sus propias solicitudes.

**4.1 — Modal de detalle en Admin Alliance con los campos que hoy faltan**
- La tabla de `loadAdminAlliance()` (`public/index.html`) no muestra `company`, `description`, `ein`, `businessAddress`, `governmentEntity`, `contractReference` ni las fechas — el admin depende de abrir los 5 PDFs para reconstruir el contexto completo.
- Agregar un botón "Ver detalle" por fila que abra el modal reutilizable (`showSimpleModal`, ya usado para "Mi Perfil" y el visor de documentos de Alliance) con todos estos campos en un solo lugar, más los 5 links de documentos ya existentes.
- Esfuerzo: 2h. Riesgo: bajo.
- Verificación: abrir el detalle de una solicitud con todos los campos cargados y confirmar que se ve completo sin abrir ningún PDF.

**4.2 — Nueva acción para que el miembro vea el estado de sus propias solicitudes Alliance**
- Gap real encontrado en esta verificación (no estaba en el PDA): hoy **no existe ningún endpoint** para que un miembro consulte sus propias solicitudes de Alliance después de enviarlas — solo existe `admin_alliance_list` (admin-only) y `alliance_request_create`. Un miembro que aplicó no tiene forma de ver si sigue pendiente, fue aprobada o rechazada, salvo que lo contacten.
- Agregar acción `alliance_my_requests` en `api/club.js` (select `alliance_requests` filtrado por `member_id = profile.id`, sin necesidad de rol admin) y una tabla en la página de Funding Access que la muestre.
- Esfuerzo: 4h. Riesgo: bajo.
- Verificación: enviar una solicitud de prueba, confirmar que aparece en la vista del miembro con estado "Pendiente", y que al aprobarla/rechazarla desde Admin el estado se actualiza del lado del miembro.

---

### Fase 5 — Code Intelligence y Buyer Geography con datos públicos (ver Decisión 2)

**Objetivo:** ampliar cobertura de datos de referencia sin depender de Santo.

**Estado real (ejecutado y verificado en producción):**

- ✅ **5.1a NAICS 2022 completo — HECHO.** `NAICS_DB` en `api/codes.js` pasó de 626 a 1377 códigos, usando el árbol oficial de USASpending.gov (misma fuente que ya usa el resto de la app) recorriendo sector → grupo → código de 6 dígitos vía su API pública. Título y sector 100% reales, verificado en producción (`GET /api/codes?type=search&query=Berry` devuelve el código nuevo `111334` con su título oficial).
- ⚠️ **5.1b Crosswalk NAICS↔SIC — NO viable con los recursos investigados.** La única fuente oficial (Census.gov) publica el crosswalk como un manual en PDF de 7MB sin estructura parseable de forma confiable; no existe un CSV/JSON público equivalente al que sí tiene NAICS. Los códigos nuevos agregados en 5.1a quedan con `sic: null` — se corrigieron `getSICTitle()`/`getPSCTitle()`/`getUNSPSCTitle()` y la acción `search` en `api/codes.js` para mostrar "No disponible en esta base todavía" / "N/D" en vez de renderizar "SIC undefined" (bug real que se hubiera introducido de no arreglarlo).
- ⚠️ **5.2 Crosswalk NAICS↔PSC — NO completado.** GSA solo publica crosswalks parciales atados a vehículos de compra específicos (OASIS, PS-MAS), no una tabla universal. La opción de minarlo empíricamente desde USASpending/FPDS (consultar adjudicaciones reales por NAICS y agregar el PSC más frecuente) sigue siendo viable pero no se ejecutó en esta ronda — queda como tarea concreta de ~6-8h para una próxima sesión.
- ❌ **5.3 Distritos escolares/universidades a 52 estados — bloqueado.** El único endpoint que no requiere descargar archivos manualmente (Urban Institute Education Data API) está detrás de un desafío de Cloudflare (`Just a moment...` / challenge JS) — **no se intentó sortear por ser exactamente el tipo de detección anti-bot que no se debe bypasear**. La alternativa (NCES Common Core of Data, archivos descargables directos) requiere ubicar las URLs exactas de archivo en su portal de descargas, algo que no se llegó a hacer — queda como tarea pendiente de exploración manual, no de scripting.
- ❌ **UNSPSC estructurado completo y NIGP completo — confirmado no viables sin pagar.** UNSPSC requiere suscripción + firmar un addendum de uso comercial en unspsc.org. NIGP es propiedad de Periscope Holdings y su redistribución sin licencia está prohibida. Ninguno de los dos es un problema de "más tiempo de scripting" — son bloqueos de presupuesto/licencia, van en la sección de terceros más abajo.

**Commit:** `ca13b45` — desplegado y verificado en producción.

---

## 4. Orden de ejecución y dependencias

- **Fase 1 y Fase 2 son independientes entre sí** (tocan archivos distintos sin overlap real) — se pueden ejecutar en paralelo si hay más de una persona.
- **2.2 (unificar auth) debe completarse ANTES de configurar `SAM_API_KEY`/`ANTHROPIC_API_KEY`** — si las keys se activan mientras el gap de validación sigue abierto, el riesgo de abuso de costo pasa de dormido a activo en el mismo deploy. Este es el único bloqueo de orden estricto de todo el plan.
- **1.1 (eliminar Bid Pipeline) debe ir antes que 1.2 y 1.3**, porque ambas dependen de que Bid Pipeline ya no exista (1.2 necesita una fuente de reemplazo para los KPIs, 1.3 necesita saber que "+ Pipeline" no tiene destino).
- **Fase 3 (responsive) no depende de nada** — es la de mayor esfuerzo, conviene paralelizarla con 1/2 si hay más de una persona, o dejarla para el final si es una sola.
- **Fase 4 no depende de nada técnico**, pero 4.2 tiene sentido hacerla después de 1.2 (mismo patrón de "traer mis propios datos vía un endpoint nuevo liviano").
- **Fase 5 es completamente independiente** del resto — se puede hacer en cualquier momento, incluso en paralelo con todo lo demás.

**Esfuerzo total del plan ejecutable (Fases 1-5):** aproximadamente 55-70 horas, con la Fase 3 (mobile) y la Fase 5 (datos públicos) concentrando la mayor parte.

---

## 5. Bloqueado por terceros

| Qué falta | De quién | Qué desbloquea |
|---|---|---|
| `SAM_API_KEY` | Santo (sin fecha) | Opportunities con resultados reales de SAM.gov |
| `ANTHROPIC_API_KEY` | Santo (sin fecha) | AI Daily Brief / AI Strategy Tip funcionando |
| Documento completo de crosswalk de Santo | Santo | Reconciliar con la versión pública construida en Fase 5, por si Santo tiene una curación propia distinta/prioritaria |
| Acceso a HigherGov / GovBidder Connect | Santo | Evaluar reemplazar SAM.gov/Grants.gov como fuente de Home |
| Lista definitiva de tipos de ticket de soporte | Santo | Actualizar las opciones del formulario de Support Desk |
| Decisión/herramienta de calendario para BID Help | Santo | Agendar llamadas de soporte desde la plataforma |
| Cambio de nameservers de `govbidder.net` a Vercel | Quien administre el registrador del dominio | Que la app sea accesible por el dominio propio en vez de `govbidder-club.vercel.app` |
| Suscripción + addendum comercial de UNSPSC | Decisión de presupuesto (no específicamente Santo) | Codeset UNSPSC estructurado completo en Code Intelligence |
| Licencia de Periscope Holdings para NIGP | Decisión de presupuesto (no específicamente Santo) | Codeset NIGP completo en Code Intelligence |

---

## 6. Explícitamente fuera de alcance de este plan

- **Persistir Bid Pipeline de verdad en Supabase** (Opción B de la Decisión 1) — condicionado a que Santo confirme que la feature es real y prioritaria. Si lo confirma, es un plan de fase aparte (~10-14h ya estimadas arriba).
- **Cualquier flujo de trial gratuito real conectado a una UI** — este plan recomienda *eliminar* `start_trial` en vez de darle una interfaz; si el negocio decide que sí quiere ofrecer trial gratis, es una decisión de producto nueva, no incluida acá.
- **Cualquier integración de cobro/pagos** — el alta de miembros sigue siendo un formulario revisado a mano, tal como está hoy.
- **UNSPSC y NIGP completos** — ver §5, requieren presupuesto y acuerdos comerciales, no son resolubles con datos públicos bajo ninguna circunstancia.
- **Integración HigherGov/GovBidder Connect, calendario, lista de tipos de soporte** — ver §5, todos dependen de un insumo que solo Santo puede proveer.
- **Migrar la subida de archivos a Vercel Blob / signed direct upload** — mencionado como mejora futura en 2.3, no incluido en el esfuerzo de esta ronda (cambio de arquitectura de subida, no una mitigación puntual).
- **Refactor de la lógica `byVendor` duplicada entre `spending.js`/`geography.js`** — deuda técnica menor señalada en el PDA, no prioritaria según los 4 criterios de esta ronda.
- **Cerrar al 100% la race condition de cuota en `ticket_create`** — ver 2.4, el impacto real es bajo y cerrarlo del todo requeriría una constraint de base de datos desproporcionada para el riesgo.

---

## Nota sobre la base de producción

La base tiene 7 perfiles de demo/prueba, 2 de ellos con contraseña reseteada a un valor de prueba durante la sesión de verificación anterior. **Ninguna tarea de este plan borra datos.** Antes de invitar miembros reales, se recomienda desactivar (`profiles.active = false`) o rotar la contraseña de las cuentas de demo — nunca eliminarlas directamente — y **cualquier acción contra la base de producción (incluida esta) requiere confirmación humana explícita antes de ejecutarse**, tal como pide el brief.
