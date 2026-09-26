"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Fila, useAbrirFechar, useOnda } from "./micro";
import { useIsMobile } from "./useMediaQuery";

// ── Kit mobile ───────────────────────────────────────────────────────────────
// O celular não é a tela do desktop encolhida: é outra hierarquia. Estas peças
// existem para responder sempre as mesmas quatro perguntas em cada tela —
// o que aparece de cara, o que é ação, o que fica escondido, o que sai.
// O CSS que as sustenta está no bloco "KIT MOBILE" do globals.css.

/**
 * "há 3 min", "há 2 h", "há 4 d". Mora aqui porque quem exibe isso é o
 * `PageHead` — e porque existia copiado em cinco arquivos, quatro deles numa
 * versão que parava nas horas e dizia "há 72 h" onde esta diz "há 3 d".
 */
export function agoLabel(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "agora";
  const m = Math.floor(s / 60);
  if (m < 1) return "há menos de 1 min";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/**
 * Cabeçalho de página: título compacto no celular, subtítulo opcional.
 *
 * É o ÚNICO cabeçalho de página do sistema. Antes eram dois componentes
 * (este e o `PageHeader` de producao/parts.tsx) mais cinco `h1` escritos à
 * mão, com cinco tamanhos diferentes — a Logística tinha dois no mesmo
 * arquivo, então o título saltava de tamanho quando os dados chegavam.
 *
 * `updatedAt` é o caso do `PageHeader` absorvido: a marca de atualização é
 * `.desk-only` de propósito. No celular ela roubava a primeira dobra de uma
 * informação que ninguém abre a tela para ler.
 */
export function PageHead({ title, sub, right, updatedAt }: { title: string; sub?: ReactNode; right?: ReactNode; updatedAt?: string }) {
  return (
    // flexWrap: a 320px o h1 empurrava o "Atualizado há X" para fora da tela.
    <div className="page-head" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <p style={{ color: "var(--text-dim)", marginTop: 6 }}>{sub}</p>}
      </div>
      {right && <div style={{ flex: "none" }}>{right}</div>}
      {!right && updatedAt && (
        <span className="desk-only" style={{ flex: "none", fontSize: 12, color: "var(--text-dim)" }}>
          Atualizado {agoLabel(updatedAt)}
        </span>
      )}
    </div>
  );
}

/**
 * Bloco secundário: no desktop aparece sempre; no celular fica atrás de um
 * "Ver mais". Nada de métrica de apoio ocupando a primeira dobra do celular.
 */
export function VerMais({ label = "Ver mais", children, aberto = false }: { label?: string; children: ReactNode; aberto?: boolean }) {
  const [on, setOn] = useState(aberto);
  // A sanfona (`.t-acc`) só entra NO CELULAR: no computador o bloco tem de
  // aparecer sempre, e um `data-open="false"` fecharia a altura ali também.
  // Enquanto o `useIsMobile` não responde — servidor e primeira pintura — vale
  // o caminho antigo. Num celular ele nasce `display: none`, exatamente o mesmo
  // NADA que a sanfona fechada mostra em seguida: por isso não há piscada.
  //
  // O ESQUELETO é o mesmo nos dois caminhos (três divs), só as classes trocam.
  // Se a estrutura mudasse, o React remontaria o filho ao hidratar — e um filho
  // que busca dados faria duas buscas por carga.
  const celular = useIsMobile();
  // `.vm-bloco` continua tirando o bloco do FLUXO quando ele está fechado de
  // vez, e é isso que o `montado` guarda: um bloco fechado que ficasse no
  // fluxo com altura 0 ainda contaria como item numa grade com `gap` (o par
  // `.duo` da tela de Vendas), e sobraria um respiro fantasma sob o vizinho.
  // O `is-open` chega um quadro depois de entrar no fluxo — sem essa folga o
  // navegador pinta a altura cheia direto e não há transição nenhuma.
  const { montado, classe } = useAbrirFechar(on, "--acc-collapse");
  return (
    <>
      {/* O conteúdo é renderizado UMA vez. Duplicar (uma cópia .desk-only e
          outra .mob-only) montaria o filho duas vezes — e um filho que busca
          dados passaria a fazer dois polls por ciclo. */}
      <div
        className={`vm-bloco${montado ? " aberto" : ""}${celular ? " t-acc" : ""}`}
        data-open={classe === "is-open" ? "true" : "false"}
      >
        {/* O respiro do painel mora no `-inner`, NUNCA no `-panel`: padding
            numa trilha de `0fr` deixa uma tira de altura residual e o bloco
            nunca fecha de verdade. */}
        <div className={celular ? "t-acc-panel" : undefined}>
          <div className={celular ? "t-acc-panel-inner" : undefined}>{children}</div>
        </div>
      </div>
      {/* A seta responde ao dedo na hora (`on`), não ao quadro de folga da
          altura: atrasar o único retorno visível do toque é o que faz a pessoa
          tocar de novo. */}
      <button className="mob-only vermais-btn t-acc" data-open={on ? "true" : "false"} onClick={() => setOn(!on)}>
        {on ? "Ver menos" : label}
        {/* Sempre `chevron-down`: quem vira a seta é o `scaleY(-1)` do
            `.t-acc-chevron`. Trocar o nome do ícone faria a seta PULAR entre
            dois desenhos no meio da abertura, em vez de girar junto com ela. */}
        <Icon className="t-acc-chevron" name="chevron-down" size={15} color="var(--text-dim)" />
      </button>
    </>
  );
}

