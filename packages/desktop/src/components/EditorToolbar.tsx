interface EditorToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onSection: () => void;
  onSubsection: () => void;
  onBulletList: () => void;
  onNumberedList: () => void;
  onTable: () => void;
  onInlineMath: () => void;
  onBlockMath: () => void;
  onLink: () => void;
  onCitation: () => void;
  onReference: () => void;
  onInsertImage: () => void;
  imageBusy: boolean;
}

export default function EditorToolbar({
  onBold,
  onItalic,
  onSection,
  onSubsection,
  onBulletList,
  onNumberedList,
  onTable,
  onInlineMath,
  onBlockMath,
  onLink,
  onCitation,
  onReference,
  onInsertImage,
  imageBusy,
}: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <button title="Negrita" onClick={onBold}>
        <strong>B</strong>
      </button>
      <button title="Cursiva" onClick={onItalic}>
        <em>I</em>
      </button>
      <span className="toolbar-sep" />
      <button title="Sección" onClick={onSection}>
        H1
      </button>
      <button title="Subsección" onClick={onSubsection}>
        H2
      </button>
      <span className="toolbar-sep" />
      <button title="Lista con viñetas" onClick={onBulletList}>
        • Lista
      </button>
      <button title="Lista numerada" onClick={onNumberedList}>
        1. Lista
      </button>
      <span className="toolbar-sep" />
      <button title="Tabla" onClick={onTable}>
        ▦ Tabla
      </button>
      <button title="Insertar imagen…" onClick={onInsertImage} disabled={imageBusy}>
        {imageBusy ? "Subiendo…" : "🖼 Imagen"}
      </button>
      <span className="toolbar-sep" />
      <button title="Fórmula en línea" onClick={onInlineMath}>
        $x$
      </button>
      <button title="Fórmula en bloque" onClick={onBlockMath}>
        ∑ Bloque
      </button>
      <span className="toolbar-sep" />
      <button title="Enlace (requiere \usepackage{hyperref})" onClick={onLink}>
        🔗 Enlace
      </button>
      <button title="Cita bibliográfica" onClick={onCitation}>
        Cita
      </button>
      <button title="Referencia cruzada" onClick={onReference}>
        Ref
      </button>
    </div>
  );
}
