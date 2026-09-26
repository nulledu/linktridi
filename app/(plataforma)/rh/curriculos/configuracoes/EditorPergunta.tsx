"use client";

// O editor de UMA pergunta — o mesmo pro formulário geral e pras perguntas
// específicas de vaga. Pop-up centrado (folha no celular), fecha só no X:
// é formulário, e um toque fora não pode jogar fora o que foi digitado.
//
// A condição ("mostrar só se…") só aponta pra pergunta que vem ANTES — é o
// que o formulário consegue avaliar na hora de montar as telas.

import { useState } from "react";
import {
  OPERADORES, SIM_NAO, TIPOS_PERGUNTA, idDePergunta, temOpcoes,
  type Condicao, type Opcao, type OperadorCondicao, type Pergunta, type TipoPergunta,
} from "@/lib/rh/curriculos/formulario";
import { Icon } from "../../../Icon";
import { Acoes, Botao, BotaoIcone, Caixa, Campo, Chips, Interruptor, PainelLateral } from "../../../ui/controles";
import { GlassSelect } from "../../../GlassPicker";

export function PerguntaNova(ids: Set<string>, prefixo = ""): Pergunta {
  let n = 1;
  while (ids.has(`${prefixo}pergunta_${n}`)) n++;
  return { id: `${prefixo}pergunta_${n}`, titulo: "", tipo: "texto", obrigatoria: false, ativa: true };
}

const linha: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", minWidth: 0 };

