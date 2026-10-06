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

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![register_tex_path])
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
