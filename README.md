# LaTeX Collab

Editor de LaTeX colaborativo en tiempo real, autoalojado — como Google Docs
para proyectos de LaTeX, pero corriendo en tu propia máquina, sin nube de
por medio. Varias personas editan el mismo archivo a la vez, con cursores
de colores, y cada quien compila con el programa que prefiera (Texifier,
TeXmaker, o la vista previa integrada).

Ver [SPEC.md](./SPEC.md) para la arquitectura completa. Este README es la
guía de instalación y uso.

## Instalación desde cero

### 1. Requisitos previos

Solo necesitas tener **Git** instalado. Todo lo demás (Node.js, Rust, las
librerías de sistema que necesita la app de escritorio, y opcionalmente
Tailscale) lo instala el script del paso 3 — no hace falta instalarlo a
mano de antemano.

Sistemas soportados: **macOS** y **Linux**.

### 2. Clonar el repositorio

```bash
git clone https://github.com/Demonio0N1/latex-collab.git
cd latex-collab
```

### 3. Correr el instalador

```bash
chmod +x setup_latex.sh
./setup_latex.sh
```

Esto detecta tu sistema operativo e instala automáticamente lo que falte:

- **Node.js** (vía `nvm`)
- **Rust** (vía `rustup`) — necesario para compilar la app de escritorio (Tauri)
- Las **librerías de sistema** que Tauri necesita (en Linux: `webkit2gtk` y
  compañía; en macOS: Xcode Command Line Tools)
- Opcionalmente **Tailscale**, con la opción de activar **Tailscale
  Funnel** automáticamente (para que los links de "Compartir" funcionen
  para cualquiera en internet, sin que instalen nada — ver más abajo)
- Una **distribución LaTeX** (`latexmk`) si no encuentra una — la necesita
  el botón "Vista previa PDF" para compilar (BasicTeX en macOS, TeX Live en
  Linux). Si vas a usar Texifier/TeXmaker en vez de la vista previa
  integrada, igual la vas a necesitar — esos editores también dependen de
  tener esto instalado por separado, no traen su propio motor.
- Las **dependencias del proyecto** (`npm install`)

Se puede correr las veces que quieras sin romper nada: cada paso se salta
solo si ya está instalado. Usa `./setup_latex.sh --yes` para saltarte todas
las preguntas y aceptar los valores recomendados.

Al final, el script te pregunta si quieres arrancar el servidor y la app
de una vez. Si dices que no, hazlo manualmente:

```bash
npm run server:dev     # servidor de colaboración, en una terminal
npm run desktop:dev    # app de escritorio, en otra terminal
```

La primera vez que arranca la app de escritorio, va a compilar la parte
nativa (Rust/Tauri) — puede tardar varios minutos la primera vez mientras
descarga dependencias. Las siguientes veces es casi instantáneo.

### 4. Primer uso

1. En la ventana que se abre, clic en **"Nuevo proyecto"**.
2. Ponle un nombre, elige una plantilla (artículo, reporte, presentación,
   CV) o importa un `.zip` existente, y elige dónde guardar la carpeta
   (por defecto en `Documentos/LaTeX Projects/` o `Escritorio/`).
3. Ya puedes escribir. Usa la barra de herramientas del editor para
   insertar tablas, imágenes, fórmulas, listas, etc. sin memorizar la
   sintaxis de LaTeX.
4. Botón **"Vista previa PDF"** si quieres ver el resultado compilado al
   lado del editor en tiempo real, usando la distribución LaTeX que
   `setup_latex.sh` instaló (o la que ya tenías).
5. Botón **"Compartir"** para invitar a alguien más — ver la sección de
   abajo.

## Cómo compartir un proyecto

1. Con el proyecto abierto, botón **"Compartir"**.
2. El diálogo te sugiere direcciones para el link, incluyendo (si activaste
   Tailscale Funnel) una marcada con 🌐 que funciona para **cualquiera en
   internet sin que instale nada**. Sin eso, usa tu IP de red local (solo
   sirve en la misma Wi-Fi) o tu IP de Tailscale (solo sirve si la otra
   persona también está conectada a tu Tailscale).
3. Copia el link y mándalo por donde quieras (WhatsApp, correo, Slack...) —
   es un link `http(s)://` normal, cualquier app lo muestra como clicable.
4. Al abrirlo, si la otra persona ya tiene la app instalada, se abre sola y
   se une al proyecto automáticamente. Si no la tiene, la misma página le
   ofrece un link para descargarla desde este repositorio.

### Compartir fuera de tu red — tres niveles

