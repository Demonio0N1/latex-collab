import { useCallback, useEffect, useRef, useState } from "react";
import { onOpenUrl, getCurrent as getCurrentDeepLinkUrls } from "@tauri-apps/plugin-deep-link";
import type { JoinProjectResponse, ProjectFile } from "@latex-collab/shared";
import Sidebar from "./components/Sidebar";
import NewProjectModal from "./components/NewProjectModal";
import JoinProjectModal from "./components/JoinProjectModal";
import ProjectHeader from "./components/ProjectHeader";
import TabBar from "./components/TabBar";
import FileTree from "./components/FileTree";
import PresenceSidebar from "./components/PresenceSidebar";
import StatusBar from "./components/StatusBar";
import ShareDialog from "./components/ShareDialog";
import Editor from "./components/Editor";
import PdfPreview from "./components/PdfPreview";
import WelcomeScreen from "./components/WelcomeScreen";
import { joinProject, parseShareLink, listProjectFiles, downloadProjectFile, uploadProjectFile } from "./api";
import { AssetsSync } from "./assetsSync";
import { applyStoredTexDir } from "./latexCompiler";
import { SUPPORTS_LOCAL_TOOLS } from "./platform";
import { listRecentProjects, removeRecentProject, upsertRecentProject, type RecentProject } from "./recentProjects";
import { resolveProjectMirrorDir, mirrorFileExists, writeMirrorBinary } from "./localMirror";
import { join as joinPath } from "@tauri-apps/api/path";

const FILE_POLL_MS = 4000;

type Session = JoinProjectResponse & { baseUrl: string; password: string };

const USER_NAME_KEY = "latex-collab:userName";
const SERVER_URL_KEY = "latex-collab:serverUrl";
// Default server the app points at on first run. This deployment hosts the
// collaboration server on a Raspberry Pi exposed via Tailscale Funnel; the
// user can still change it in the New/Join dialogs (remembered afterwards).
const DEFAULT_BASE_URL = "https://pi5-oaq.tail61fec5.ts.net";

const isLoopbackUrl = (url: string) => /localhost|127\.0\.0\.1/.test(url);

