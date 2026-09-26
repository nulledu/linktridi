"use client";

// ── Aquecimento · Hoje ───────────────────────────────────────────────────────
// A visão PADRÃO da aba, e não o inventário. Aquecimento é rotina diária: a
// pergunta das 9h não é "qual o meu parque de ativos", é "o que eu faço hoje".
//
// Agrupa POR ETAPA, não por ativo. Seis chips no mesmo "dia 7 — 20 conversas"
// é a mesma ação seis vezes: uma linha, seleção múltipla, um clique. Agrupado
// por ativo seriam seis gavetas pra fazer a mesma coisa — que é exatamente o
// motivo de uma planilha ser abandonada depois de duas semanas.

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { Botao } from "../../ui/controles";
import { Pill, PillRitmo, recolher } from "./pecas";
import {
  filaDoDia, emRisco, corStatus, rotuloStatus,
  type Ativo, type Etapa, type ItemFila, type Marco,
} from "@/lib/marketing-aquecimento-const";
import "../../operacao/geral/visao-geral.css";

interface Props {
  ativos: Ativo[];
  etapasPorRoteiro: Map<string, Etapa[]>;
  marcosPorAtivo: Map<string, Marco[]>;
  podeEditar: boolean;
  onMarcar: (itens: { ativoId: string; etapaId: string }[]) => Promise<boolean>;
  onAbrir: (a: Ativo) => void;
}

