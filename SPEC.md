# LaTeX Collab — Especificación del proyecto

Editor de LaTeX colaborativo, autoalojado (self-hosted), para Mac y Linux.
Objetivo: varias personas editan a la vez los mismos archivos `.tex` de un
proyecto (como Google Docs), pero **sin depender de la nube de nadie** y
**sin imponer un compilador**: cada quien compila con el programa que
prefiera (Texifier, TeXmaker, TeXShop, `latexmk`, VS Code + LaTeX Workshop,
etc.). La app solo resuelve edición en tiempo real, sincronización de
archivos y saber quién está editando qué.

No es un clon de Overleaf (no compila en la nube, no tiene cuentas
centralizadas). Es más parecido a "Google Docs para carpetas de LaTeX que
tú mismo alojas".

## 1. Principios de diseño

1. **Compilador-agnóstico**: la app nunca compila por defecto. Solo detecta
   archivos LaTeX (`.tex`, `.bib`, `.cls`, `.sty`, `.bst`) y los mantiene
   sincronizados en disco como archivos reales, para que cualquier programa
   externo pueda abrirlos y compilarlos normalmente.
2. **Autoalojado, no SaaS**: cada quien instala el "servidor" en la máquina
   que quiera (la suya, un NAS, un VPS). No hay una nube central de la app.
3. **Compartir simple**: un proyecto se identifica con
   `nombre-del-proyecto + ID único + contraseña`. Compartir un link es solo
   un atajo que empaqueta esos tres datos en una URL (`latexcollab://...`);
   siempre existe la opción manual de decir el ID y la clave por chat/voz.
4. **Colaboración real, no locking**: varias personas escriben el mismo
   archivo a la vez, con cursores de colores y sin bloquear a nadie
   (CRDT, no "check-out / check-in" como Git).
5. **Entorno visual simple**: crear proyecto = elegir plantilla o importar;
   nada de configurar `.tex` a mano para empezar.

## 2. Arquitectura

```
┌─────────────────────────┐        WebSocket (Yjs)        ┌──────────────────────────┐
│   App de escritorio A    │ ───────────────────────────► │                          │
│  (Tauri + React + TS)    │ ◄─────────────────────────── │   Servidor de colab.     │
│  CodeMirror6 + y-codemirror│      REST (proyectos/auth)  │  (Node.js + TS)          │
└─────────────────────────┘ ───────────────────────────► │                          │
                                                            │  - Yjs docs en memoria   │
┌─────────────────────────┐                                │  - Persistencia a disco  │
│   App de escritorio B    │ ───────────────────────────► │    (archivos .tex reales)│
│   (misma app, otro user) │ ◄─────────────────────────── │  - SQLite (metadatos,    │
└─────────────────────────┘                                │    hash de contraseña)   │
                                                            └──────────────────────────┘
```

- Cada archivo `.tex`/`.bib` abierto = un `Y.Doc` (Yjs) con un `Y.Text`.
- El servidor persiste cada `Y.Doc` a disco (debounced, ~1s sin cambios)
  como archivo de texto plano normal — así cualquier compilador externo lo
  lee directamente, sin pasos intermedios.
- La lista de "quién está conectado y dónde tiene el cursor" viaja por el
  protocolo de *awareness* de Yjs (no se persiste, es efímero).
- REST solo se usa para: crear proyecto, unirse a proyecto (validar
  ID+password), listar/crear/renombrar/borrar archivos, importar
  `.zip`/carpeta.

### Stack técnico

| Componente        | Tecnología                                                        |
|-------------------|--------------------------------------------------------------------|
| App de escritorio | Tauri 2 (shell nativo en Rust) + React + TypeScript + Vite         |
| Editor            | CodeMirror 6 + `y-codemirror.next` (binding CRDT) + modo LaTeX     |
| Colaboración      | Yjs (CRDT) + `y-websocket` (protocolo) sobre WebSocket             |
| Servidor          | Node.js + TypeScript + Express (REST) + `ws` (WebSocket)           |
| Metadatos/auth    | SQLite (`better-sqlite3`) — proyectos, hash de password (bcrypt)   |
| Persistencia      | Sistema de archivos: cada proyecto = una carpeta real en disco     |
| Empaquetado       | Tauri bundler → `.app` (macOS) y `.AppImage` / `.deb` (Linux)      |
| Compartir fuera de LAN | Recomendado: Tailscale/VPN (evita configurar port-forwarding) |

## 3. Flujo de "compartir proyecto"

1. Usuario A crea el proyecto en su máquina. La app puede lanzar el
   servidor local automáticamente (proceso hijo empaquetado) o A puede
   correr `latex-collab-server` en otra máquina (NAS, servidor propio).
2. Al crear el proyecto se generan:
   - **Nombre del proyecto** (elegido por el usuario, ej. "tesis-cap3").
   - **ID único** (ej. `swift-falcon-482`, generado con `nanoid`).
   - **Contraseña** (autogenerada o elegida por A).
