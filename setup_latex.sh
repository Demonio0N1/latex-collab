#!/usr/bin/env bash
#
# setup_latex.sh — instalador de un solo paso para LaTeX Collab (macOS/Linux).
#
# Instala todo lo necesario para correr el proyecto: Node.js, Rust (para
# compilar la app de escritorio Tauri), las librerías del sistema que Tauri
# necesita, las dependencias del monorepo (npm install), y opcionalmente
# Tailscale (para compartir proyectos fuera de tu red local).
#
# Uso:
#   chmod +x setup_latex.sh
#   ./setup_latex.sh
#
# Se puede correr varias veces sin problema: cada paso se salta solo si ya
# está instalado.

set -euo pipefail

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${BLUE}==>${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
fail()  { echo -e "${RED}✗ $1${NC}"; exit 1; }
ask_yes() {
  # ask_yes "pregunta" -> 0 (sí) / 1 (no). Default: sí.
  if [ "${AUTO_YES:-0}" = "1" ]; then return 0; fi
  read -rp "$1 [S/n] " reply
  reply=${reply:-S}
  [[ "$reply" =~ ^[sSyY] ]]
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

[ -f "$SCRIPT_DIR/package.json" ] || fail "Corre este script desde la carpeta del proyecto (donde está package.json)."

if [ "${1:-}" = "--yes" ]; then AUTO_YES=1; fi

case "$(uname -s)" in
  Darwin) PLATFORM=macos ;;
  Linux)  PLATFORM=linux ;;
  *) fail "Este instalador solo soporta macOS y Linux. Sistema detectado: $(uname -s)" ;;
esac

echo -e "${BOLD}LaTeX Collab — instalador${NC} (plataforma: $PLATFORM)"
echo

# ---------------------------------------------------------------------------
# 1. Dependencias del sistema que Tauri necesita para compilar/correr la app
# ---------------------------------------------------------------------------

install_macos_system_deps() {
  if ! xcode-select -p >/dev/null 2>&1; then
    info "Instalando Xcode Command Line Tools (se abrirá una ventana del sistema)..."
    xcode-select --install || true
    warn "Termina la instalación en la ventana que se abrió y vuelve a correr ./setup_latex.sh"
    exit 0
  fi
  ok "Xcode Command Line Tools ya está instalado."

  if ! command -v brew >/dev/null 2>&1; then
    if ask_yes "Homebrew no está instalado (se usa para instalar Node.js). ¿Instalarlo ahora?"; then
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
      if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
    else
      warn "Sin Homebrew. Instala Node.js manualmente si el paso automático falla: https://nodejs.org"
    fi
  else
    ok "Homebrew ya está instalado."
  fi
}

install_linux_system_deps() {
  if command -v apt-get >/dev/null 2>&1; then
    info "Instalando dependencias del sistema (apt, requiere sudo)..."
    sudo apt-get update
    sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
      libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config
  elif command -v dnf >/dev/null 2>&1; then
    info "Instalando dependencias del sistema (dnf, requiere sudo)..."
    sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl wget file \
      libappindicator-gtk3-devel librsvg2-devel
    sudo dnf group install -y "c-development" || true
  elif command -v pacman >/dev/null 2>&1; then
    info "Instalando dependencias del sistema (pacman, requiere sudo)..."
    sudo pacman -Syu --needed --noconfirm webkit2gtk-4.1 base-devel curl wget file \
      openssl appmenu-gtk-module libappindicator-gtk3 librsvg
  else
    fail "No se encontró apt/dnf/pacman. Instala manualmente las dependencias de Tauri: https://v2.tauri.app/start/prerequisites/"
  fi
  ok "Dependencias del sistema instaladas."
}

if [ "$PLATFORM" = "macos" ]; then install_macos_system_deps; else install_linux_system_deps; fi
echo

# ---------------------------------------------------------------------------
# 2. Node.js (vía nvm — mismo método en macOS y Linux)
# ---------------------------------------------------------------------------

