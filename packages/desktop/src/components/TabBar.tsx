interface TabBarProps {
  openFiles: string[];
  activeFile: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

function fileLabel(path: string): string {
  return path.split("/").pop() ?? path;
}

export default function TabBar({ openFiles, activeFile, onSelect, onClose }: TabBarProps) {
  return (
    <div className="tab-bar">
      {openFiles.map((file) => (
        <div key={file} className={`tab ${file === activeFile ? "active" : ""}`} onClick={() => onSelect(file)} title={file}>
          <span className="tab-label">{fileLabel(file)}</span>
          {openFiles.length > 1 && (
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(file);
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
