"use client";

// O gerenciador de feriados do ano: a lista fundida (piso, fonte externa,
// Ponto, manual) com a origem de cada um, o botão de atualizar pela fonte e
// o cadastro manual. Só quem tem `rh:calendario_feriados` chega aqui.

import { useMemo, useState } from "react";
import { GlassDate, GlassSelect } from "../../GlassPicker";
import { Acoes, Botao, BotaoApagar, Campo, Campos, PainelLateral, useAcao } from "../../ui/controles";
import { toast } from "../../Toast";
import { Icon } from "../../Icon";
import { Etiqueta } from "../../financeiro/blocos";
import { NotaRodape } from "../../financeiro/ui";
import { dataBR } from "@/lib/financeiro/calculos";
import { ESFERAS, LABEL_ESFERA, LABEL_ORIGEM, LEGENDA, TIPO_DA_ESFERA, ehFeriado, type Acontecimento, type Esfera, type SyncFeriados } from "@/lib/rh/calendario/tipos";
import { diaComSemana } from "@/lib/rh/calendario/datas";
import type { FeriadoNoPonto } from "@/lib/jornada/feriados-regra";

// ── O que a pessoa escolhe por feriado ───────────────────────────────────────
// Três respostas, e a quarta ("ainda não decidi") é a AUSÊNCIA de decisão, não
// uma opção: um feriado nasce pendente e sai da pendência escolhendo uma destas.
const DECISOES = [
  { value: "folga", label: "Folga da empresa", ajuda: "Ninguém deve jornada. Quem trabalhar faz hora com adicional." },
  { value: "troca", label: "Feriado trocado", ajuda: "A empresa inteira trocou por outro dia. A hora é comum, pra ser gasta na folga." },
  { value: "nao",   label: "Dia normal",      ajuda: "Expediente comum — o feriado não vale aqui." },
] as const;
type Decisao = (typeof DECISOES)[number]["value"];

const decisaoDe = (f: FeriadoNoPonto | undefined): Decisao | "" =>
  !f || f.status === "pendente" ? "" : f.status === "nao_vale" ? "nao" : f.tipo === "troca" ? "troca" : "folga";

/** O selo do que o dia VALE hoje. Não é o mesmo que `SELO_STATUS_PONTO`: lá
 *  "vale" cobre folga e troca juntas, e chamar um feriado TROCADO de "folga da
 *  empresa" é dizer o contrário do que ele é — a hora dele não tem adicional,
 *  ela volta como folga noutro dia. */
function seloDaDecisao(d: Decisao | "") {
  if (d === "") return { label: "Decidir", cor: "var(--atencao)", icone: "help-circle" };
  if (d === "nao") return { label: "Dia normal", cor: "var(--texto-3)", icone: "circle-minus" };
  if (d === "troca") return { label: "Feriado trocado", cor: "var(--cat-8)", icone: "arrows-exchange" };
  return { label: "Folga da empresa", cor: "var(--ok)", icone: "circle-check" };
}

