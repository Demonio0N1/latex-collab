import { BrandMark } from "./BrandMark";

interface WelcomeScreenProps {
  onNewProject: () => void;
  onJoinProject: () => void;
}

const FEATURES = [
  { icon: "👥", title: "Edición en tiempo real", desc: "Varias personas escriben el mismo .tex a la vez, con cursores de colores." },
  { icon: "🔗", title: "Comparte con un link", desc: "Genera un enlace y quien lo abra entra al proyecto al instante." },
  { icon: "📄", title: "Vista previa de PDF", desc: "Compila y ve el resultado al lado del editor, con tu propio LaTeX." },
];

export default function WelcomeScreen({ onNewProject, onJoinProject }: WelcomeScreenProps) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-logo">
          <BrandMark size={56} />
        </div>
        <h1 className="welcome-title">LaTeX Collab</h1>
        <p className="welcome-subtitle">
          Editor de LaTeX colaborativo, autoalojado. Crea un proyecto o únete a uno para empezar.
        </p>

        <div className="welcome-cta">
          <button className="welcome-btn primary" onClick={onNewProject}>
            <span className="welcome-btn-icon">＋</span>
            Nuevo proyecto
          </button>
          <button className="welcome-btn" onClick={onJoinProject}>
            <span className="welcome-btn-icon">⇥</span>
            Unirse a un proyecto
          </button>
        </div>

        <div className="welcome-features">
          {FEATURES.map((f) => (
            <div className="welcome-feature" key={f.title}>
              <div className="welcome-feature-icon">{f.icon}</div>
              <div className="welcome-feature-title">{f.title}</div>
              <div className="welcome-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