export function Hoje({ ativos, etapasPorRoteiro, marcosPorAtivo, podeEditar, onMarcar, onAbrir }: Props) {
  const fila = useMemo(() => filaDoDia(ativos, etapasPorRoteiro, marcosPorAtivo),
    [ativos, etapasPorRoteiro, marcosPorAtivo]);
  const riscos = useMemo(() => emRisco(ativos, etapasPorRoteiro, marcosPorAtivo),
    [ativos, etapasPorRoteiro, marcosPorAtivo]);

  const atrasadas = fila.filter((f) => f.atraso > 0);
  const dehoje = fila.filter((f) => f.atraso === 0);

  // Vazio tem TRÊS causas diferentes, e dizer "nada vence hoje" nas três é
  // mentir por omissão: no dia 1 do módulo não há nada a vencer porque não há
  // nada cadastrado, e a pessoa fica esperando uma fila que nunca vai encher.
  // Cada causa aponta o próximo passo real.
  if (!fila.length && !riscos.length) {
    const semAtivo = !ativos.length;
    const semEtapa = !semAtivo && [...etapasPorRoteiro.values()].every((e) => !e.length);
    const conteudo = semAtivo
      ? { icone: "plus", cor: "var(--info)", titulo: "Nenhum ativo cadastrado ainda",
          texto: "Cadastre a primeira BM, conta de anúncio ou número de WhatsApp para começar a acompanhar o aquecimento." }
      : semEtapa
        ? { icone: "list-check", cor: "var(--atencao)", titulo: "Os roteiros ainda estão vazios",
            texto: "A fila do dia sai das etapas do roteiro. Enquanto nenhum roteiro tiver etapas, não há o que cobrar — escreva as etapas na aba Roteiros." }
        : { icone: "circle-check", cor: "var(--ok)", titulo: "Nada vence hoje",
            texto: "Nenhum ativo está atrasado nem em ritmo suspeito." };

    return (
      <div className="ct-sec" style={{
        padding: "38px 22px", textAlign: "center", color: "var(--text-dim)",
      }}>
        <Icon name={conteudo.icone} size={26} color={conteudo.cor} />
        {/* `marginInline: auto` nos DOIS parágrafos. `text-align: center` centra o
            TEXTO DENTRO do bloco — não o bloco. E o projeto limita todo `p` a
            68ch de medida de linha (globals.css:217), então num cartão largo o
            bloco de 68ch nascia colado na esquerda com o texto centrado dentro
            dele: o ícone (que é inline) ficava no meio do cartão e o texto num
            eixo próprio, uns 60px à esquerda. Não é caso de brigar com a medida
            de linha — é de centrar o bloco que ela cria. */}
        <p style={{ margin: "10px auto 0", fontWeight: 600, color: "var(--text)" }}>{conteudo.titulo}</p>
        <p style={{ margin: "3px auto 0", fontSize: 13, maxWidth: 380, lineHeight: 1.5 }}>
          {conteudo.texto}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {atrasadas.length > 0 && (
        <Bloco icone="alert-triangle" cor="var(--atencao)" titulo="Fora do prazo"
          resumo={`${atrasadas.length} ${atrasadas.length === 1 ? "etapa" : "etapas"} · ${contarAlvos(atrasadas)} ${contarAlvos(atrasadas) === 1 ? "ativo" : "ativos"}`}>
          {atrasadas.map((f) => <Tarefa key={f.chave} item={f} podeEditar={podeEditar} onMarcar={onMarcar} />)}
        </Bloco>
      )}

      {dehoje.length > 0 && (
        <Bloco icone="calendar" cor="var(--info)" titulo="Vence hoje"
          resumo={`${dehoje.length} ${dehoje.length === 1 ? "etapa" : "etapas"} · ${contarAlvos(dehoje)} ${contarAlvos(dehoje) === 1 ? "ativo" : "ativos"}`}>
          {dehoje.map((f) => <Tarefa key={f.chave} item={f} podeEditar={podeEditar} onMarcar={onMarcar} />)}
        </Bloco>
      )}

      {riscos.length > 0 && (
        <Bloco icone="bolt" cor="var(--rosa)" titulo="Em risco" resumo="o que costuma virar bloqueio">
          {riscos.map(({ ativo, ritmo }) => (
            <button key={ativo.id} onClick={() => onAbrir(ativo)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
              padding: "13px 16px", minHeight: "var(--tap)", border: 0,
              borderTop: "1px solid var(--border)", background: "transparent",
              color: "var(--text)", font: "inherit", cursor: "pointer",
            }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 580, letterSpacing: "-.006em" }}>{ativo.nome}</span>
                <span style={{ display: "block", color: "var(--text-dim)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                  {ritmo.estado === "apressado"
                    ? `${ritmo.apressadas} ${ritmo.apressadas === 1 ? "etapa cumprida" : "etapas cumpridas"} antes do previsto — ${Math.abs(ritmo.desvio)} dias à frente do roteiro`
                    : `${rotuloStatus(ativo.status)}${ativo.pausadoEm ? ` desde ${curto(ativo.pausadoEm)}` : ""}`}
                </span>
              </span>
              <span style={{ marginLeft: "auto", flex: "0 0 auto" }}>
                {ritmo.estado === "apressado"
                  ? <PillRitmo ritmo={ritmo} />
                  : <Pill cor={corStatus(ativo.status)}>{rotuloStatus(ativo.status)}</Pill>}
              </span>
            </button>
          ))}
        </Bloco>
      )}
    </div>
  );
}