install_node() {
  if command -v node >/dev/null 2>&1 && [ "$(node -v | sed 's/v//' | cut -d. -f1)" -ge 18 ]; then
    ok "Node.js ya está instalado: $(node -v)"
    return
  fi

  info "Instalando Node.js (LTS) vía nvm..."
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
  ok "Node.js instalado: $(node -v)"
}

install_node
echo

# ---------------------------------------------------------------------------
# 3. Rust (vía rustup — necesario para compilar la app de escritorio Tauri)
# ---------------------------------------------------------------------------

install_rust() {
  if command -v cargo >/dev/null 2>&1; then
    ok "Rust ya está instalado: $(rustc --version)"
    return
  fi
  info "Instalando Rust vía rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
  ok "Rust instalado: $(rustc --version)"
}

install_rust
echo

# ---------------------------------------------------------------------------
# 4. Tailscale + Funnel (opcional) — para que "Compartir" genere un link
#    público (https://tu-maquina.tailnet.ts.net) que funciona para
#    CUALQUIERA en internet, sin que instalen Tailscale ni nada más.
# ---------------------------------------------------------------------------

LATEX_COLLAB_PORT="${LATEX_COLLAB_PORT:-5959}"

# La versión de macOS (App Store / .pkg) trae su propio CLI dentro del
# bundle de la app y NO lo agrega al PATH salvo que uses "Install Tailscale
# CLI" desde su menú — así que buscamos ahí también, no solo en el PATH.
MACOS_APP_CLI="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
TAILSCALE_BIN=""

resolve_tailscale_bin() {
  if command -v tailscale >/dev/null 2>&1; then
    TAILSCALE_BIN="tailscale"
  elif [ -x "$MACOS_APP_CLI" ]; then
    TAILSCALE_BIN="$MACOS_APP_CLI"
  else
    TAILSCALE_BIN=""
  fi
}

