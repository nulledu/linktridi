"use client";

import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { GaiusMark } from "../GaiusMark";
import { Icon } from "./Icon";
import { Botao, BotaoIcone } from "./ui/controles";
import { toast } from "./Toast";
import { TrocaIcone, useAbrirFechar } from "./ui/micro";
import { Dropdown } from "./ui/Dropdown";
import { travarRolagem } from "./ui/travaRolagem";
import {
  ACCENT_PADRAO, TEMAS, acertarAparenciaComConta, aplicarAccent, aplicarTema, corValida,
  lerAparencia, normCor, salvarAparenciaNaConta, temaDaCor,
} from "@/lib/aparencia";
import { TEMA_PADRAO, type PrefTema } from "@/lib/tema";
import { GlassSelect } from "./GlassPicker";
import { TrocarSenha } from "./TrocarSenha";

export function UserPanel({ name, role, photoUrl = null, aparenciaNaConta }: { name: string; role: Role; photoUrl?: string | null; aparenciaNaConta?: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  // Mesma ideia no modal de Ajustes: o estado mora aqui, então é aqui que a
  // saída é segurada. Os `onClose()` lá de dentro continuam só desligando o
  // booleano — quem espera a animação terminar antes de desmontar é o hook.
  const aj = useAbrirFechar(ajustes, "--modal-close-dur");

  // A conta já foi lida no servidor e aplicada antes do paint (layout da
  // plataforma). Aqui só sobe o que o aparelho tem e a conta ainda não: troca
  // que não chegou a gravar, ou escolha de antes de ela morar na conta.
  useEffect(() => { acertarAparenciaComConta(aparenciaNaConta); }, [aparenciaNaConta]);

  async function logout() {
    // Só navega se a sessão foi MESMO encerrada. Antes, um logout que falhasse
    // mandava a pessoa pro /login com a sessão viva: numa máquina compartilhada,
    // o próximo a sentar abria o ERP no lugar dela e nada na tela avisava.
    const r = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!r?.ok) { toast("Não foi possível sair. Tente de novo.", "erro"); return; }
    router.push("/login"); router.refresh();
  }

  return (
    <div className="rail-conta" style={{ position: "relative" }}>
      {/* Menu da conta = Dropdown do sistema: portal, folha que sobe quando o
          botão está no pé da sidebar e folha presa embaixo no celular. */}
      <Dropdown titulo="Conta" aberto={menu} onAbertoChange={setMenu} largura={220}
        secoes={[
          { itens: [{ id: "ajustes", rotulo: "Ajustes", icone: "settings", onSelect: () => setAjustes(true) }] },
          { itens: [{ id: "sair", rotulo: "Sair", icone: "x", perigo: true, onSelect: () => void logout() }] },
        ]}
        gatilho={({ ref, ...g }) => (
          <button ref={ref} type="button" {...g} className="glass-spec"
            style={{ width: "100%", minHeight: "var(--tap)", display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
            {photoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: "var(--r-sm)", objectFit: "cover", flex: "none" }} />
              : <span style={{ width: 34, height: 34, borderRadius: "var(--r-sm)", flex: "none", display: "grid", placeItems: "center", background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", fontWeight: 800 }}>{name[0]?.toUpperCase()}</span>}
            {/* `rail-oculto`: na sidebar encolhida sobra só a foto — sem isto o nome
                e o cargo eram espremidos numa faixa de 56px e saíam cortados. */}
            <span className="rail-oculto" style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>{ROLE_LABEL[role]}</span>
            </span>
            {/* A seta É a informação (aberto/fechado), então os dois ícones vivem na
                mesma célula: trocar o nó fazia a fileira dar um solavanco. */}
            <TrocaIcone className="rail-oculto" ligado={menu} a="chevron-up" b="chevron-down"
              size={16} corA="var(--text-dim)" corB="var(--text-dim)" />
          </button>
        )} />

      {aj.montado && <AjustesModal classe={aj.classe} onClose={() => setAjustes(false)} />}
    </div>
  );
}

// ── Ajustes: aparência, página inicial, tutorial e senha ────────────────────
type AjustesDaConta = {
  username: string | null;
  paginaInicial: { atual: string | null; padrao: string; opcoes: { key: string; label: string }[] } | null;
};

/** O que o modal precisa e o shell não tem. Lido quando o modal ABRE — nunca
 *  por carga de página. Falhou (sem sessão, fora do ar): as seções que
 *  dependem disso simplesmente não aparecem. */
function useAjustesDaConta(): AjustesDaConta | null {
  const [d, setD] = useState<AjustesDaConta | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/ajustes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: AjustesDaConta | null) => { if (vivo && j) setD(j); })
      .catch(() => { /* segue sem as seções da conta */ });
    return () => { vivo = false; };
  }, []);
  return d;
}

