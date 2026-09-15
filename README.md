# LaTeX Collab

Ver [SPEC.md](./SPEC.md) para la especificación completa (arquitectura, flujos,
alcance). Este README es solo la guía rápida para correr el proyecto.

## Estructura

```
packages/
  shared/    # tipos TypeScript compartidos
  server/    # servidor Node/TS: REST + WebSocket (Yjs) + persistencia a disco
  desktop/   # app Tauri (React + CodeMirror6) — cliente
templates/   # plantillas base (article, report, beamer, cv)
```

## Instalación

### Opción 1 — un solo comando (recomendado)

```bash
./setup_latex.sh
```

Detecta tu sistema (macOS/Linux) e instala todo lo que falte: Node.js, Rust
(necesario para compilar la app de escritorio Tauri), las librerías del
sistema que Tauri requiere, las dependencias del proyecto, y opcionalmente
Tailscale — incluyendo **activar Tailscale Funnel automáticamente**, para que
el link de "Compartir" funcione para cualquiera en internet sin que instale
nada (ver sección de abajo). Se puede correr varias veces sin problema — cada
paso se salta solo si ya está instalado. Al final ofrece arrancar el
servidor y la app. Usa `./setup_latex.sh --yes` para saltarte todas las
preguntas.

Verificado en esta sesión en macOS de punta a punta: detección de lo ya
instalado, `npm install`, y **Tailscale Funnel real activado y probado**
(incluyendo el caso de la instalación de Tailscale por app/App Store en Mac,
cuyo CLI vive en `/Applications/Tailscale.app/Contents/MacOS/Tailscale` y no
en el PATH — el script y el servidor lo buscan ahí también). Confirmado con
una petición real de internet llegando al servidor a través de la URL
`https://tu-maquina.tu-tailnet.ts.net`. No verificado en Linux ni Windows.

### Opción 2 — manual

