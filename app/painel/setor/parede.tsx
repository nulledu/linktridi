"use client";

import { Icon } from "../slides/Icon";
import { NumeroVivo } from "@/app/(plataforma)/ui/micro";
import "./setor.css";

/**
 * O SISTEMA VISUAL das paredes de setor (Produção 16:9 e Logística 9:16) —
 * a mesma pele da parede de vendas: lavanda, cartão branco, um roxo só, e cor
 * de ESTADO (verde/âmbar/vermelho) apenas onde ela significa alguma coisa.
 *
 * Mora fora do `pecas.tsx` de propósito: as peças antigas continuam lá com a
 * mesma assinatura (o painel de máquinas importa delas), e estas aqui são o
 * esqueleto novo — cabeçalho, faixa de status, indicador, progresso, alerta,
 * cartão de seção e as telas de espera/erro.
 *
 * Classes em `setor.css` (`.st-*`); medidas em pixel, porque o palco é fixo e
 * o `KioskShell` escala o conjunto.
 */

export type Tom = "ok" | "atencao" | "perigo" | "neutro" | "roxo";

export const corDoTom = (t: Tom): string =>
  t === "ok" ? "var(--st-ok)"
  : t === "atencao" ? "var(--st-atencao)"
  : t === "perigo" ? "var(--st-perigo)"
  : t === "roxo" ? "var(--st-roxo)"
  : "var(--st-fraco)";

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** Dado mais velho que isto é "parado" — a parede avisa em vez de fingir que está viva. */
export const IDADE_SUSPEITA_MS = 10 * 60_000;

const horaSP = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch { return "—"; }
};

/**
 * De onde vem o que está na tela: ao vivo, dado velho, ou sem conexão.
 * O selo responde "isso aqui está vivo?" — a pergunta mais comum de quem passa
 * por uma parede ligada 24 h.
 */
export function frescor({ atualizadoEm, offline, cachedAt, agoraMs }: {
  atualizadoEm?: string | null; offline: boolean; cachedAt: string | null; agoraMs: number;
}): { tom: Tom; texto: string; icone: string } {
  const quando = atualizadoEm || cachedAt;
  const idade = quando ? agoraMs - new Date(quando).getTime() : null;
  if (offline) {
    return { tom: "perigo", icone: "alert-triangle", texto: quando ? `Sem conexão · dados de ${horaSP(quando)}` : "Sem conexão" };
  }
  if (idade != null && idade > IDADE_SUSPEITA_MS) {
    return { tom: "atencao", icone: "clock", texto: `Dados de ${horaSP(quando!)}` };
  }
  return { tom: "ok", icone: "circle-check", texto: quando ? `Ao vivo · ${horaSP(quando)}` : "Ao vivo" };
}

/** Cabeçalho do painel: marca do setor, o que a tela é, e os selos à direita. */
export function SetorCabecalho({ icone, titulo, subtitulo, subtituloTom, selos }: {
  icone: string; titulo: string; subtitulo?: React.ReactNode; subtituloTom?: Tom;
  selos?: React.ReactNode;
}) {
  return (
    <header className="st-cab">
      <span className="st-cab-marca"><Icon name={icone} size={28} color="#fff" /></span>
      <div style={{ minWidth: 0 }}>
        <div className="st-cab-titulo">{titulo}</div>
        {subtitulo && (
          <div className="st-cab-sub" style={subtituloTom ? { color: corDoTom(subtituloTom), fontWeight: 700 } : undefined}>{subtitulo}</div>
        )}
      </div>
      {selos && <div className="st-cab-direita">{selos}</div>}
    </header>
  );
}

/** Pílula de estado (ponto + texto). `neutra` é o selo de sincronia em repouso. */
export function Pilula({ tom, icone, children }: { tom: Tom; icone?: string; children: React.ReactNode }) {
  const cor = corDoTom(tom);
  return (
    <span className="st-pilula" style={{ ["--st-cor" as string]: cor }}>
      {icone ? <Icon name={icone} size={16} color={cor} /> : <span className="st-ponto" />}
      {children}
    </span>
  );
}

/**
 * A PRIMEIRA frase da parede: como está a operação agora. Um tom, um título
 * curto, um detalhe. Tudo o mais na tela explica esta linha.
 */
export function FaixaStatus({ tom, icone, titulo, detalhe, direita }: {
  tom: Tom; icone: string; titulo: string; detalhe?: React.ReactNode; direita?: React.ReactNode;
}) {
  return (
    <div className="st-status" role="status" style={{ ["--st-cor" as string]: corDoTom(tom) }}>
      <span className="st-status-ico"><Icon name={icone} size={24} color="#fff" /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="st-status-titulo">{titulo}</div>
        {detalhe && <div className="st-status-det">{detalhe}</div>}
      </div>
      {direita && <div style={{ flex: "none" }}>{direita}</div>}
    </div>
  );
}

/**
 * Indicador da parede: selo do ícone, título, número GRANDE e a nota que
 * explica. `aceso` marca problema ativo (faixa de cor na borda — nada pisca).
 */
