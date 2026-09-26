"use client";

// ── Contingência · peças pequenas ────────────────────────────────────────────
// Card de número grande, a conta de uma taxa, distribuição em barras finas e
// o cartão do atendente. Ficam juntas porque a Visão Geral, a Telefônica e a
// tela de Atendentes desenham as mesmas coisas — três cópias divergiriam.

import type { ReactNode } from "react";
import { Icon } from "../../Icon";
import { KpiIcone, Selo } from "../../ui/primitives";
import { CartaoPainel } from "../../ui/CartaoPainel";
import { Progresso } from "../../ui/micro";
import { Pill, Avatar } from "../aquecimento/pecas";
import {
  fmtTaxa, SEM_DADOS, SAUDE, type Taxa, type Contagem, type ResumoAtendente,
} from "@/lib/contingencia-const";

export type Tom = "neutro" | "contexto" | "alerta";

/** Card grande. Desde 23/09/26 é o MESMO desenho da Visão Geral (KpiIcone
 *  "painel"): ladrilho na cor da pessoa, "i" com a origem do número, contexto
 *  embaixo. `origem` diz de onde o número saiu — a regra de separar o
 *  cadastrado do calculado continua, agora no "i". */
export function Kpi({ rotulo, valor, unidade, sub, icone = "chart-bar", tom = "neutro", origem, cobertura, cor, onClick }: {
  rotulo: string; valor: number | string; unidade?: string; sub?: ReactNode; icone?: string; tom?: Tom;
  origem?: string; cobertura?: number | null; cor?: string; onClick?: () => void;
}) {
  const tinta = cor ?? (tom === "alerta" ? "var(--perigo)" : "var(--primary)");
  const barra = cobertura !== undefined && cobertura !== null
    ? <Progresso rotulo={rotulo} valor={Math.max(0, Math.min(1, cobertura))} cor={tinta} altura={6} style={{ marginTop: 8 }} />
    : null;
  return (
    <KpiIcone label={rotulo} icon={icone} cor={tinta} ajuda={origem} onClick={onClick}
      value={unidade && typeof valor === "number" ? `${valor}${unidade.trim() === "%" ? "%" : ` ${unidade}`}` : valor}
      atual={typeof valor === "number" ? valor : undefined}
      sub={<>{sub ?? " "}{barra}</>}
      selo={tom === "alerta" ? <Selo tom="perigo">Precisa de atenção</Selo> : undefined} />
  );
}

export const Origem = ({ children }: { children: ReactNode }) => (
  <span className="ct-origem"><Icon name="info-circle" size={11} color="currentColor" /> {children}</span>
);

/** Bloco = `CartaoPainel` do kit (o cartão da Visão Geral): ladrilho com
 *  ícone, título, sub e as ações à direita. `tom` ficou por compatibilidade —
 *  o verde/azul de contexto saiu quando todas as abas ganharam o desenho da
 *  Visão Geral. */
export function Bloco({ titulo, sub, icone = "layout-grid", acoes, children }: {
  titulo: ReactNode; sub?: ReactNode; icone?: string; acoes?: ReactNode; tom?: Tom; children: ReactNode;
}) {
  return <CartaoPainel icone={icone} titulo={titulo} sub={sub} acoes={acoes}>{children}</CartaoPainel>;
}

