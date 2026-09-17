import { useCallback, useEffect, useState } from "react";
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
import { joinProject, parseShareLink, listProjectFiles, downloadProjectFile } from "./api";
import { listRecentProjects, removeRecentProject, upsertRecentProject, type RecentProject } from "./recentProjects";
import { resolveProjectMirrorDir, mirrorFileExists, writeMirrorBinary } from "./localMirror";
import { join as joinPath } from "@tauri-apps/api/path";

const FILE_POLL_MS = 4000;

type Session = JoinProjectResponse & { baseUrl: string; password: string };

const USER_NAME_KEY = "latex-collab:userName";
const DEFAULT_BASE_URL = "http://localhost:5959";

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

  const [userName] = useState(() => {
    const existing = localStorage.getItem(USER_NAME_KEY);
    if (existing) return existing;
    const generated = `Usuario-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(USER_NAME_KEY, generated);
    return generated;
  });

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

  async function handleOpenRecent(project: RecentProject) {
    try {
      const joined = await joinProject(project.baseUrl, project.id, { password: project.password });
      openSession({ ...joined, baseUrl: project.baseUrl, password: project.password });
    } catch (err) {
      alert(`No se pudo abrir "${project.name}": ${String(err instanceof Error ? err.message : err)}`);
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

  function closeFile(path: string) {
    setOpenFiles((files) => {
      const next = files.filter((f) => f !== path);
      if (activeFile === path) setActiveFile(next[0] ?? null);
      return next;
    });
  }

  const activeKey = session ? `${session.project.id}@${session.baseUrl}` : null;

  return (
    <div className={`shell ${session ? "has-session" : "no-session"}`} data-drawer={mobileDrawer}>
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
              showPreview={showPreview}
              peers={peers}
              selfName={userName}
              onToggleNav={() => setMobileDrawer((d) => (d === "nav" ? "none" : "nav"))}
              onTogglePeople={() => setMobileDrawer((d) => (d === "panel" ? "none" : "panel"))}
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
                  />
                ))}
              </div>
              {showPreview && <PdfPreview texFilePath={localFilePath} />}
              <div className={`right-panel drawer-panel ${mobileDrawer === "panel" ? "open" : ""}`}>
                <FileTree
                  files={files}
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
        <NewProjectModal baseUrl={DEFAULT_BASE_URL} onClose={() => setShowNewModal(false)} onReady={openSession} />
      )}
      {showJoinModal && (
        <JoinProjectModal
          defaultBaseUrl={DEFAULT_BASE_URL}
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