export function EditorPergunta({ inicial, nova, anteriores, idsEmUso, prefixo = "", aoSalvar, aoApagar, aoFechar }: {
  inicial: Pergunta;
  nova: boolean;
  /** Perguntas que vêm antes desta — as únicas que a condição pode usar. */
  anteriores: Pergunta[];
  /** Ids já usados (a chave nova não pode colidir). */
  idsEmUso: Set<string>;
  /** `v_` nas perguntas de vaga. */
  prefixo?: string;
  aoSalvar: (p: Pergunta) => void;
  aoApagar?: () => void;
  aoFechar: () => void;
}) {
  const [p, setP] = useState<Pergunta>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [sinal, setSinal] = useState(0);
  const set = <K extends keyof Pergunta>(k: K, v: Pergunta[K]) => { setP((a) => ({ ...a, [k]: v })); setErro(null); };
  const fixa = !!p.fixa;

  const trocarTipo = (t: TipoPergunta) => {
    setP((a) => ({
      ...a, tipo: t,
      opcoes: t === "simnao" ? SIM_NAO.map((o) => ({ ...o })) : temOpcoes(t) ? (a.opcoes?.length && a.tipo !== "simnao" ? a.opcoes : [{ valor: "opcao_1", label: "Opção 1" }]) : undefined,
      teto: t === "longo" ? 1000 : t === "texto" ? 160 : undefined,
    }));
  };

  // ── Opções ─────────────────────────────────────────────────────────────────
  const opcoes = p.opcoes ?? [];
  const setOpcao = (i: number, patch: Partial<Opcao>) => set("opcoes", opcoes.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const addOpcao = () => {
    const usados = new Set(opcoes.map((o) => o.valor));
    let n = opcoes.length + 1;
    while (usados.has(`opcao_${n}`)) n++;
    set("opcoes", [...opcoes, { valor: `opcao_${n}`, label: `Opção ${n}` }]);
  };

  // ── Condições ──────────────────────────────────────────────────────────────
  const conds = p.quando ?? [];
  const setCond = (i: number, c: Condicao) => set("quando", conds.map((x, k) => (k === i ? c : x)));
  const addCond = () => {
    const alvo = anteriores.find((q) => temOpcoes(q.tipo)) ?? anteriores[0];
    if (!alvo) return;
    set("quando", [...conds, temOpcoes(alvo.tipo) ? { pergunta: alvo.id, op: "em", valores: [] } : { pergunta: alvo.id, op: "preenchido" }]);
  };

  const salvar = () => {
    const titulo = p.titulo.trim();
    if (!titulo) { setErro("Escreva a pergunta."); setSinal((n) => n + 1); return; }
    if (temOpcoes(p.tipo) && p.tipo !== "simnao" && opcoes.filter((o) => o.label.trim()).length < 2) { setErro("Dê pelo menos duas opções."); setSinal((n) => n + 1); return; }
    const semValor = conds.find((c) => c.op !== "preenchido" && !(c.valores ?? []).length);
    if (semValor) { setErro("Escolha a resposta que faz a pergunta aparecer."); setSinal((n) => n + 1); return; }
    let id = p.id;
    // Pergunta nova ganha a chave a partir do texto (é o que o RH vê no dado cru).
    if (nova) {
      const base = `${prefixo}${idDePergunta(titulo)}`.slice(0, 36);
      id = base;
      let n = 2;
      while (idsEmUso.has(id)) id = `${base}_${n++}`;
    }
    aoSalvar({
      ...p, id, titulo,
      opcoes: temOpcoes(p.tipo) ? opcoes.filter((o) => o.label.trim()).map((o) => ({ ...o, label: o.label.trim(), tag: o.tag?.trim() || undefined, certa: o.certa || undefined })) : undefined,
      quando: conds.length ? conds : undefined,
    });
  };

  const tipos = TIPOS_PERGUNTA.filter((t) => !t.so_sistema || t.valor === p.tipo).filter((t) => !prefixo || t.valor !== "upload");

  return (
    <PainelLateral
      centrado soFechaNoX icone={nova ? "plus" : "edit"} titulo={nova ? "Nova pergunta" : "Editar pergunta"}
      subtitulo={fixa ? "Pergunta do sistema: dá pra mudar o texto, não o tipo nem apagar." : undefined}
      onFechar={aoFechar} largura={620}
      rodape={
        <Acoes>
          {aoApagar && !fixa && <Botao variante="perigo" icone="trash" onClick={aoApagar}>Apagar</Botao>}
          <span style={{ flex: 1 }} />
          <Botao variante="sutil" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" icone="check" onClick={salvar}>{nova ? "Adicionar" : "Aplicar"}</Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Campo label="Pergunta" dica="Um trecho entre *asteriscos* sai em roxo." erro={erro ?? undefined} sinal={sinal}>
          {(id) => <input id={id} value={p.titulo} maxLength={300} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Você possui experiência com Excel?" autoFocus />}
        </Campo>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          <Campo label="Tipo">
            {(id) => (
              <GlassSelect id={id} value={p.tipo} disabled={fixa} onChange={(v) => trocarTipo(v as TipoPergunta)}
                options={tipos.map((t) => ({ value: t.valor, label: t.label }))} />
            )}
          </Campo>
          {(p.tipo === "texto" || p.tipo === "longo" || p.tipo === "numero") && (
            <Campo label="Texto de exemplo">
              {(id) => <input id={id} value={p.placeholder ?? ""} maxLength={160} onChange={(e) => set("placeholder", e.target.value || undefined)} placeholder="Ex.: Assistente administrativo" />}
            </Campo>
          )}
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <Interruptor ligado={p.obrigatoria} onChange={(v) => set("obrigatoria", v)} desativado={fixa && !!p.coluna} rotulo="Obrigatória" dica="Sem resposta, o candidato não avança." />
          <Interruptor ligado={p.ativa} onChange={(v) => set("ativa", v)} desativado={fixa} rotulo="Ativa" dica="Desligada, some do formulário mas fica guardada aqui." />
        </div>

        <Campo label="Texto de ajuda" dica="Aparece embaixo da pergunta, quando ela ocupa a tela sozinha.">
          {(id) => <input id={id} value={p.ajuda ?? ""} maxLength={300} onChange={(e) => set("ajuda", e.target.value || undefined)} placeholder="Opcional" />}
        </Campo>

        {p.tipo === "numero" && (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))" }}>
            <Campo label="Mínimo">{(id) => <input id={id} inputMode="numeric" value={p.min ?? ""} onChange={(e) => set("min", e.target.value === "" ? undefined : Number(e.target.value.replace(/\D/g, "")))} />}</Campo>
            <Campo label="Máximo">{(id) => <input id={id} inputMode="numeric" value={p.max ?? ""} onChange={(e) => set("max", e.target.value === "" ? undefined : Number(e.target.value.replace(/\D/g, "")))} />}</Campo>
          </div>
        )}

        {temOpcoes(p.tipo) && (
          <section style={{ display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Opções</strong>
            <small style={{ color: "var(--text-dim)", marginTop: -4 }}>
              A etiqueta é o que a triagem põe no candidato que escolher a opção (ex.: “Excel”). Marque “Certa” onde houver
              uma resposta esperada: vira acerto na nota do candidato — e o candidato nunca vê qual é.
            </small>
            {opcoes.map((o, i) => (
              <div key={o.valor} style={{ ...linha, flexWrap: "wrap" }}>
                <input aria-label={`Opção ${i + 1}`} value={o.label} disabled={p.tipo === "simnao"} maxLength={160}
                  onChange={(e) => setOpcao(i, { label: e.target.value })} style={{ flex: "2 1 180px", minWidth: 0 }} />
                <input aria-label={`Etiqueta da opção ${i + 1}`} value={o.tag ?? ""} maxLength={40} placeholder="Etiqueta (opcional)"
                  onChange={(e) => setOpcao(i, { tag: e.target.value })} style={{ flex: "1 1 140px", minWidth: 0 }} />
                <Caixa marcado={!!o.certa} rotulo="Certa" titulo={`Opção ${i + 1} é a resposta certa`}
                  onChange={(v) => setOpcao(i, { certa: v || undefined })} />
                {p.tipo !== "simnao" && (
                  <BotaoIcone icone="trash" titulo="Remover opção" variante="sutil" disabled={opcoes.length <= 1}
                    onClick={() => set("opcoes", opcoes.filter((_, k) => k !== i))} />
                )}
              </div>
            ))}
            {p.tipo !== "simnao" && opcoes.length < 30 && (
              <div><Botao variante="sutil" icone="plus" tamanho="sm" onClick={addOpcao}>Adicionar opção</Botao></div>
            )}
          </section>
        )}

        <section style={{ display: "grid", gap: 10, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div style={{ ...linha, justifyContent: "space-between" }}>
            <span style={{ display: "grid" }}>
              <strong style={{ fontSize: 13 }}>Condição</strong>
              <small style={{ color: "var(--text-dim)" }}>{conds.length ? "Aparece só quando TODAS as condições valem." : "Aparece sempre."}</small>
            </span>
            {anteriores.length > 0 && conds.length < 5 && <Botao variante="sutil" icone="plus" tamanho="sm" onClick={addCond}>Condição</Botao>}
          </div>
          {anteriores.length === 0 && <small style={{ color: "var(--text-dim)" }}>Esta é a primeira pergunta: não há resposta anterior pra depender.</small>}
          {conds.map((c, i) => {
            const alvo = anteriores.find((q) => q.id === c.pergunta);
            const comOpcoes = !!alvo && temOpcoes(alvo.tipo);
            const ops = comOpcoes ? OPERADORES : OPERADORES.filter((o) => o.valor === "preenchido");
            return (
              <div key={i} style={{ display: "grid", gap: 8, padding: 12, borderRadius: "var(--r-sm)", background: "var(--surface-2)" }}>
                <div style={{ ...linha, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--text-dim)", flex: "none" }}>Mostrar só se</span>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <GlassSelect aria-label="Pergunta da condição" value={c.pergunta} searchable
                      onChange={(v) => {
                        const q = anteriores.find((x) => x.id === v);
                        setCond(i, q && temOpcoes(q.tipo) ? { pergunta: v, op: "em", valores: [] } : { pergunta: v, op: "preenchido" });
                      }}
                      options={anteriores.map((q) => ({ value: q.id, label: q.titulo.replace(/\*/g, "") }))} />
                  </div>
                  <BotaoIcone icone="x" titulo="Tirar condição" variante="sutil" onClick={() => set("quando", conds.filter((_, k) => k !== i))} />
                </div>
                <div style={{ maxWidth: 260 }}>
                  <GlassSelect aria-label="Operador" value={c.op} onChange={(v) => setCond(i, { ...c, op: v as OperadorCondicao, ...(v === "preenchido" ? { valores: undefined } : { valores: c.valores ?? [] }) })}
                    options={ops.map((o) => ({ value: o.valor, label: o.label }))} />
                </div>
                {comOpcoes && c.op !== "preenchido" && (
                  <Chips<string> rotulo="Respostas que fazem aparecer" valor={c.valores ?? []}
                    onMuda={(v) => setCond(i, { ...c, valores: c.op === "igual" || c.op === "diferente" ? v.slice(-1) : v })}
                    opcoes={(alvo!.opcoes ?? []).map((o) => ({ valor: o.valor, rotulo: o.label }))} />
                )}
              </div>
            );
          })}
        </section>

        {!nova && (
          <small style={{ color: "var(--text-dim)", display: "flex", gap: 6, alignItems: "center" }}>
            <Icon name="key" size={14} /> Chave gravada: <code>{p.id}</code>
          </small>
        )}
      </div>
    </PainelLateral>
  );
}