3. La app muestra un diálogo "Compartir":
   - Un link `latexcollab://192.168.1.20:5959/swift-falcon-482?key=...`
     que autocompleta el diálogo de "unirse" en la app de B.
   - Los mismos datos por separado (ID + password) para compartir a mano.
4. Usuario B abre "Unirse a proyecto", pega el link (o escribe
   host + ID + password), y entra a la sesión colaborativa.
5. El servidor valida el hash de la contraseña, agrega a B a la sala del
   proyecto y difunde su presencia a todos los conectados.

Nota de red: si A y B no están en la misma LAN, necesitan que el host de A
sea alcanzable (IP pública + puerto abierto, o una VPN tipo Tailscale). La
app no resuelve NAT traversal por sí sola en la v1.

## 4. Funcionalidades del entorno visual

### 4.1 Pantalla de inicio
- "Nuevo proyecto" → galería de plantillas:
  - Artículo (`article`), Reporte (`report`), Libro (`book`),
    Presentación (`beamer`), CV/currículum, Tesis, Carta.
- "Importar proyecto" → arrastrar `.zip` (ej. export de Overleaf) o una
  carpeta; la app detecta el archivo `.tex` principal automáticamente.
- "Unirse a proyecto" → pegar link o ingresar host/ID/password.
- Lista de proyectos recientes (locales y remotos).

### 4.2 Editor
- Árbol de archivos a la izquierda, mostrando solo archivos relevantes de
  LaTeX (`.tex`, `.bib`, `.cls`, `.sty`, imágenes referenciadas); el resto
  de archivos del proyecto se pueden ver en una pestaña "todos los
  archivos" pero no estorban por defecto.
- Editor central (CodeMirror 6) con resaltado de sintaxis LaTeX,
  autocompletado básico de comandos/entornos, y cursores de colores en
  tiempo real de cada colaborador conectado (con su nombre flotante).
- Barra superior: nombre del proyecto, ID (copiable), botón "Compartir",
  y **selector de "Compilar con..."**: el usuario configura un comando
  local (ej. `latexmk -pdf %f`, o la ruta a Texifier) y la app solo lo
  ejecuta contra el archivo/proyecto activo, mostrando el log de salida.
  No interpreta ni reemplaza el compilador — es un atajo de conveniencia.
- Panel lateral "En línea ahora": lista de personas conectadas al
  proyecto, con color asignado y en qué archivo está cada una.
- **Vista previa de PDF en tiempo real (opcional, toggle "Vista previa PDF")**:
  cada vez que el documento sincronizado cambia, la app recompila el archivo
  .tex activo usando la distribución LaTeX que el usuario ya tenga instalada
  localmente (`latexmk`/`pdflatex`, configurable), y muestra el PDF resultante
  en un panel al lado del editor (estilo Overleaf). Esto es 100% local por
  usuario: cada quien compila con su propia instalación, nadie depende del
  compilador de nadie más — sigue el mismo principio de "compilador-agnóstico"
  de la sección 1, solo que ahora también se puede *ver* el resultado sin
  salir de la app. Incluye un log de compilación visible para depurar errores.

### 4.3 Importación
- `.zip` de Overleaf u otro editor: se descomprime y se indexa.
- Carpeta local existente: se copia/vincula dentro del área de datos del
  servidor.
- (Futuro, no v1) Conversión de Word/Markdown a LaTeX vía Pandoc.

## 5. Modelo de datos (servidor)

```
projects (
  id TEXT PRIMARY KEY,         -- "swift-falcon-482"
  name TEXT,
  password_hash TEXT,
  created_at INTEGER,
  root_path TEXT                -- carpeta real en disco
)

project_files (               -- índice, la fuente de verdad es el disco
  project_id TEXT,
  relative_path TEXT,
  kind TEXT                     -- tex | bib | cls | sty | image | other
)
```

## 6. Alcance de la v1 (lo que SÍ se construye ahora)

- [x] Servidor Node/TS: crear/listar proyectos, auth por ID+password,
      salas Yjs por archivo, persistencia a disco, import de `.zip`.
- [x] App Tauri: pantalla de inicio, galería de plantillas, crear/unirse
      a proyecto, editor colaborativo con presencia, árbol de archivos,
      ejecutar "Compilar con..." como comando externo configurable.
- [x] Plantillas base: article, report, beamer, CV.
- [x] Vista previa de PDF opcional, compilando con la distribución LaTeX
      local del usuario (ver 4.2) — probado en esta sesión con MacTeX real.

## 7. Fuera de alcance en v1 (explícitamente no se hace)

- Cuentas de usuario centralizadas o servidor SaaS multi-tenant.
- Control de versiones tipo Git (historial completo, branches). Se puede
  integrar `git` externamente sobre la misma carpeta si el usuario quiere.
- NAT traversal automático / relay propio (se delega a VPN/Tailscale).

## 8. Cómo correrlo (dev)

```bash
# Servidor de colaboración
cd packages/server
npm install
npm run dev          # levanta REST + WebSocket en :5959

# App de escritorio
cd packages/desktop
npm install
npm run tauri:dev    # abre la app apuntando a localhost:5959
```