function AjustesModal({ onClose, classe = "" }: { onClose: () => void; classe?: string }) {
  const conta = useAjustesDaConta();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const soltar = travarRolagem();
    return () => { document.removeEventListener("keydown", onKey); soltar(); };
  }, [onClose]);

  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose}>
      <div className={`apple-modal glass glass-spec sheet t-modal ${classe}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: "var(--r-lg)", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Ajustes</h2>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" style={{ marginLeft: "auto" }} onClick={onClose} />
        </div>

        <PainelAparencia />

        {conta?.paginaInicial && <SecaoPaginaInicial dados={conta.paginaInicial} />}

        {/* Atalho pra página de status. Ela é pública (/status), então cabe a
            qualquer pessoa logada — é onde se descobre, num lugar só, se o
            sistema, os funis e os serviços de terceiros estão no ar. */}
        <Secao titulo="Status dos sistemas">
          <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 10 }}>
            Veja num lugar só se o sistema, os funis e os serviços de terceiros (Meta, Supabase, Vercel…) estão no ar.
          </p>
          <Link href="/status" onClick={onClose}
            style={{ minHeight: "var(--tap)", padding: "10px 16px", borderRadius: "var(--r-sm)", fontWeight: 700, fontSize: 13.5, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <Icon name="activity" size={16} color="var(--primary-texto)" /> Abrir página de status
            <Icon name="arrow-right" size={15} color="var(--text-dim)" style={{ marginLeft: 2 }} />
          </Link>
        </Secao>

        <Secao titulo="Trocar senha">
          {/* Senha atual: é o que prova que quem está trocando é o dono da
              conta, e não quem sentou num computador com a sessão esquecida
              aberta. O usuário vai oculto no formulário pro gerenciador de
              senhas saber qual conta atualizar. */}
          <TrocarSenha username={conta?.username} />
        </Secao>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Onde o Gaius abre depois do login. É a MESMA escolha que quem administra a
 * equipe faz na ficha (aba Acesso) — um campo só, vale a última. Só aparecem
 * as áreas que a pessoa tem: um atalho pra área sem acesso mandaria o login
 * direto pro 403.
 */
function SecaoPaginaInicial({ dados }: { dados: NonNullable<AjustesDaConta["paginaInicial"]> }) {
  const [valor, setValor] = useState(dados.atual ?? "");
  const [salvando, setSalvando] = useState(false);

  async function escolher(v: string) {
    if (v === valor || salvando) return;
    const antes = valor;
    setValor(v);                                   // a escolha aparece na hora
    setSalvando(true);
    try {
      const r = await fetch("/api/ajustes", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paginaInicial: v || null }),
      });
      const d = (await r.json().catch(() => ({}))) as { detail?: string };
      if (!r.ok) { setValor(antes); toast(d.detail || "Não deu pra salvar a página inicial.", "erro"); return; }
      toast("Página inicial salva.", "ok");
    } catch {
      setValor(antes);
      toast("Sem conexão. A página inicial não foi salva.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = [
    { value: "", label: `Padrão · ${dados.padrao}` },
    ...dados.opcoes.map((o) => ({ value: o.key, label: o.label })),
  ];
  return (
    <Secao titulo="Página inicial">
      <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 10 }}>
        Onde o Gaius abre quando você entra. Quem administra a equipe também pode mudar isto na sua ficha.
      </p>
      <GlassSelect value={valor} onChange={escolher} options={opcoes} disabled={salvando} style={{ width: "100%" }} />
    </Secao>
  );
}

// Acompanhar o aparelho vem primeiro porque é o padrão: quem nunca escolheu
// nada está nele.
const OPCOES_TEMA: ReadonlyArray<readonly [PrefTema, string, string]> = [
  ["system", "Sistema", "device-desktop"],
  ["light", "Claro", "sun"],
  ["dark", "Escuro", "moon"],
];

/**
 * Personalização visual — reaproveitada nos Ajustes E no primeiro passo do
 * tutorial, pra não existirem dois seletores de tema com comportamento
 * diferente (era o caso antes). Toda mudança vale na hora e sobe pra conta.
 */
export function PainelAparencia({ compacto = false }: { compacto?: boolean }) {
  const [tema, setTemaEscolhido] = useState<PrefTema>(TEMA_PADRAO);
  // O que está PINTANDO agora — no "Sistema" muda sozinho quando o SO troca.
  const [claro, setClaro] = useState(false);
  const [accent, setAccent] = useState<string>(ACCENT_PADRAO);
  const [hex, setHex] = useState<string>(ACCENT_PADRAO);
  const [abrirLivre, setAbrirLivre] = useState(false);

  useEffect(() => {
    const a = lerAparencia();
    setTemaEscolhido(a.tema); setAccent(a.accent); setHex(a.accent);
    const ler = () => setClaro(document.documentElement.classList.contains("light"));
    ler();
    const mo = new MutationObserver(ler);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  function persistir(next: { tema?: PrefTema; accent?: string }) {
    salvarAparenciaNaConta({ tema: next.tema ?? tema, accent: next.accent ?? accent });
  }
  function escolherTema(p: PrefTema) { setTemaEscolhido(p); aplicarTema(p); persistir({ tema: p }); }
  function setCor(c: string) { const v = normCor(c); setAccent(v); setHex(v); aplicarAccent(v); persistir({ accent: v }); }

  const custom = !temaDaCor(accent);
  // Mesma conta do CSS (--gaius-mark): a marca clareia no escuro e escurece no
  // claro, então a miniatura de cada tema mostra a cor REAL que a logo terá.
  const corDaMarca = (c: string) => claro ? `color-mix(in srgb, ${c} 84%, #000)` : `color-mix(in srgb, ${c} 76%, #fff)`;

  return (
    <>
      <Secao titulo="Aparência">
        {/* Três colunas iguais que encolhem: no celular de 320px o ícone sobe
            pra cima do rótulo (flex-wrap) em vez de estourar a largura. */}
        <div role="radiogroup" aria-label="Tema" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {OPCOES_TEMA.map(([val, lbl, ic]) => {
            const on = tema === val;
            return (
              <button key={val} role="radio" aria-checked={on} onClick={() => escolherTema(val)} style={{ minWidth: 0, minHeight: "var(--tap)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "4px 8px", padding: "10px 6px", borderRadius: "var(--r-sm)", cursor: "pointer", fontWeight: 700, fontSize: 14,
                border: `1.5px solid ${on ? "var(--primary)" : "var(--border)"}`, background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)", color: "var(--text)" }}>
                <Icon name={ic} size={17} color={on ? "var(--primary-texto)" : "var(--text-dim)"} /> {lbl}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45, marginTop: 8 }}>
          {tema === "system" && "Acompanha o claro/escuro do seu aparelho. "}Fica salvo na sua conta, não só neste navegador.
        </p>
      </Secao>

      {/* Coleção nomeada, não paleta. Cada linha mostra a marca JÁ na cor do
          tema e o realce aplicado — a escolha é vista, não adivinhada. A cor
          arbitrária existe, mas atrás de um passo. */}
      <Secao titulo="Cor do sistema">
        <div role="radiogroup" aria-label="Cor do sistema" style={{ display: "grid", gap: 8, gridTemplateColumns: compacto ? "1fr" : "repeat(auto-fit, minmax(min(100%, 232px), 1fr))" }}>
          {TEMAS.map((t) => {
            const on = accent === normCor(t.cor);
            return (
              <button key={t.key} role="radio" aria-checked={on} onClick={() => setCor(t.cor)}
                style={{ minHeight: "var(--tap)", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: "var(--r-md)", cursor: "pointer", textAlign: "left",
                  border: `1.5px solid ${on ? t.cor : "var(--border)"}`, background: on ? `color-mix(in srgb, ${t.cor} 12%, transparent)` : "var(--surface)", color: "var(--text)", transition: "border-color .15s ease, background .15s ease" }}>
                <GaiusMark size={26} glow={false} color={corDaMarca(t.cor)} style={{ flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{t.nome}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.nota}</span>
                </span>
                <span aria-hidden style={{ flex: "none", width: 18, height: 18, borderRadius: "50%", background: t.cor, display: "grid", placeItems: "center" }}>
                  {on && <Icon name="check" size={12} color="#fff" />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cor livre — discreta, do jeito que "Personalizada…" fica no fim de
            uma lista de opções, e não como um arco-íris disputando atenção. */}
        {(abrirLivre || custom) ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <CampoCor rotulo="Escolher cor" valor={corValida(hex) ? hex : ACCENT_PADRAO} aoMudar={setCor} tamanho={36} />
            <input value={hex} onChange={(e) => { setHex(e.target.value); if (corValida(e.target.value)) setCor(e.target.value); }}
              aria-label="Cor em hexadecimal" placeholder="#7C3AED" spellCheck={false}
              style={{ ...inp, width: 130, minHeight: "var(--tap)", fontFamily: "ui-monospace, monospace", textTransform: "uppercase" }} />
            <Botao onClick={() => { setCor(ACCENT_PADRAO); setAbrirLivre(false); }}>Voltar ao padrão</Botao>
          </div>
        ) : (
          <Botao variante="sutil" onClick={() => setAbrirLivre(true)} style={{ marginTop: 10 }}>Cor personalizada…</Botao>
        )}
      </Secao>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 10 }}>{titulo}</h3>
      {children}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 14 };
