import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "./(plataforma)/Icon";

// 404 GLOBAL — vale pra qualquer rota que não existe, dentro ou fora da
// plataforma. Fica FORA de `(plataforma)` de propósito: quem cai aqui pode não
// ter sessão nenhuma, então a tela não pode depender do Shell, da sidebar nem
// de qualquer consulta ao banco. Zero fetch, zero cliente Supabase.
export const metadata: Metadata = {
  title: "Página não encontrada · Gaius",
  description: "O endereço não existe ou foi movido.",
  robots: { index: false, follow: false },
};

// Só endereços PÚBLICOS ou que o middleware sabe resolver — mandar alguém sem
// sessão pra uma rota fechada é trocar um beco sem saída por outro.
const ATALHOS = [
  { href: "/inicio", icone: "home", titulo: "Início", texto: "O painel da sua área" },
  { href: "/app", icone: "checklist", titulo: "Minhas atividades", texto: "O app do colaborador" },
  { href: "/login", icone: "lock", titulo: "Entrar", texto: "Se a sessão expirou" },
  { href: "/privacidade", icone: "shield", titulo: "Privacidade", texto: "Como tratamos seus dados" },
] as const;

export default function NaoEncontrado() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 22,
        // O padding lateral centraliza sozinho até 560px e nunca encosta na
        // borda a 320px.
        padding: "calc(40px + var(--safe-t)) max(18px, calc((100% - 560px) / 2)) calc(48px + var(--safe-b))",
        background: "var(--bg)",
        color: "var(--text)",
        textAlign: "center",
      }}
    >
      <div className="gaius-atmos" aria-hidden />

      <div
        aria-hidden
        style={{
          width: 76,
          height: 76,
          borderRadius: "var(--r-lg)",
          display: "grid",
          placeItems: "center",
          background: "color-mix(in srgb, var(--primary) 16%, transparent)",
          border: "1px solid color-mix(in srgb, var(--primary) 34%, transparent)",
        }}
      >
        <Icon name="map-pin" size={36} color="var(--primary)" />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: "var(--text-dim)" }}>
          ERRO 404
        </p>
        {/* clamp: 26px a 320px, 34px no desktop — sem media query e sem estourar. */}
        <h1 style={{ margin: 0, fontSize: "clamp(26px, 7vw, 34px)", lineHeight: 1.15, fontWeight: 800 }}>
          Essa página não existe
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--text-dim)" }}>
          O endereço pode ter mudado de lugar, ou o link que te trouxe até aqui
          está velho. Nada foi perdido — é só voltar por um dos caminhos abaixo.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", width: "100%" }}>
        <Link className="ui-btn" data-v="primario" data-t="lg" href="/inicio" style={{ flex: "1 1 200px", maxWidth: 260 }}>
          <Icon name="home" size={18} color="var(--on-primary, #fff)" />
          Voltar ao início
        </Link>
        <Link className="ui-btn" data-v="secundario" data-t="lg" href="/login" style={{ flex: "1 1 160px", maxWidth: 260 }}>
          <Icon name="lock" size={18} />
          Entrar
        </Link>
      </div>

      <nav
        aria-label="Áreas principais"
        style={{
          width: "100%",
          marginTop: 8,
          display: "grid",
          // minmax(min(100%, …)) — idêntico no desktop, uma coluna a 320px.
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
          gap: 10,
        }}
      >
        {ATALHOS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="ui-card-alvo"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: "var(--tap)",
              padding: "12px 14px",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              textDecoration: "none",
              textAlign: "left",
            }}
          >
            <Icon name={a.icone} size={20} color="var(--text-dim)" />
            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{a.titulo}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{a.texto}</span>
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