| Nivel | Qué necesita la otra persona | Configuración |
|---|---|---|
| **Tailscale Funnel** (recomendado) | Nada — ni cuenta ni instalar Tailscale | Automático desde `setup_latex.sh`, o `tailscale funnel --bg 5959` a mano |
| **Tailscale sin Funnel** | Su propia cuenta de Tailscale (cualquier proveedor) | Tú compartes solo tu máquina desde [el panel de Tailscale](https://login.tailscale.com/admin/machines) → *Share* |
| **Sin Tailscale** | Nada, pero expone tu servidor a internet sin cifrado | Port forwarding + tu IP pública, o alojar en un VPS |

La primera vez que actives Funnel puede pedirte habilitar "HTTPS
Certificates" en el [panel de DNS de Tailscale](https://login.tailscale.com/admin/dns)
— es un ajuste de tu cuenta, una sola vez.

## Abrir la app: ícono y comando de terminal

- **Linux**: al instalar el `.deb` o integrar el `.AppImage`, la app aparece
  con ícono en el menú de aplicaciones, y el comando `latex_collab` queda
  disponible en cualquier terminal (el binario se llama así — ver
  `mainBinaryName` en `tauri.conf.json`). No hace falta ningún paso extra.
- **macOS**: la app ya se ve como ícono normal en Launchpad/Dock/Finder al
  estar en `/Applications`. Para abrirla también escribiendo `latex_collab`
  en la terminal, `setup_latex.sh` te ofrece crear ese comando (un pequeño
  script en `$(brew --prefix)/bin` que hace `open -a "LaTeX Collab"`).
  Verificado en esta sesión: compilar, registrar la app, y luego
  `latex_collab` desde una terminal nueva la abre correctamente.

## Estructura del proyecto

```
packages/
  shared/    # tipos TypeScript compartidos entre servidor y app
  server/    # servidor Node/TS: REST + WebSocket (Yjs CRDT) + persistencia a disco
  desktop/   # app de escritorio: Tauri + React + CodeMirror6
templates/   # plantillas base (article, report, beamer, cv)
setup_latex.sh   # instalador de un solo comando
```

## Desarrollo

```bash
npm install                # dependencias de todo el monorepo
npm run server:dev         # servidor con recarga automática (tsx watch)
npm run desktop:dev        # app de escritorio con hot-reload (vite + tauri dev)
```

Notas si vas a tocar el código:

- Tauri v2 exige declarar de antemano, en
  `packages/desktop/src-tauri/capabilities/default.json`, cada programa
  externo que la app puede ejecutar — no se puede correr un comando
  arbitrario escrito en un campo de texto. Por eso "Vista previa PDF" solo
  permite ejecutar `latexmk` (con el motor elegido por un desplegable), y
  "Abrir con mi programa" usa el mecanismo nativo "abrir con" del sistema
  en vez de ejecutar un comando.
- En macOS, las apps con interfaz gráfica no heredan el `PATH` de tu
  terminal — la app agrega `/Library/TeX/texbin` sola al arrancar (ver
  `packages/desktop/src-tauri/src/lib.rs`) para poder encontrar `latexmk`.
- Antes de un build de producción, reemplaza el ícono placeholder en
  `packages/desktop/src-tauri/icons/icon.png` (usa
  `npx tauri icon ruta/a/tu/logo.png`).
- Si haces un fork o mueves el proyecto a otra cuenta de GitHub, actualiza
  `APP_DOWNLOAD_URL` en `packages/server/src/config.ts` (o la variable de
  entorno `LATEX_COLLAB_DOWNLOAD_URL`) para que el link de "instalar la
  app" de tus propios proyectos compartidos apunte a tu copia.

## Estado del proyecto / limitaciones conocidas

- Sincronización en tiempo real probada con hasta 5 clientes concurrentes
  editando el mismo archivo — no hay límite de 2 personas.
- Tailscale Funnel probado en macOS (incluyendo el caso de Tailscale
  instalado como app, cuyo CLI no queda en el `PATH` por defecto). No
  probado en Linux ni Windows.
- El registro del esquema `latexcollab://` para links clicables está
  verificado en macOS; en Windows/Linux usa una ruta de código diferente
  (`register_all()` en tiempo de ejecución) que no se ha probado todavía.
- "Vista previa PDF" tenía un bug real: si se cerraba/abría el panel o se
  cambiaba de pestaña rápido, podían quedar **dos** procesos `latexmk -pvc`
  vigilando el mismo archivo a la vez, compitiendo por escribir el mismo
  PDF — eso podía hacer que los cambios dejaran de reflejarse. Corregido
  con un registro que garantiza un solo vigilante activo por archivo.
- El ícono de menú y el comando `latex_collab` en Linux dependen de
  `tauri.conf.json` (`mainBinaryName`, `category`) — la configuración está
  puesta, pero no se ha probado empaquetando de verdad en una máquina
  Linux (solo se verificó en macOS).
- La instalación automática de la distribución LaTeX en `setup_latex.sh`
  está verificada en la ruta de "ya está instalado" (detección correcta);
  la instalación desde cero de BasicTeX/TeX Live no se ha probado en vivo
  todavía en ninguna plataforma.
- No hay renombrar/crear/borrar archivos desde la interfaz (por ahora, solo
  vía importar `.zip` o editando la carpeta del proyecto directamente).
- Sin control de versiones tipo Git integrado — puedes usar `git`
  externamente sobre la misma carpeta del proyecto si quieres historial.
- Advertencia moderada de auditoría de `npm` en `vite`/`esbuild`: solo
  afecta al servidor de desarrollo (`vite dev`), no a la app empaquetada.

## Licencia

MIT — ver [LICENSE](./LICENSE).