install_tailscale_binary() {
  resolve_tailscale_bin
  if [ -n "$TAILSCALE_BIN" ]; then
    ok "Tailscale ya está instalado ($TAILSCALE_BIN)."
    return 0
  fi
  if [ "$PLATFORM" = "macos" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install --cask tailscale
      open -a Tailscale 2>/dev/null || true
      sleep 3
      resolve_tailscale_bin
      if [ -z "$TAILSCALE_BIN" ]; then
        warn "Tailscale se instaló pero no encuentro su comando todavía."
        warn "Abre Tailscale.app manualmente una vez y vuelve a correr este script."
        return 1
      fi
    else
      warn "Instala Tailscale manualmente: https://tailscale.com/download/mac"
      return 1
    fi
  else
    curl -fsSL https://tailscale.com/install.sh | sh
    resolve_tailscale_bin
  fi
  ok "Tailscale instalado ($TAILSCALE_BIN)."
  return 0
}

# En Linux tailscaled corre como root y el CLI necesita sudo; en macOS la
# app gestiona sus propios permisos y NO se debe anteponer sudo.
ts() {
  if [ "$PLATFORM" = "linux" ]; then sudo "$TAILSCALE_BIN" "$@"; else "$TAILSCALE_BIN" "$@"; fi
}

setup_tailscale_and_funnel() {
  if ! ask_yes "¿Instalar y configurar Tailscale? (deja que los links de 'Compartir' funcionen fuera de tu red, incluso para gente que no tiene Tailscale, vía Funnel)"; then
    warn "Omitido. Puedes instalarlo después desde https://tailscale.com/download"
    return
  fi

  install_tailscale_binary || return

  if ! ts status >/dev/null 2>&1; then
    info "Iniciando sesión en Tailscale — se abrirá tu navegador, inicia sesión con TU cuenta..."
    ts up
  fi
  if ! ts status >/dev/null 2>&1; then
    warn "No se pudo confirmar el login de Tailscale. Corre '$TAILSCALE_BIN up' manualmente y luego"
    warn "'$TAILSCALE_BIN funnel --bg $LATEX_COLLAB_PORT' para activar el link público."
    return
  fi
  ok "Tailscale conectado."

  if ! ask_yes "¿Activar Tailscale Funnel en el puerto $LATEX_COLLAB_PORT ahora? (necesario para el link público)"; then
    return
  fi

  info "Activando Funnel (esto puede pedir confirmar HTTPS/Funnel en el panel de Tailscale la primera vez)..."
  if ts funnel --bg "$LATEX_COLLAB_PORT" >/tmp/tailscale-funnel.log 2>&1; then
    ok "Funnel activo. La app va a detectar y ofrecer el link público automáticamente."
    grep "https://" /tmp/tailscale-funnel.log | head -1
  else
    warn "No se pudo activar Funnel automáticamente. Salida del comando:"
    cat /tmp/tailscale-funnel.log
    warn "Suele necesitar habilitar 'HTTPS Certificates' una vez en:"
    warn "  https://login.tailscale.com/admin/dns"
    warn "y que Funnel esté permitido en tus reglas de acceso (ACLs):"
    warn "  https://login.tailscale.com/admin/acls"
    warn "Después de eso, corre: $TAILSCALE_BIN funnel --bg $LATEX_COLLAB_PORT"
  fi
}

setup_tailscale_and_funnel
echo

# ---------------------------------------------------------------------------
# 5. Distribución LaTeX (latexmk/pdflatex) — la necesita "Vista previa PDF"
#    para compilar. No es lo mismo que instalar Texifier/TeXmaker: esos
#    editores TAMBIÉN dependen de tener esto instalado por separado.
# ---------------------------------------------------------------------------

MACOS_TEXBIN="/Library/TeX/texbin"

latexmk_found() {
  command -v latexmk >/dev/null 2>&1 || [ -x "$MACOS_TEXBIN/latexmk" ]
}

install_latex_distribution() {
  if latexmk_found; then
    ok "Ya tienes una distribución LaTeX instalada (latexmk encontrado)."
    return
  fi

  if ! ask_yes "No encontré 'latexmk' — lo necesita 'Vista previa PDF' para compilar (también lo necesitan Texifier/TeXmaker por separado). ¿Instalar una distribución LaTeX ahora? (~200MB-1GB, varios minutos)"; then
    warn "Omitido. 'Vista previa PDF' no va a funcionar hasta que instales TeX Live/MacTeX/MiKTeX tú mismo."
    return
  fi

  if [ "$PLATFORM" = "macos" ]; then
    if ! command -v brew >/dev/null 2>&1; then
      warn "Necesitas Homebrew para este paso automático. Instala MacTeX manualmente: https://www.tug.org/mactex/"
      return
    fi
    info "Instalando BasicTeX (distribución LaTeX ligera, vía Homebrew)..."
    brew install --cask basictex
    local tlmgr="$MACOS_TEXBIN/tlmgr"
    if [ ! -x "$tlmgr" ]; then
      warn "BasicTeX se instaló pero no encuentro tlmgr en $MACOS_TEXBIN todavía."
      warn "Abre una terminal nueva y corre:"
      warn "  sudo $tlmgr update --self && sudo $tlmgr install latexmk collection-fontsrecommended collection-latexextra collection-langspanish"
      return
    fi
    info "Instalando latexmk y los paquetes que usan las plantillas (puede tardar varios minutos)..."
    sudo "$tlmgr" update --self
    sudo "$tlmgr" install latexmk collection-fontsrecommended collection-latexextra collection-langspanish
  elif command -v apt-get >/dev/null 2>&1; then
    info "Instalando TeX Live (paquetes esenciales + latexmk, vía apt)..."
    sudo apt-get update
    sudo apt-get install -y texlive-latex-base texlive-latex-recommended texlive-latex-extra \
      texlive-fonts-recommended texlive-lang-spanish texlive-pictures latexmk
  elif command -v dnf >/dev/null 2>&1; then
    info "Instalando TeX Live (paquetes esenciales + latexmk, vía dnf)..."
    sudo dnf install -y texlive-scheme-basic texlive-collection-latexextra \
      texlive-collection-fontsrecommended texlive-collection-langspanish latexmk
  elif command -v pacman >/dev/null 2>&1; then
    info "Instalando TeX Live (texlive-most, incluye latexmk, vía pacman)..."
    sudo pacman -Sy --needed --noconfirm texlive-most
  else
    warn "No se pudo detectar un gestor de paquetes soportado. Instala TeX Live/MacTeX/MiKTeX manualmente."
    return
  fi

  if latexmk_found; then
    ok "latexmk instalado correctamente."
  else
    warn "No pude confirmar que 'latexmk' haya quedado instalado. Puede que necesites abrir una terminal nueva"
    warn "(algunos instaladores solo actualizan el PATH de sesiones nuevas)."
  fi
}

install_latex_distribution
echo

# ---------------------------------------------------------------------------
# 6. Comando de terminal "latex_collab" (macOS)
#    En Linux esto no hace falta: el paquete .deb/AppImage ya instala el
#    binario como "latex_collab" en el PATH y registra el ícono del menú
#    de aplicaciones automáticamente (ver tauri.conf.json). En macOS las
#    apps (.app) no quedan en el PATH por diseño del sistema, así que
#    creamos un lanzador aparte.
# ---------------------------------------------------------------------------

install_macos_cli_shortcut() {
  [ "$PLATFORM" = "macos" ] || return

  local bin_dir
  if command -v brew >/dev/null 2>&1; then
    bin_dir="$(brew --prefix)/bin"
  else
    bin_dir="/usr/local/bin"
  fi
  local shortcut="$bin_dir/latex_collab"

  if [ -f "$shortcut" ]; then
    ok "El comando 'latex_collab' ya existe en $bin_dir."
    return
  fi

  if ! ask_yes "¿Crear el comando 'latex_collab' para abrir la app desde cualquier terminal?"; then
    return
  fi

  local tmp_shortcut
  tmp_shortcut="$(mktemp)"
  cat > "$tmp_shortcut" <<'EOF'
#!/usr/bin/env bash
exec open -a "LaTeX Collab" "$@"
EOF
  chmod +x "$tmp_shortcut"

  mkdir -p "$bin_dir" 2>/dev/null || true
  if [ -w "$bin_dir" ]; then
    mv "$tmp_shortcut" "$shortcut"
  else
    sudo mv "$tmp_shortcut" "$shortcut"
  fi
  ok "Listo — escribe 'latex_collab' en cualquier terminal para abrir la app (una vez que esté compilada/instalada)."
}

install_macos_cli_shortcut
echo

# ---------------------------------------------------------------------------
# 7. Dependencias del proyecto
# ---------------------------------------------------------------------------

info "Instalando dependencias del proyecto (npm install)..."
npm install
ok "Dependencias del proyecto instaladas."
echo

# ---------------------------------------------------------------------------
# 8. Listo — resumen y arranque opcional
# ---------------------------------------------------------------------------

echo -e "${BOLD}Todo instalado.${NC}"
echo
echo "Antes de compartir proyectos fuera de tu máquina, revisa:"
echo "  packages/server/src/config.ts -> APP_DOWNLOAD_URL (hoy es un placeholder)"
echo
echo "Para correr el proyecto manualmente:"
echo "  npm run server:dev     # servidor de colaboración (terminal 1)"
echo "  npm run desktop:dev    # app de escritorio            (terminal 2)"
echo
if [ "$PLATFORM" = "macos" ]; then
  echo "Una vez compilada, también puedes abrirla escribiendo: latex_collab"
else
  echo "Tras 'npm run tauri:build' e instalar el .deb/AppImage resultante, la app"
  echo "aparece en el menú de aplicaciones y el comando 'latex_collab' queda"
  echo "disponible en cualquier terminal."
fi
echo

if ask_yes "¿Quieres que arranque el servidor y la app ahora mismo?"; then
  info "Iniciando el servidor de colaboración en segundo plano..."
  (npm run server:dev > /tmp/latex-collab-server.log 2>&1 &)
  sleep 2
  ok "Servidor arriba en http://localhost:5959 (log: /tmp/latex-collab-server.log)"
  info "Abriendo la app de escritorio (la primera vez puede tardar varios minutos compilando)..."
  npm run desktop:dev
else
  echo "Cuando quieras, corre los dos comandos de arriba en dos terminales."
fi
