// Fallback enquanto a tela do workspace carrega — a sidebar (no layout) fica
// fixa; só o conteúdo mostra um esqueleto. Evita "piscar" e tela em branco.
import { grade } from "../ui/grade";

export default function TridiflowLoading() {
  const box = (h: number, w: string | number = "100%", r = 12): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "linear-gradient(90deg,#eef0f4,#f6f7f9,#eef0f4)", backgroundSize: "200% 100%", animation: "tfSkeleton 1.2s ease-in-out infinite",
  });
  return (
    // Sem padding próprio: o <main> do workspace já dá o respiro (e no celular
    // ele encolhe pra 14px). Com os dois, o esqueleto nascia 32px deslocado do
    // conteúdo real e sobrava pouca largura numa tela de 320px.
    <div style={{ maxWidth: 1240 }}>
      <style>{"@keyframes tfSkeleton{0%{background-position:200% 0}100%{background-position:-200% 0}}"}</style>
      <div style={box(30, 260)} />
      <div style={{ ...box(16, 340), marginTop: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: grade(185, 4, 12), gap: 12, marginTop: 22 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={box(78, "100%", 16)} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 280px),1fr))", gap: 14, marginTop: 22 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={box(190, "100%", 16)} />)}
      </div>
    </div>
  );
}