/** Linha de um card de lista (substitui a linha de tabela no celular). */
export type CampoCard = { label: string; value: ReactNode; forte?: boolean; cor?: string };

/**
 * Tabela vira lista de cards no celular. `head` é o cartão (título + ação),
 * `campos` viram pares rótulo/valor em duas colunas.
 */
export function CardLinha({ titulo, tag, campos, onClick, rodape, style }: { titulo: ReactNode; tag?: ReactNode; campos: CampoCard[]; onClick?: () => void; rodape?: ReactNode; style?: CSSProperties }) {
  const Tag = onClick ? "button" : "div";
  const onda = useOnda();
  return (
    <Tag
      onClick={onClick}
      // A onda confirma que o toque CHEGOU: entre o dedo e a tela seguinte há
      // uns 300ms de nada, e é neles que a pessoa toca de novo.
      onPointerDown={onClick ? onda : undefined}
      className={`glass-spec mt-eleva${onClick ? " ui-card-alvo mt-anel" : ""}`}
      style={{
        display: "block", width: "100%", textAlign: "left", border: "1px solid var(--border)",
        background: "var(--surface)", color: "var(--text)", borderRadius: 16, padding: 14,
        cursor: onClick ? "pointer" : undefined, minHeight: onClick ? "var(--tap)" : undefined,
        // Por último de propósito: é aqui que entra o `--mt-i` que a `Fila`
        // carimba em cada cartão, e é por ele que a lista chega escalonada.
        ...style,
      }}
    >
      {/* O título é a IDENTIDADE da linha, e numa tabela virada card ele divide
          a primeira linha com a etiqueta da direita — sobram ~150px. Numa só
          linha com reticências, "Almofada entintada para carimbo nº 2" e
          "Almofada entintada para carimbo nº 3" viram o MESMO texto
          ("Almofada entintada para…"): a única coisa que a pessoa precisa ler
          é justamente a que some. Duas linhas (com teto, pra não empurrar o
          resto do card) resolvem sem soltar a altura.
          `alignItems: flex-start` porque com duas linhas o `center` desce a
          etiqueta pro meio do parágrafo, longe da linha a que ela pertence. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: campos.length ? 10 : 0 }}>
        <strong style={{
          fontSize: 14.5, minWidth: 0, lineHeight: 1.25, overflowWrap: "break-word",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{titulo}</strong>
        {tag && <span style={{ marginLeft: "auto", flex: "none" }}>{tag}</span>}
      </div>
      {campos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
          {campos.map((c) => (
            <div key={c.label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.label}</div>
              <div style={{ fontSize: 13.5, fontWeight: c.forte ? 800 : 600, color: c.cor, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}
      {rodape && <div style={{ display: "flex", gap: 8, marginTop: 12 }}>{rodape}</div>}
    </Tag>
  );
}

/** Par tabela (desktop) / lista de cards (celular) — um só componente. */
export function TabelaOuCards({ tabela, cards }: { tabela: ReactNode; cards: ReactNode }) {
  return (
    <>
      {/* A `.mt-fila` do desktop teria de ir no `<tbody>`, e o `<table>` chega
          pronto de fora — carimbá-la aqui exigiria mudar a assinatura (ou
          vasculhar a árvore da tabela alheia). Fica para quem monta a tabela. */}
      <div className="tbl-desk" style={{ overflowX: "auto" }}>{tabela}</div>
      <Fila className="tbl-mob" style={{ display: "flex", flexDirection: "column", gap: 10 }}>{cards}</Fila>
    </>
  );
}
