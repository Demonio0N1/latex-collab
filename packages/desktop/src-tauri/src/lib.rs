// GUI apps on macOS are launched by Launch Services with a minimal PATH
// (no ~/.zshrc, no /Library/TeX/texbin) — completely different from a
// Terminal shell's PATH. Without this, spawning "latexmk" fails with
// "command not found" even though it works fine from a terminal.
#[cfg(target_os = "macos")]
fn extend_path_for_gui_launch() {
    let extra = [
        "/Library/TeX/texbin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<&str> = extra.iter().copied().collect();
    parts.push(&current);
    std::env::set_var("PATH", parts.join(":"));
}

/// Búsqueda del compilador LaTeX (latexmk) en las rutas donde lo dejan los
/// instaladores habituales: MacTeX/BasicTeX (también vía Homebrew cask),
/// `brew install texlive`, TeX Live directo, MiKTeX y TinyTeX.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod texfind {
    use std::path::{Path, PathBuf};

    const EXE: &str = if cfg!(windows) { "latexmk.exe" } else { "latexmk" };

    fn has_latexmk(dir: &Path) -> bool {
        dir.join(EXE).is_file()
    }

    /// `<root>/<año>/bin/<arquitectura>` — el layout de TeX Live.
    fn texlive_bins(root: &str) -> Vec<PathBuf> {
        let mut v = Vec::new();
        if let Ok(years) = std::fs::read_dir(root) {
            for y in years.flatten() {
                let bin = y.path().join("bin");
                if let Ok(archs) = std::fs::read_dir(&bin) {
                    for a in archs.flatten() {
                        v.push(a.path());
                    }
                }
            }
        }
        v.sort();
        v.reverse(); // años más nuevos primero
        v
    }

    pub fn candidates() -> Vec<PathBuf> {
        #[allow(unused_mut)]
        let mut c: Vec<PathBuf> = Vec::new();
        #[cfg(target_os = "macos")]
        {
            c.push(PathBuf::from("/Library/TeX/texbin")); // MacTeX/BasicTeX (incl. brew cask)
            c.push(PathBuf::from("/opt/homebrew/bin")); // brew install texlive (Apple Silicon)
            c.push(PathBuf::from("/usr/local/bin")); // brew Intel
            c.extend(texlive_bins("/usr/local/texlive")); // TeX Live directo
            c.extend(texlive_bins("/opt/texlive"));
        }
        #[cfg(target_os = "linux")]
        {
            c.push(PathBuf::from("/usr/bin"));
            c.push(PathBuf::from("/usr/local/bin"));
            c.extend(texlive_bins("/usr/local/texlive"));
            c.extend(texlive_bins("/opt/texlive"));
            if let Ok(home) = std::env::var("HOME") {
                let tinytex = Path::new(&home).join(".TinyTeX/bin");
                if let Ok(archs) = std::fs::read_dir(&tinytex) {
                    for a in archs.flatten() {
                        c.push(a.path());
                    }
                }
            }
        }
        #[cfg(windows)]
        {
            c.extend(texlive_bins("C:/texlive"));
            if let Ok(lad) = std::env::var("LOCALAPPDATA") {
                c.push(Path::new(&lad).join("Programs/MiKTeX/miktex/bin/x64"));
            }
            c.push(PathBuf::from("C:/Program Files/MiKTeX/miktex/bin/x64"));
        }
        c.into_iter().filter(|d| has_latexmk(d)).collect()
    }

    /// ¿Ya hay un latexmk alcanzable por el PATH actual del proceso?
    pub fn on_path() -> Option<PathBuf> {
        let sep = if cfg!(windows) { ';' } else { ':' };
        std::env::var("PATH")
            .ok()?
            .split(sep)
            .map(PathBuf::from)
            .find(|d| has_latexmk(d))
    }
}

/// Al arrancar: si latexmk no está en el PATH, antepone la primera ruta
/// conocida que sí lo tenga — la vista previa "simplemente funciona".
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn ensure_latexmk_on_path() {
    if texfind::on_path().is_some() {
        return;
    }
    if let Some(first) = texfind::candidates().into_iter().next() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let current = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", format!("{}{}{}", first.display(), sep, current));
    }
}

/// Devuelve las carpetas donde se encontró latexmk (la del PATH primero),
/// para el botón "Detectar" de la configuración.
#[tauri::command]
fn find_latexmk() -> Vec<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Vec::new()
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let mut v: Vec<String> = Vec::new();
        if let Some(p) = texfind::on_path() {
            v.push(p.display().to_string());
        }
        for c in texfind::candidates() {
            let s = c.display().to_string();
            if !v.contains(&s) {
                v.push(s);
            }
        }
        v
    }
}

/// El usuario puede señalar desde la app la carpeta donde vive su compilador
/// LaTeX (latexmk) — p. ej. /usr/local/texlive/2026/bin/universal-darwin — y
/// aquí se antepone al PATH del proceso, para que los spawns de latexmk la
/// encuentren aunque no esté en las rutas típicas.
#[tauri::command]
fn register_tex_path(dir: String) {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let current = std::env::var("PATH").unwrap_or_default();
    if !current.split(sep).any(|p| p == dir) {
        std::env::set_var("PATH", format!("{dir}{sep}{current}"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    extend_path_for_gui_launch();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    ensure_latexmk_on_path();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![register_tex_path, find_latexmk])
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|_app| {
            // macOS/iOS pick up the `latexcollab` scheme from the bundle's
            // Info.plist (generated from tauri.conf.json) automatically.
            // Windows and Linux need this runtime registration instead —
            // it writes the registry key / .desktop entry for the scheme.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the LaTeX Collab application");
}