export function GerenciarFeriados({ ano, feriados, sync, onFechar, aoMudar, noPonto = [], podeDecidir = false }: {
  ano: number;
  feriados: Acontecimento[];
  sync: SyncFeriados | null;
  onFechar: () => void;
  /** Depois de qualquer escrita: o pai recarrega do servidor. */
  aoMudar: () => void;
  /** Cada feriado do ano com o status dele NO PONTO. */
  noPonto?: FeriadoNoPonto[];
  podeDecidir?: boolean;
}) {
  const [novo, setNovo] = useState<{ dia: string; nome: string; esfera: Esfera }>({ dia: `${ano}-01-01`, nome: "", esfera: "municipal" });
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [mostrarForm, setMostrarForm] = useState(false);

  const lista = useMemo(() => feriados.filter((f) => ehFeriado(f.tipo)), [feriados]);
  // A decisão é por DIA+NOME, que é como `rh_calendario_feriados` já se
  // identifica (o `unique (dia, nome)` da tabela). Dois feriados no mesmo dia —
  // acontece com estadual + municipal — continuam sendo duas linhas.
  const statusPorChave = useMemo(
    () => new Map(noPonto.map((f) => [`${f.dia}|${f.nome}`, f])),
    [noPonto],
  );
  const pendentes = useMemo(() => noPonto.filter((f) => f.status === "pendente"), [noPonto]);
  const [salvando, setSalvando] = useState<string | null>(null);

  const decidir = async (dia: string, d: Decisao) => {
    setSalvando(dia);
    const r = await fetch("/api/rh/calendario/feriados-ponto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dia, vale: d !== "nao", tipo: d === "troca" ? "troca" : "folga" }),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    setSalvando(null);
    if (!r.ok) { toast(j.erro ?? "Não foi possível salvar a decisão.", "erro"); return; }
    toast(d === "nao" ? "Marcado como dia normal." : d === "troca" ? "Marcado como feriado trocado." : "Marcado como folga da empresa.");
    aoMudar();
  };

  const sincronizar = useAcao(async () => {
    const r = await fetch("/api/rh/calendario/feriados", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "sincronizar", ano }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; sync?: SyncFeriados; erro?: string };
    if (!r.ok) { toast(j.erro ?? "Não foi possível atualizar.", "erro"); return false; }
    if (!j.ok) { toast("Não foi possível atualizar os feriados. Os últimos dados disponíveis continuam sendo exibidos.", "erro"); aoMudar(); return false; }
    toast("Feriados atualizados pela fonte externa.");
    aoMudar();
    return true;
  });

  const criar = useAcao(async () => {
    setTentativa((n) => n + 1);
    if (!novo.nome.trim()) { setErro("Dê um nome ao feriado."); return false; }
    if (!novo.dia) { setErro("Informe a data."); return false; }
    setErro("");
    const r = await fetch("/api/rh/calendario/feriados", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...novo, nome: novo.nome.trim() }),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) { setErro(j.erro ?? "Não foi possível salvar."); return false; }
    toast("Feriado cadastrado.");
    setNovo((n) => ({ ...n, nome: "" }));
    setMostrarForm(false);
    aoMudar();
    return true;
  });

  const apagar = async (id: string) => {
    const r = await fetch(`/api/rh/calendario/feriados?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) { toast(j.erro ?? "Não foi possível apagar.", "erro"); return; }
    toast("Feriado apagado.");
    aoMudar();
  };

  return (
    <PainelLateral
      titulo={`Feriados de ${ano}`}
      subtitulo="Brasil → São Paulo → Cerqueira César"
      onFechar={onFechar}
      largura={520}
      acoes={<Botao icone="refresh" tamanho="sm" estado={sincronizar.estado} onClick={() => sincronizar.rodar()}>Atualizar</Botao>}
      rodape={
        <Acoes>
          <Botao onClick={onFechar}>Fechar</Botao>
          {!mostrarForm && <Botao variante="primario" icone="plus" onClick={() => setMostrarForm(true)}>Cadastrar feriado</Botao>}
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <NotaRodape icone={sync?.ok ? "circle-check" : "info-circle"} destaque={sync ? !sync.ok : false}>
          {sync?.ok
            ? `Nacionais atualizados pela fonte externa em ${dataBR(sync.atualizado_em!.slice(0, 10))}. Estaduais e municipais vêm do sistema e do cadastro manual.`
            : sync && !sync.ok
              ? `Não foi possível atualizar os feriados${sync.erro ? ` (${sync.erro})` : ""}. Os últimos dados disponíveis continuam sendo exibidos.`
              : "Ainda sem sincronização com a fonte externa: os feriados mostrados são os calculados pelo sistema e os cadastrados à mão."}
        </NotaRodape>

        {podeDecidir && pendentes.length > 0 && (
          <NotaRodape icone="help-circle" destaque>
            {pendentes.length === 1
              ? "1 feriado espera a sua decisão: ele ainda NÃO conta como folga no Ponto."
              : `${pendentes.length} feriados esperam a sua decisão: eles ainda NÃO contam como folga no Ponto.`}
            {" "}Nacional entra sozinho; estadual, municipal e ponto facultativo (Carnaval, Corpus Christi) são decisão da empresa.
          </NotaRodape>
        )}

        {mostrarForm && (
          <section style={{ display: "grid", gap: 10, padding: 14, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <strong style={{ fontSize: 13.5 }}>Novo feriado</strong>
            {erro && <p role="alert" style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }}>{erro}</p>}
            <Campos min={160}>
              <Campo label="Nome" largo erro={erro && !novo.nome.trim() ? erro : undefined} sinal={tentativa}>
                {(id) => <input id={id} value={novo.nome} autoFocus onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} placeholder="Ex.: Dia do Padroeiro" />}
              </Campo>
              <Campo label="Data">
                {/* A faixa é o ANO aberto: o gerenciador mostra os feriados
                    de um ano só, e um feriado cadastrado em dezembro do ano
                    seguinte sumiria da lista no instante em que fosse salvo. */}
                {(id) => (
                  <GlassDate id={id} value={novo.dia} onChange={(v) => setNovo((n) => ({ ...n, dia: v }))}
                    clearable={false} placeholder="Escolher data"
                    min={`${ano}-01-01`} max={`${ano}-12-31`} />
                )}
              </Campo>
              <Campo label="Esfera">
                {(id) => (
                  <GlassSelect id={id} value={novo.esfera} onChange={(v) => setNovo((n) => ({ ...n, esfera: v as Esfera }))}
                    options={ESFERAS.map((e) => ({ value: e, label: LABEL_ESFERA[e] }))} />
                )}
              </Campo>
            </Campos>
            <Acoes>
              <Botao onClick={() => { setMostrarForm(false); setErro(""); }}>Cancelar</Botao>
              <Botao variante="primario" icone="check" estado={criar.estado} onClick={() => criar.rodar()}>Salvar</Botao>
            </Acoes>
          </section>
        )}

        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 2 }}>
          {lista.map((f) => {
            const l = LEGENDA[f.tipo];
            const st = statusPorChave.get(`${f.dia}|${f.titulo}`);
            const decisao = st ? decisaoDe(st) : null;
            const selo = decisao === null ? null : seloDaDecisao(decisao);
            return (
              <li key={f.chave} style={{ display: "grid", gap: 8, padding: "8px 2px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)" }}>
                <span aria-hidden style={{ width: 32, height: 32, flex: "none", display: "grid", placeItems: "center", borderRadius: 9, color: l.cor, background: `color-mix(in srgb, ${l.cor} 14%, transparent)` }}>
                  <Icon name={l.icone} size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                  <strong style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.titulo}</strong>
                  <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {diaComSemana(f.dia)} · {LABEL_ORIGEM[f.origem]}
                  </small>
                </span>
                <Etiqueta texto={LABEL_ESFERA[esferaDe(f)].split(" ")[0]} cor={l.cor} />
                {f.origem === "manual" && f.id && <BotaoApagar tamanho="sm" aoConfirmar={() => void apagar(f.id!)} />}
                </div>
                {/* A decisão mora ao lado do feriado, não numa aba separada: a
                    pergunta "esse vale no Ponto?" só faz sentido olhando qual é. */}
                {/* Sem linha em `noPonto` não dá pra saber o que este dia vale:
                    chutar "folga" aqui mostraria Carnaval como folga da empresa
                    justamente onde ele é a decisão pendente mais comum. */}
                {selo && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 42 }}>
                  <Icon name={selo.icone} size={14} color={selo.cor} />
                  {podeDecidir ? (
                    // UM controle, não um rótulo mais um seletor dizendo a mesma
                    // coisa: o valor escolhido JÁ é o estado do dia.
                    <span style={{ minWidth: "min(100%, 190px)", flex: "1 1 190px" }}>
                      <GlassSelect
                        aria-label={`O que ${f.titulo} vale no Ponto`}
                        value={decisao ?? ""}
                        disabled={salvando === f.dia}
                        onChange={(v) => void decidir(f.dia, v as Decisao)}
                        options={[
                          ...(decisao === "" ? [{ value: "", label: "Decidir…" }] : []),
                          ...DECISOES.map((d) => ({ value: d.value, label: d.label })),
                        ]}
                      />
                    </span>
                  ) : (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: selo.cor }}>{selo.label}</span>
                  )}
                  <small style={{ flexBasis: "100%", fontSize: 11, color: "var(--text-dim)" }}>
                    {DECISOES.find((d) => d.value === decisao)?.ajuda
                      ?? "Ainda não decidido: hoje este dia NÃO conta como folga no Ponto."}
                  </small>
                </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </PainelLateral>
  );
}

function esferaDe(a: Acontecimento): Esfera {
  return (Object.keys(TIPO_DA_ESFERA) as Esfera[]).find((e) => TIPO_DA_ESFERA[e] === a.tipo) ?? "nacional";
}
