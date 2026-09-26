"use client";

import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";

// ── O vazio que ensina ───────────────────────────────────────────────────────
// O Estoque abre com sete abas e um banco zerado: 0 lugares, 0 fornecedores,
// nenhum item etiquetado. Cada aba dizia a mesma coisa por escrito — "Nenhum
// lugar cadastrado ainda.", "Nenhum fornecedor cadastrado ainda.", "Nada nesta
// hierarquia." — e nenhuma dizia o que a aba É, qual é o primeiro passo, nem
// que existe uma ordem entre elas (e existe: sem hierarquia não sai SKU, sem
// SKU não sai etiqueta; sem lugar a aba Localização nunca sai do zero).
//
// O módulo já tinha UM exemplar do que fazer — o `QcDesligado` da aba Conferir,
// que explica com calma o que falta, quem resolve e o que acontece enquanto
// isso. Este componente é aquele formato virado peça, pra que as outras abas
// parem de improvisar um parágrafo cinza cada uma.
//
// Não é assistente de configuração: não guarda estado, não tem "passo 3 de 6",
// não bloqueia nada. É a pista que faltava, no lugar onde a pessoa parou.
export function EstadoVazio({ icone, titulo, tom = "info", children, acoes, depois, depoisTitulo }: {
  icone: string;
  titulo: string;
  /** `info` = falta fazer (azul, calmo) · `ok` = está tudo certo (verde). */
  tom?: "info" | "ok";
  children: ReactNode;
  /** Botões do primeiro passo. Um ou dois — três já é um menu. */
  acoes?: ReactNode;
  /** A ordem do que vem depois. Some quando não há ordem a contar. */
  depois?: { texto: ReactNode; feito?: boolean }[];
  /** A frase que apresenta a lista. Mora aqui, e não no corpo, porque os
   *  botões ficam ENTRE os dois: no corpo, ela anunciava a lista e vinha um
   *  par de botões antes dela. */
  depoisTitulo?: ReactNode;
}) {
  const cor = tom === "ok" ? "var(--ok)" : "var(--info)";
  return (
    <div className="glass glass-spec" style={{
      padding: "clamp(16px, 4vw, 22px)", borderRadius: "var(--r-md)",
      display: "flex", gap: 13, alignItems: "flex-start",
    }}>
      <span style={{ flex: "none", marginTop: 2 }}><Icon name={icone} size={20} color={cor} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ fontSize: 14 }}>{titulo}</strong>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6, marginTop: 6, overflowWrap: "anywhere" }}>
          {children}
        </div>
        {acoes && (
          // `flexWrap` e nada de `marginLeft: auto`: a 320px os dois botões
          // empilham alinhados à esquerda, junto do texto que eles completam.
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 13 }}>{acoes}</div>
        )}
        {depois && depois.length > 0 && (
          <>
            {depoisTitulo && (
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6, margin: "14px 0 0" }}>{depoisTitulo}</p>
            )}
            <Depois itens={depois} />
          </>
        )}
      </div>
    </div>
  );
}

// A ordem, com o que já está feito marcado. O número não é enfeite: é o que
// deixa "hierarquia antes de SKU, SKU antes de etiqueta" ser lido de uma vez,
// em vez de descoberto por erro no meio do caminho.
function Depois({ itens }: { itens: { texto: ReactNode; feito?: boolean }[] }) {
  return (
    <ol style={{ listStyle: "none", margin: "13px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {itens.map((p, i) => (
        <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <span aria-hidden style={{
            flex: "none", width: 19, height: 19, borderRadius: 999, marginTop: 1,
            display: "grid", placeItems: "center",
            fontSize: 11, fontWeight: 800, lineHeight: 1,
            color: p.feito ? "var(--bg)" : "var(--text-dim)",
            background: p.feito ? "var(--ok)" : "var(--surface)",
            border: `1px solid ${p.feito ? "var(--ok)" : "var(--border)"}`,
          }}>
            {p.feito ? <Icon name="check" size={12} color="var(--bg)" /> : i + 1}
          </span>
          {/* O "feito" precisa existir fora da cor: a marca verde é a única
              diferença visual entre um passo pronto e um pendente, e cor
              sozinha não chega a quem lê por leitor de tela. */}
          <span style={{
            fontSize: 12.5, lineHeight: 1.5, minWidth: 0, overflowWrap: "anywhere",
            color: p.feito ? "var(--text-dim)" : "var(--text)",
          }}>
            {p.feito && <span style={{ fontWeight: 700, color: "var(--ok)" }}>Feito · </span>}
            {p.texto}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Falhou ao carregar — que NÃO é a mesma coisa que estar vazio. Um catálogo que
// não respondeu e um catálogo zerado se pareciam na tela: os dois mostravam
// "não tem nada" e sumiam com os botões. No primeiro dia isso é fatal, porque
// a pessoa não tem como saber qual dos dois é.
//
// `naoTem` existe porque a frase antiga colava `oQue` num predicado no
// singular: "não quer dizer que **os fornecedores está vazio**", "que **os
// lugares está vazio**". Dois dos três chamadores passam um plural, então dois
// dos sete erros de carga do Estoque saíam com português quebrado — e erro de
// carga é justamente a hora em que a pessoa lê a frase inteira com atenção.
// Quem chama diz a negativa por extenso; o componente não tenta concordar
// sozinho com um substantivo que não conhece.
export function ErroDeCarga({ oQue, naoTem, onTentar }: {
  oQue: string;
  /** A negativa, já concordada: "não há nenhum fornecedor cadastrado". */
  naoTem: string;
  onTentar: () => void;
}) {
  return (
    <div className="glass glass-spec" style={{
      padding: "clamp(16px, 4vw, 22px)", borderRadius: "var(--r-md)",
      display: "flex", gap: 13, alignItems: "flex-start",
    }}>
      <span style={{ flex: "none", marginTop: 2 }}><Icon name="alert-triangle" size={20} color="var(--atencao)" /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ fontSize: 14 }}>Não deu pra carregar {oQue}</strong>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6, margin: "6px 0 0" }}>
          A tela não conseguiu falar com o servidor agora — isso <strong>não</strong> quer dizer
          que {naoTem}. Se persistir depois de tentar de novo, pode ser a sessão
          expirada (recarregue a página) ou um SQL de fundação que ainda não rodou.
        </p>
        <div style={{ marginTop: 13 }}>
          <Botao icone="refresh" onClick={onTentar}>Tentar de novo</Botao>
        </div>
      </div>
    </div>
  );
}