export function Distribuicao({ itens, vazio = "Nada cadastrado ainda." }: { itens: Contagem[]; vazio?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.qtd));
  if (!itens.length) return <p className="ct-sub" style={{ marginInline: "auto" }}>{vazio}</p>;
  return (
    <div className="ct-dist">
      {itens.map((i) => (
        <div key={i.rotulo} className="ct-dist-l">
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.rotulo}</span>
          <b>{i.qtd}</b>
          <div className="ct-dist-b" aria-hidden><i style={{ width: `${(i.qtd / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** A taxa com a conta à mostra. Denominador zero não vira erro: vira "—" e
 *  a explicação de por que não há resultado. */
export function TaxaCard({ taxa }: { taxa: Taxa }) {
  const semDados = taxa.valor === null;
  return (
    <div className="ct-kpi" data-tom={semDados ? "neutro" : "contexto"}>
      <div className="ct-kpi-rot"><Icon name="percentage" size={15} color="var(--text-dim)" />{taxa.rotulo}</div>
      <div className="ct-kpi-val" style={semDados ? { color: "var(--text-dim)" } : undefined}>
        {fmtTaxa(taxa)}
      </div>
      <div className="ct-kpi-sub">{semDados ? SEM_DADOS : taxa.descricao}</div>
      <div className="ct-taxa-conta">
        <div className="ct-taxa-lado"><small>{taxa.numerador.rotulo}</small><b>{taxa.numerador.valor}</b></div>
        <span className="ct-taxa-op">÷</span>
        <div className="ct-taxa-lado"><small>{taxa.denominador.rotulo}</small><b>{taxa.denominador.valor}</b></div>
      </div>
      <Origem>fórmula informada, sem ajuste</Origem>
    </div>
  );
}

export function PillSaude({ saude }: { saude: ResumoAtendente["saude"] }) {
  return <Pill cor={SAUDE[saude].cor}>{SAUDE[saude].label}</Pill>;
}

export function CartaoAtendente({ a, onClick, compacto = false }: { a: ResumoAtendente; onClick?: () => void; compacto?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={"ct-at" + (onClick ? " ui-card-alvo" : "")}
      style={{ ["--ct-saude" as string]: SAUDE[a.saude].cor, textAlign: "left", font: "inherit", color: "inherit", cursor: onClick ? "pointer" : undefined, width: "100%" }}>
      <div className="ct-at-topo">
        <Avatar nome={a.nome} foto={a.foto} tam={40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 720, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{a.numeros} número{a.numeros === 1 ? "" : "s"}{a.celulares ? ` · ${a.celulares} celular${a.celulares === 1 ? "" : "es"}` : ""}</div>
        </div>
        <PillSaude saude={a.saude} />
      </div>
      {!compacto && (
        <div className="ct-at-nums">
          <div className="ct-at-n"><small>Aquecidos</small><b>{a.aquecidos}</b></div>
          <div className="ct-at-n"><small>Reservas</small><b>{a.reservas}</b></div>
          <div className="ct-at-n"><small>Em aquecimento</small><b>{a.emAquecimento}</b></div>
          <div className="ct-at-n"><small>Não aquecidos</small><b>{a.naoAquecidos}</b></div>
          <div className="ct-at-n"><small>Com proxy</small><b>{a.comProxy}</b></div>
          <div className="ct-at-n"><small>Sem proxy</small><b>{a.semProxy}</b></div>
          <div className="ct-at-n"><small>Aquecidos + proxy</small><b>{a.aquecidosComProxy}</b></div>
          <div className="ct-at-n"><small>Restr./bloq.</small><b>{a.caidos}</b></div>
          <div className="ct-at-n"><small>Em uso</small><b>{a.emUso}</b></div>
        </div>
      )}
      <div className="ct-at-motivo">{a.motivo}</div>
    </Tag>
  );
}

export function Vazio({ icone = "device-mobile", titulo, texto }: { icone?: string; titulo: string; texto?: string }) {
  return (
    <div style={{ padding: "34px 20px", textAlign: "center", color: "var(--text-dim)" }}>
      <Icon name={icone} size={28} color="var(--text-dim)" />
      <p style={{ fontWeight: 700, color: "var(--text)", marginTop: 10, marginInline: "auto" }}>{titulo}</p>
      {texto && <p style={{ fontSize: 13, marginTop: 4, marginInline: "auto" }}>{texto}</p>}
    </div>
  );
}

export const quando = (iso: string | null | undefined) => {
  if (!iso) return "nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};
