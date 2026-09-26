// Skeleton instantâneo enquanto a aba carrega no servidor — troca de aba não trava.
import { grade } from "./ui/grade";

export default function Loading() {
  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ height: 34, width: 220, borderRadius: 10, background: "var(--surface-2)", animation: "pulse 1.2s ease-in-out infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: grade(185, 4, 14), gap: 14, marginTop: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass" style={{ height: 92, borderRadius: 18, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div className="glass" style={{ height: 260, borderRadius: 20, marginTop: 18, animation: "pulse 1.2s ease-in-out infinite" }} />
    </div>
  );
}
