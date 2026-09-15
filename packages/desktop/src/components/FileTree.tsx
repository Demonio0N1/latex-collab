import type { ProjectFile } from "@latex-collab/shared";

const KIND_ICON: Record<string, string> = {
  tex: "📄",
  bib: "📚",
  cls: "🧩",
  sty: "🧩",
  bst: "🧩",
  image: "🖼️",
  other: "📦",
};

interface FileTreeProps {
  files: ProjectFile[];
  activeFile: string | null;
  onSelect: (path: string) => void;
}

export default function FileTree({ files, activeFile, onSelect }: FileTreeProps) {
  const relevant = files.filter((f) => f.kind !== "other");
  const others = files.filter((f) => f.kind === "other");

  return (
    <div className="file-tree">
      <div className="file-tree-section-title">Archivos LaTeX</div>
      {relevant.map((file) => (
        <button
          key={file.path}
          className={`file-tree-item ${file.path === activeFile ? "active" : ""}`}
          onClick={() => onSelect(file.path)}
        >
          <span>{KIND_ICON[file.kind]}</span> {file.path}
        </button>
      ))}
      {others.length > 0 && (
        <details className="file-tree-others">
          <summary>Otros archivos ({others.length})</summary>
          {others.map((file) => (
            <button
              key={file.path}
              className={`file-tree-item ${file.path === activeFile ? "active" : ""}`}
              onClick={() => onSelect(file.path)}
            >
              <span>{KIND_ICON[file.kind]}</span> {file.path}
            </button>
          ))}
        </details>
      )}
    </div>
  );
}