Necesitas Node.js 18+ y Rust ya instalados (ver
[requisitos de Tauri](https://v2.tauri.app/start/prerequisites/) para las
librerías del sistema en Linux):

```bash
npm install   # instala todo el monorepo (workspaces)
```

## Instalar la app (si te compartieron un link)

Repo: https://github.com/Demonio0N1/latex-collab — clona o descarga, y corre
`./setup_latex.sh` (ver abajo). `APP_DOWNLOAD_URL` en
`packages/server/src/config.ts` ya apunta aquí; si haces un fork o lo mueves
a otra cuenta, actualiza esa constante (o la variable de entorno
`LATEX_COLLAB_DOWNLOAD_URL`) para que el link de "instalar la app" de tus
propios proyectos compartidos apunte a tu copia.

## Correr el servidor de colaboración

```bash
npm run server:dev
# escucha en http://localhost:5959
```

Verificado en esta sesión: crear proyecto, unirse con contraseña, servir
plantillas, importar `.zip`, sincronización en tiempo real entre **5
clientes concurrentes** (sin límite de 2 — cualquier cantidad de personas
puede editar el mismo archivo a la vez), persistencia a disco en texto plano
legible por cualquier compilador, y el flujo completo de link compartible
(ver abajo).

## Correr la app de escritorio (dev)

```bash
npm run desktop:dev
```

Verificado en esta sesión con un build real (`tauri build --debug`, no solo
`tsc`/`vite build`): la app compila, empaqueta un `.app` de macOS válido, se
registra ante el sistema como manejador de `latexcollab://`, y el flujo de
click-en-link → abrir app → auto-unirse → conectar WebSocket funciona de
punta a punta.

1. Reemplaza el ícono placeholder en `packages/desktop/src-tauri/icons/icon.png`
   con tu logo real (usa `npx tauri icon ruta/a/tu/logo.png`).
2. Tauri v2 exige declarar de antemano, en
   `packages/desktop/src-tauri/capabilities/default.json`, cada programa
   externo que la app puede ejecutar — no se puede correr un comando
   arbitrario que alguien escriba en un campo de texto (a diferencia de lo
   que asumí al principio; lo descubrí probando en vivo y lo corregí). Por
   eso:
   - "Abrir/compilar con mi programa" usa el mecanismo de "abrir con" del
     sistema operativo (`opener:allow-open-path`, con el nombre de la app
     como parámetro, ej. "Texmaker") en vez de ejecutar un comando — así
     funciona con cualquier app instalada sin necesitar permiso extra.
   - "Vista previa PDF" solo puede ejecutar `latexmk` (allowlisted
     explícitamente en `capabilities/default.json`); el motor se elige con
     un desplegable (pdfLaTeX/XeLaTeX/LuaLaTeX), no con texto libre.
   - En macOS también corregí que las apps GUI no heredan el PATH de tu
     terminal (`/Library/TeX/texbin` no está visible por defecto) — la app
     lo agrega ella misma al arrancar (ver `src-tauri/src/lib.rs`).

## Cómo compartir un proyecto (link clicable)

1. Con el proyecto abierto, botón **"Compartir"**.
2. Si tu servidor corre en `localhost`, el diálogo detecta tus IPs de red
   (LAN y VPN/Tailscale si tienes una activa) y te deja elegir con cuál
   generar el link — "localhost" no sirve para nadie más que tú.
3. Copia el **link** (`http://tu-ip:5959/open?host=...&id=...&key=...`) y
   mándalo por donde quieras — es un link `http://` normal, cualquier app de
   mensajería lo va a mostrar como clicable.
4. Al abrirlo, la otra persona ve una página que intenta abrir la app
   automáticamente (esquema `latexcollab://`, registrado ante el sistema
   operativo la primera vez que se instala/ejecuta la app). Si no tiene la
   app, la misma página le muestra un botón para descargarla
   (`APP_DOWNLOAD_URL`, ver arriba).
5. Si el esquema resuelve correctamente, la app se abre/enfoca sola, se
   une al proyecto automáticamente con los datos del link, y conecta el
   editor — sin que la otra persona tenga que copiar/pegar nada a mano.
   (La opción de pegar el link o ID+contraseña a mano en "Unirse" sigue
   disponible como alternativa.)

### Compartir fuera de tu red — 3 niveles, de más a menos automático

**1. Tailscale Funnel (recomendado, totalmente automático) —** `setup_latex.sh`
puede activarlo por ti. Le da a tu servidor una URL pública real
(`https://tu-maquina.tu-tailnet.ts.net`), servida por Tailscale con HTTPS
válido. **La otra persona NO necesita Tailscale, ni cuenta, ni nada** — solo
recibe el link y hace clic. El diálogo "Compartir" detecta automáticamente
si Funnel está activo y lo marca con 🌐 como opción sugerida. Si al correr
el setup no se activó solo, hazlo a mano:
```bash
tailscale funnel --bg 5959
```
(la primera vez puede pedirte habilitar "HTTPS Certificates" en
https://login.tailscale.com/admin/dns y confirmar que Funnel esté permitido
en https://login.tailscale.com/admin/acls — son ajustes de tu cuenta de
Tailscale, una sola vez).

**2. Tailscale sin Funnel, con cuentas separadas —** si prefieres no exponer
nada a internet público, cada quien mantiene su propia cuenta de Tailscale y
tú compartes solo tu máquina: tailscale.com/admin → Machines → tu servidor →
*Share* → generas un link de invitación. La otra persona, con su propia
cuenta (cualquier proveedor), lo acepta y puede alcanzar tu máquina por su
IP `100.x.x.x` — sin unirse a tu red completa ni ver tus otros dispositivos.
(También puedes invitarla como miembro completo de tu tailnet, más simple
pero menos aislado.)

**3. Sin Tailscale —** port forwarding + tu IP pública, o alojar el servidor
en un VPS. Funciona pero expone el servidor sin el cifrado/autenticación que
Tailscale da gratis; no recomendado salvo que sepas lo que haces.

## Flujo típico

1. `npm run server:dev` en la máquina que va a alojar el proyecto.
2. `npm run desktop:dev` — crear un proyecto nuevo eligiendo carpeta (por
   defecto `Documentos/LaTeX Projects/<nombre>` o `Escritorio/...`, elegible)
   y plantilla, o importar un `.zip`.
3. "Compartir" → enviar el link.
4. N personas (no hay límite de 2) editan a la vez, con cursores de colores,
   pestañas por archivo, y lista de presencia en tiempo real.
5. Cada quien usa "Abrir/compilar con mi programa" para lanzar su propio
   editor/compilador sobre su copia local sincronizada — nadie depende del
   compilador de nadie más.
6. Opcional: botón **"Vista previa PDF"** en la barra superior — abre un
   panel al lado del editor (como Overleaf). En vez de relanzar el
   compilador desde cero en cada cambio, arranca **un solo proceso**
   `latexmk -pvc` (modo de vigilancia continua) que vigila el archivo y
   recompila incrementalmente él solo — evita pagar el costo de arranque de
   LaTeX en cada tecla, así que en la práctica es más rápido que ir
   relanzando "Quick Build" a mano en TeXmaker. Cada persona compila con su
   propia instalación local (elige motor: pdfLaTeX/XeLaTeX/LuaLaTeX) —
   nadie depende del compilador de nadie más. Necesitas tener una
   distribución LaTeX instalada (TeX Live, MacTeX, MiKTeX) — no viene
   incluida. "Ver log" muestra la salida de `latexmk` para depurar errores.
   Verificado en esta sesión en macOS: arranqué `latexmk -pvc` de verdad,
   edité el archivo vigilado, y confirmé que recompiló solo sin que nadie
   relanzara el proceso.

## Conocido / pendiente

- Tailscale Funnel: probado en vivo (macOS, Tailscale 1.102.3) — activación
  vía script, detección automática en el servidor, y una petición HTTPS real
  llegando desde la URL pública. La detección parsea el texto de
  `tailscale funnel status`; si una versión futura de Tailscale cambia ese
  formato, se degrada a "no hay Funnel activo" sin romper el resto de la
  app. No probado en Linux/Windows.
- **Recuerda apagar Funnel cuando no lo necesites**: `tailscale funnel --https=443 off`
  (o desde la app de Tailscale) — mientras esté activo, tu servidor de
  LaTeX Collab es alcanzable por cualquiera con el link, no solo por quien
  invites tú (la autenticación por ID+contraseña del proyecto sigue
  aplicando, pero el servidor en sí queda expuesto a internet).
- Renombrar/crear/borrar archivos desde la UI (hoy solo vía import/disco).
- Endurecer permisos de Tauri (`shell:allow-execute`) a un scope más
  restringido una vez definido el flujo real de instalación.
- El registro del esquema `latexcollab://` en Windows/Linux usa
  `register_all()` en runtime (ver `src-tauri/src/lib.rs`) — probado en esta
  sesión solo en macOS; en Linux/Windows debería funcionar igual pero no se
  verificó aquí.
- Advertencia moderada de auditoría npm en `vite`/`esbuild`: solo afecta al
  servidor de desarrollo (`vite dev`), no a la app empaquetada; revisar antes
  de exponer el dev server a una red no confiable.