export function Indicador({ icone, titulo, valor, texto, tom = "neutro", nota, notaIcone, tamanho = 52, aceso, i = 0, children }: {
  icone: string; titulo: string; valor?: number; texto?: string; tom?: Tom;
  nota?: React.ReactNode; notaIcone?: string; tamanho?: number; aceso?: boolean; i?: number;
  children?: React.ReactNode;
}) {
  const cor = corDoTom(tom);
  const tinta = tom === "neutro" ? "var(--st-texto)" : cor;
  return (
    <div className="st-card st-kpi st-linha" data-aceso={aceso ? "1" : undefined}
      style={{ ["--st-i" as string]: i, ["--st-cor" as string]: cor }}>
      <div className="st-kpi-topo">
        <span className="st-selo-ico" style={tom !== "neutro" && tom !== "roxo" ? { background: `color-mix(in srgb, ${cor} 13%, var(--st-cartao))` } : undefined}>
          <Icon name={icone} size={21} color={tom === "neutro" ? "var(--st-roxo)" : cor} />
        </span>
        <span className="st-kpi-titulo">{titulo}</span>
      </div>
      <div className="st-num" style={{ fontSize: tamanho, color: tinta }}>
        {texto ?? <NumeroVivo valor={valor ?? 0} formatar={fmtN} />}
      </div>
      {children}
      {nota && (
        <div className="st-kpi-nota">
          {notaIcone && <Icon name={notaIcone} size={14} color={tom === "neutro" ? "var(--st-fraco)" : cor} />}
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{nota}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Barra de progresso em camadas. `feito` na frente; `emCurso` (opcional) atrás,
 * mais clara — "o que já saiu" e "o que está saindo" na mesma régua.
 */
export function BarraProgresso({ feito, emCurso = 0, altura = 14 }: { feito: number; emCurso?: number; altura?: number }) {
  const f = Math.max(0, Math.min(1, feito));
  const c = Math.max(f, Math.min(1, feito + emCurso));
  return (
    <div className="st-prog" style={{ height: altura }} role="progressbar" aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100}>
      {emCurso > 0 && <span className="st-prog-curso" style={{ transform: `scaleX(${c})` }} />}
      <span style={{ transform: `scaleX(${f})` }} />
    </div>
  );
}

/** Cartão de seção: rótulo em cima (com extra à direita) e o conteúdo. */
export function CartaoSecao({ titulo, icone, tom, extra, children, style, corpo }: {
  titulo: string; icone?: string; tom?: Tom; extra?: React.ReactNode; children?: React.ReactNode;
  style?: React.CSSProperties; corpo?: React.CSSProperties;
}) {
  const cor = tom ? corDoTom(tom) : "var(--st-fraco)";
  return (
    <section className="st-card" style={{ display: "flex", flexDirection: "column", gap: 12, ...style }}>
      <div className="st-rotulo" style={{ color: cor }}>
        {icone && <Icon name={icone} size={17} color={cor} />}
        <span>{titulo}</span>
        {extra != null && <span className="st-rotulo-extra">{extra}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, ...corpo }}>{children}</div>
    </section>
  );
}

/** Uma linha de alerta: selo do ícone, o que é (+ detalhe), e quantos. */
export function AlertaLinha({ tom, icone, texto, sub, valor, i = 0 }: {
  tom: Tom; icone: string; texto: React.ReactNode; sub?: React.ReactNode; valor?: React.ReactNode; i?: number;
}) {
  const cor = corDoTom(tom);
  return (
    <div className="st-alerta st-linha" style={{ ["--st-cor" as string]: cor, ["--st-i" as string]: i }}>
      <span className="st-alerta-ico"><Icon name={icone} size={19} color={cor} /></span>
      <span className="st-alerta-txt">
        {texto}
        {sub && <span className="st-alerta-sub">{sub}</span>}
      </span>
      {valor != null && <span className="st-alerta-num">{valor}</span>}
    </div>
  );
}

/** Vazio com cara de estado ("tudo em dia"), não de defeito. */
export function Vazio({ icone = "circle-check", tom = "ok", children }: { icone?: string; tom?: Tom; children: React.ReactNode }) {
  return (
    <div className="st-vazio">
      <span className="st-selo-ico" style={{ width: 48, height: 48, background: `color-mix(in srgb, ${corDoTom(tom)} 12%, var(--st-cartao))` }}>
        <Icon name={icone} size={24} color={corDoTom(tom)} />
      </span>
      {children}
    </div>
  );
}

/**
 * Tela de espera ou de erro do painel inteiro. Erro só depois de uma tentativa
 * sem resposta e sem leitura salva — antes disso é "sincronizando".
 */
export function EsperaSetor({ erro, setor, icone }: { erro: boolean; setor: string; icone: string }) {
  return (
    <div className="st-painel" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="st-espera">
        <span className="st-cab-marca" style={{ width: 72, height: 72, borderRadius: 22, opacity: erro ? 0.55 : 1 }}>
          <Icon name={erro ? "alert-triangle" : icone} size={38} color="#fff" />
        </span>
        <div className="st-espera-titulo">{erro ? `Sem dados da ${setor}` : `Sincronizando ${setor}…`}</div>
        <div className="st-espera-det">
          {erro
            ? "Não consegui falar com o servidor e não há leitura salva nesta TV. Tento de novo sozinho no próximo ciclo."
            : "Buscando os números do dia."}
        </div>
      </div>
    </div>
  );
}