const contarAlvos = (f: ItemFila[]) => f.reduce((n, x) => n + x.alvos.length, 0);
const curto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Bloco({ icone, cor, titulo, resumo, children }: {
  icone: string; cor: string; titulo: string; resumo: string; children: React.ReactNode;
}) {
  return (
    <section className="ct-sec">
      {/* Cabeçalho do cartão da Visão Geral (ladrilho + título + resumo). O
          ladrilho leva a cor do ESTADO (atrasado, hoje, risco). */}
      <header className="ct-sec-cab">
        <span aria-hidden className="og-cartao-icone" style={{ background: `color-mix(in srgb, ${cor} 13%, transparent)` }}>
          <Icon name={icone} size={17} color={cor} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{titulo}</h2>
          <p>{resumo}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

// ── Uma etapa da fila, com os ativos que a devem ─────────────────────────────
function Tarefa({ item, podeEditar, onMarcar }: {
  item: ItemFila;
  podeEditar: boolean;
  onMarcar: (itens: { ativoId: string; etapaId: string }[]) => Promise<boolean>;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const alterna = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const todos = () => setSel((s) =>
    s.size === item.alvos.length ? new Set() : new Set(item.alvos.map((a) => a.ativo.id)));

  // A resposta começa no clique, não na resposta do servidor: os alvos escolhidos
  // saem JUNTOS (uma mola só, sem cascata decorativa) enquanto a requisição voa.
  //
  // Antes isto esperava o `await` — e o `onMarcar` do pai recarrega a lista antes
  // de retornar, então a tarefa já estava DESMONTADA quando o recolhimento ia
  // começar: `caixa.current` vinha nulo e a animação que eu tinha documentado
  // simplesmente nunca acontecia. Otimista é o único jeito de ela existir.
  async function confirmar() {
    if (!sel.size || enviando) return;
    setEnviando(true);
    const escolhidos = item.alvos.filter((a) => sel.has(a.ativo.id));
    const alturaAntes = caixa.current?.offsetHeight ?? 0;
    recolher(caixa.current, () => { /* o pai recarrega e a tarefa sai da fila */ });

    const ok = await onMarcar(escolhidos.map((a) => ({ ativoId: a.ativo.id, etapaId: a.etapaId })));
    if (ok) return;                       // o recarregamento do pai desmonta isto
    // Falhou: devolve o bloco ao tamanho que tinha. Sumir a linha e deixar o
    // trabalho por fazer é a pior das duas mentiras possíveis aqui.
    const el = caixa.current;
    if (el) {
      el.style.height = alturaAntes ? `${alturaAntes}px` : "";
      el.style.opacity = "1";
      el.style.overflow = "";
      el.style.height = "";
    }
    setEnviando(false);
  }

  const marcados = sel.size;

  return (
    <div ref={caixa} style={{ borderTop: "1px solid var(--border)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, letterSpacing: "-.008em" }}>
          <span style={{ color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>D+{item.dia}</span>
          {"  "}{item.titulo}
        </span>
        <span style={{
          marginLeft: "auto", whiteSpace: "nowrap", fontSize: 12.5,
          fontVariantNumeric: "tabular-nums",
          color: item.atraso > 0 ? "var(--atencao)" : "var(--text-dim)",
          fontWeight: item.atraso > 0 ? 640 : 500,
        }}>
          {item.atraso > 0
            ? `venceu ${curto(item.venceEm)} · ${item.atraso} ${item.atraso === 1 ? "dia" : "dias"}`
            : `vence hoje`}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: podeEditar ? 12 : 0 }}>
        {item.alvos.map(({ ativo }) => {
          const on = sel.has(ativo.id);
          return (
            <button key={ativo.id} type="button" aria-pressed={on}
              onClick={() => podeEditar && alterna(ativo.id)}
              disabled={!podeEditar || enviando}
              className="aq-chip"
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, padding: "0 12px",
                borderRadius: 999, fontSize: 13, fontWeight: 540, font: "inherit",
                fontVariantNumeric: "tabular-nums", cursor: podeEditar ? "pointer" : "default",
                color: "var(--text)",
                background: on ? "color-mix(in srgb, var(--ok) 17%, var(--surface-2))" : "var(--surface-2)",
                border: `1px solid ${on ? "color-mix(in srgb, var(--ok) 52%, transparent)" : "var(--border)"}`,
                transition: "background .16s, border-color .16s",
              }}>
              <span style={{
                width: 15, height: 15, borderRadius: "50%", display: "grid", placeItems: "center",
                background: on ? "var(--ok)" : "transparent",
                border: `1.5px solid ${on ? "var(--ok)" : "var(--text-dim)"}`,
                transition: "background .16s, border-color .16s",
              }}>
                {on && <Icon name="check" size={9} color="var(--bg)" />}
              </span>
              {ativo.nome}
              {ativo.aparelho && (
                <span style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{ativo.aparelho}</span>
              )}
            </button>
          );
        })}
      </div>

      {podeEditar && (
        <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
          <Botao variante="primario" tamanho="sm" onClick={confirmar} disabled={!marcados || enviando}>
            {marcados ? `Marcar ${marcados} como feito` : "Marcar como feito"}
          </Botao>
          {item.alvos.length > 1 && (
            <Botao tamanho="sm" onClick={todos} disabled={enviando}>
              {sel.size === item.alvos.length ? "Limpar seleção" : `Selecionar todos (${item.alvos.length})`}
            </Botao>
          )}
        </div>
      )}
    </div>
  );
}