function loadServerUrl(): string {
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY);
    // Ignore any stale loopback value so this deployment picks up the Pi
    // default; a real remote server the user chose is kept.
    if (saved && !isLoopbackUrl(saved)) return saved;
  } catch {
    /* localStorage may be unavailable; fall through to default */
  }
  return DEFAULT_BASE_URL;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [peers, setPeers] = useState<{ name: string; color: string }[]>([]);
  const [localFilePath, setLocalFilePath] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [pendingLink, setPendingLink] = useState<{ link: string; error?: string } | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => listRecentProjects());
  const [mobileDrawer, setMobileDrawer] = useState<"none" | "nav" | "panel">("none");
  // Last server the user pointed at (e.g. the Raspberry Pi), remembered so
  // both "new" and "join" default to it instead of always localhost.
  const [serverUrl, setServerUrl] = useState<string>(() => loadServerUrl());

  // Barra lateral ocultable en escritorio (en móvil ya es un drawer).
  const [navHidden, setNavHidden] = useState(() => {
    try {
      return localStorage.getItem("latex-collab:navHidden") === "1";
    } catch {
      return false;
    }
  });
  const toggleNav = useCallback(() => {
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileDrawer((d) => (d === "nav" ? "none" : "nav"));
      return;
    }
    setNavHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem("latex-collab:navHidden", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Panel derecho (archivos + colaboradores) ocultable en escritorio.
  const [panelHidden, setPanelHidden] = useState(() => {
    try {
      return localStorage.getItem("latex-collab:panelHidden") === "1";
    } catch {
      return false;
    }
  });
  const togglePanel = useCallback(() => {
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileDrawer((d) => (d === "panel" ? "none" : "panel"));
      return;
    }
    setPanelHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem("latex-collab:panelHidden", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Imágenes sincronizadas usuario-a-usuario (canal CRDT, no tocan el disco del servidor).
  const assetsRef = useRef<AssetsSync | null>(null);
  const [assetNames, setAssetNames] = useState<string[]>([]);

  // Carpeta local visible donde vive la copia del proyecto (Documentos/LaTeX Projects).
  const [localProjectDir, setLocalProjectDir] = useState<string | null>(null);

  // Avisos no bloqueantes (reemplazan a alert(), que en móvil estorba o ni aparece).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const rememberServer = useCallback((url: string) => {
    const clean = url.trim().replace(/\/+$/, "");
    if (!clean) return;
    setServerUrl(clean);
    try {
      localStorage.setItem(SERVER_URL_KEY, clean);
    } catch {
      /* localStorage may be unavailable; ignore */
    }
  }, []);

  const [userName] = useState(() => {
    const existing = localStorage.getItem(USER_NAME_KEY);
    if (existing) return existing;
    const generated = `Usuario-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(USER_NAME_KEY, generated);
    return generated;
  });

  // Si el usuario eligió dónde vive su compilador LaTeX, aplicarlo al PATH.
  useEffect(() => {
    if (SUPPORTS_LOCAL_TOOLS) void applyStoredTexDir();
  }, []);

  const handlePresenceChange = useCallback((p: { name: string; color: string }[]) => setPeers(p), []);
  const handleLocalPathReady = useCallback((p: string | null) => setLocalFilePath(p), []);

  function openSession(newSession: Session) {
    setSession(newSession);
    setFiles(newSession.files);
    const firstTex = newSession.files.find((f) => f.kind === "tex");
    const first = firstTex?.path ?? newSession.files[0]?.path ?? null;
    setOpenFiles(first ? [first] : []);
    setActiveFile(first);
    setShowNewModal(false);
    setShowJoinModal(false);

    rememberServer(newSession.baseUrl);
    upsertRecentProject({
      id: newSession.project.id,
      name: newSession.project.name,
      baseUrl: newSession.baseUrl,
      password: newSession.password,
    });
    setRecentProjects(listRecentProjects());
  }

  const handleIncomingLink = useCallback(async (link: string) => {
    const parsed = parseShareLink(link);
    if (!parsed) return;
    try {
      const joined = await joinProject(parsed.baseUrl, parsed.projectId, { password: parsed.password });
      openSession({ ...joined, baseUrl: parsed.baseUrl, password: parsed.password });
    } catch (err) {
      setPendingLink({ link, error: String(err instanceof Error ? err.message : err) });
      setShowJoinModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Cold start: the OS launched the app directly from a clicked link.
    getCurrentDeepLinkUrls()
      .then((urls) => {
        if (urls && urls.length > 0) handleIncomingLink(urls[0]);
      })
      .catch(() => {});

    // App already running: the OS forwards the link to this instance.
    const unlisten = onOpenUrl((urls) => {
      if (urls.length > 0) handleIncomingLink(urls[0]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleIncomingLink]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;

    const syncFiles = async () => {
      let latest: ProjectFile[];
      try {
        latest = (await listProjectFiles(session.baseUrl, session.project.id, session.token)).files;
      } catch {
        return; // transient network hiccup — try again next tick
      }
      if (stopped) return;
      setFiles(latest);

      // Someone else's inserted image won't compile locally until we have
      // its bytes too — fetch anything image-kind we don't have yet.
      const projectDir = await resolveProjectMirrorDir(session.project.id, session.project.name);
      for (const file of latest) {
        if (file.kind !== "image") continue;
        const localPath = await joinPath(projectDir, file.path);
        if (await mirrorFileExists(localPath)) continue;
        try {
          const bytes = await downloadProjectFile(session.baseUrl, session.project.id, session.token, file.path);
          if (stopped) return;
          await writeMirrorBinary(localPath, bytes);
        } catch (err) {
          console.error(`no se pudo sincronizar la imagen ${file.path}`, err);
        }
      }
    };

    syncFiles();
    const interval = setInterval(syncFiles, FILE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [session]);

  // Canal de imágenes del proyecto abierto: vive mientras dure la sesión.
  useEffect(() => {
    if (!session) {
      setAssetNames([]);
      return;
    }
    const assets = new AssetsSync(session.baseUrl, session.project.id, session.project.name, session.token);
    assetsRef.current = assets;
    const off = assets.onChange(setAssetNames);
    setAssetNames(assets.names());
    return () => {
      off();
      assets.destroy();
      assetsRef.current = null;
    };
  }, [session]);

  // Resuelve (y muestra) la carpeta local del proyecto.
  useEffect(() => {
    if (!session || !SUPPORTS_LOCAL_TOOLS) {
      setLocalProjectDir(null);
      return;
    }
    resolveProjectMirrorDir(session.project.id, session.project.name)
      .then(setLocalProjectDir)
      .catch(() => setLocalProjectDir(null));
  }, [session]);

  async function handleOpenRecent(project: RecentProject) {
    try {
      const joined = await joinProject(project.baseUrl, project.id, { password: project.password });
      openSession({ ...joined, baseUrl: project.baseUrl, password: project.password });
    } catch (err) {
      showToast(`No se pudo abrir "${project.name}": ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  function handleRemoveRecent(id: string, baseUrl: string) {
    removeRecentProject(id, baseUrl);
    setRecentProjects(listRecentProjects());
  }

  function openFile(path: string) {
    setOpenFiles((files) => (files.includes(path) ? files : [...files, path]));
    setActiveFile(path);
  }

  // Create a new .tex file in the current project and open it. Auto-named to
  // avoid a blocking prompt dialog; uses the existing upload endpoint.
  async function handleNewFile() {
    if (!session) return;
    const existing = new Set(files.map((f) => f.path));
    let name = "documento.tex";
    for (let n = 2; existing.has(name); n++) name = `documento-${n}.tex`;
    const starter = `\\documentclass{article}\n\n\\begin{document}\n\n\\end{document}\n`;
    try {
      const res = await uploadProjectFile(
        session.baseUrl,
        session.project.id,
        session.token,
        name,
        new TextEncoder().encode(starter)
      );
      setFiles(res.files);
      openFile(name);
      setMobileDrawer("none");
    } catch (err) {
      showToast(`No se pudo crear el archivo: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  function closeFile(path: string) {
    setOpenFiles((files) => {
      const next = files.filter((f) => f !== path);
      if (activeFile === path) setActiveFile(next[0] ?? null);
      return next;
    });
  }

  const activeKey = session ? `${session.project.id}@${session.baseUrl}` : null;

  // Las imágenes sincronizadas usuario-a-usuario no existen en el servidor,
  // así que se suman al árbol de archivos del lado del cliente.
  const treeFiles: ProjectFile[] = [
    ...files,
    ...assetNames
      .filter((name) => !files.some((f) => f.path === name))
      .map((name) => ({ path: name, kind: "image" as const, sizeBytes: 0 })),
  ];

  return (
    <div
      className={`shell ${session ? "has-session" : "no-session"}${navHidden ? " nav-hidden" : ""}${panelHidden ? " panel-hidden" : ""}`}
      data-drawer={mobileDrawer}
    >
      {mobileDrawer !== "none" && <div className="drawer-backdrop" onClick={() => setMobileDrawer("none")} />}

      <div className={`drawer-nav ${mobileDrawer === "nav" ? "open" : ""}`}>
        <Sidebar
          recentProjects={recentProjects}
          activeKey={activeKey}
          onNewProject={() => {
            setMobileDrawer("none");
            setShowNewModal(true);
          }}
          onJoinProject={() => {
            setMobileDrawer("none");
            setShowJoinModal(true);
          }}
          onOpenRecent={(p) => {
            setMobileDrawer("none");
            handleOpenRecent(p);
          }}
          onRemoveRecent={handleRemoveRecent}
        />
      </div>

      <div className="main-column">
        {!session ? (
          <WelcomeScreen onNewProject={() => setShowNewModal(true)} onJoinProject={() => setShowJoinModal(true)} />
        ) : (
          <>
            <ProjectHeader
              projectName={session.project.name}
              projectId={session.project.id}
              localFilePath={localFilePath}
              localDirPath={localProjectDir}
              showPreview={showPreview}
              peers={peers}
              selfName={userName}
              onToggleNav={toggleNav}
              onTogglePeople={togglePanel}
              onTogglePreview={() => setShowPreview((s) => !s)}
              onShare={() => setShowShare(true)}
            />
            <TabBar openFiles={openFiles} activeFile={activeFile ?? ""} onSelect={setActiveFile} onClose={closeFile} />
            <div className="workspace">
              <div className="editor-pane">
                {openFiles.length === 0 && <div className="empty-state">Este proyecto no tiene archivos todavía.</div>}
                {openFiles.map((file) => (
                  <Editor
                    key={file}
                    baseUrl={session.baseUrl}
                    projectId={session.project.id}
                    projectName={session.project.name}
                    filePath={file}
                    token={session.token}
                    userName={userName}
                    active={file === activeFile}
                    onPresenceChange={handlePresenceChange}
                    onLocalPathReady={handleLocalPathReady}
                    onAddImage={(name, bytes) => assetsRef.current?.addImage(name, bytes)}
                  />
                ))}
              </div>
              {showPreview && <PdfPreview texFilePath={localFilePath} />}
              <div className={`right-panel drawer-panel ${mobileDrawer === "panel" ? "open" : ""}`}>
                <button className="new-file-btn" onClick={handleNewFile}>
                  + Nuevo archivo
                </button>
                <FileTree
                  files={treeFiles}
                  activeFile={activeFile}
                  onSelect={(p) => {
                    setMobileDrawer("none");
                    openFile(p);
                  }}
                />
                <PresenceSidebar peers={peers} selfName={userName} />
              </div>
            </div>
            <StatusBar baseUrl={session.baseUrl} connected peerCount={peers.length} activeFile={activeFile} />
          </>
        )}
      </div>

      {showNewModal && (
        <NewProjectModal
          baseUrl={serverUrl}
          onServerChange={rememberServer}
          onClose={() => setShowNewModal(false)}
          onReady={openSession}
        />
      )}
      {showJoinModal && (
        <JoinProjectModal
          defaultBaseUrl={serverUrl}
          onServerChange={rememberServer}
          initialLink={pendingLink?.link}
          initialError={pendingLink?.error}
          onClose={() => {
            setShowJoinModal(false);
            setPendingLink(null);
          }}
          onReady={(session) => {
            setPendingLink(null);
            openSession(session);
          }}
        />
      )}
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      {showShare && session && (
        <ShareDialog
          baseUrl={session.baseUrl}
          projectId={session.project.id}
          password={session.password}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
