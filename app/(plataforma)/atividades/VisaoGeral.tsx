"use client";

// ── Visão geral de Atividades ────────────────────────────────────────────────
//
// Desenhada a partir das referências do dono (11/09/2026):
//   1. o painel — quatro números com a semana anterior do lado, a tabela de
//      "Atividades recentes" (filtro, busca, prazo, status, prioridade, ⋯) e a
//      coluna de apoio: resumo por status (rosca), por prioridade, por equipe;
//   2. a grade de cartões por grupo — os itens do Estoque que o dono ESCOLHE
//      ("Personalizar": produtos, componentes, matérias-primas…). Clicar num
//      item abre o pop-up com as atividades dele e pra quem mandar
//      (LancadorDeAtividade).
//
// Sem poll próprio, de propósito: a tela vem pronta do servidor e relê no
// "Atualizado" do cabeçalho. Um poll aqui seria mais uma aba visível num
// segundo monitor pedindo a lista inteira a cada ciclo — a conta de execução
// que já pausou o projeto (CLAUDE.md, "o tick vazio ainda é cobrado").

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { Avatar } from "../ui/Avatar";
import { MonoRosca } from "../ui/graficos";
import { GlassSelect } from "../GlassPicker";
import { toast } from "../Toast";
import { MenuAcoes, type AcaoDoMenu } from "./MenuAcoes";
import { LancadorDeAtividade } from "./LancadorDeAtividade";
import { EscolherItem } from "./Historico";
import { CriarAtividade } from "./CriarAtividade";
import { PersonalizarItens } from "./PersonalizarItens";
import { GerenciarCategorias } from "./GerenciarCategorias";
import {
  entradasDaVisao, gruposPorHierarquia, resumoDoGrupo, type EntradaDaVisao, type GrupoDaVisao,
} from "@/lib/atividades-lancador";
import {
  abertasPorItem, chaveDoItem, equipeAgora, filtrarRecentes, hojeSP, iconeDaEquipe, iconeDaTarefa, painelDaSemana,
  porPrioridade, porSetor, rotuloDoPrazo, situacaoDoItem, variacao,
  type Disponibilidade, type FiltroRecentes, type ItemDaVisao, type LinhaDeModelo, type PresencaDaEquipe, type SituacaoDoItem,
} from "@/lib/atividades-visao";
import { Bolinha, COR_DISPONIBILIDADE } from "./Bolinha";
import { TempoParaAceitar } from "./TempoParaAceitar";
import {
  PRIORIDADES, ROTULO_PRIORIDADE, prioridadeDe,
  type Atividade, type Colaborador, type Prioridade,
} from "@/lib/atividades-catalog";

export type PedidoAoQuadro = { busca?: string };
export type PedidoDeNova = { categoria?: string; tarefa?: string };

// Cor de ESTADO vem da paleta semântica (não muda com o destaque da pessoa);
// cor de GRÁFICO vem da rampa da pessoa (--graf-*), em tons do mesmo matiz.
const TOM = { ok: "var(--ok)", atencao: "var(--atencao)", perigo: "var(--perigo)", marca: "var(--primary-texto)", neutro: "var(--text-dim)" };
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  concluida: { rotulo: "Concluída", cor: TOM.ok },
  em_andamento: { rotulo: "Em andamento", cor: TOM.marca },
  pendente: { rotulo: "Pendente", cor: TOM.neutro },
};
const COR_PRIORIDADE: Record<Prioridade, string> = { alta: TOM.perigo, media: TOM.atencao, baixa: TOM.marca };
// Três degraus do MESMO matiz (a rampa --graf-2/3 muda de cor, e a referência
// é roxo forte → médio → claro). Misturar com o fundo clareia no tema claro e
// escurece no escuro — 35% é o piso que ainda se separa do cartão nos dois.
const TOM_GRAFICO = ["var(--graf-1)", "color-mix(in srgb, var(--graf-1) 65%, var(--bg))", "color-mix(in srgb, var(--graf-1) 35%, var(--bg))"];
const FILTROS: { valor: FiltroRecentes; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" }, { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "concluida", rotulo: "Concluídas" }, { valor: "pendente", rotulo: "Pendentes" },
];
const N_RECENTES = 6;
const POR_FILEIRA = 4;
// Tarefa · Responsável · Prazo · Status · Prioridade · ⋯ — no celular a
// `.tab-linha` troca isto por um cartão de duas colunas com rótulo.
const COLUNAS = "minmax(0, 2.3fr) minmax(0, 1.6fr) minmax(0, 1.15fr) minmax(0, 1.1fr) minmax(0, 0.9fr) 36px";

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const cartao: CSSProperties = { borderRadius: "var(--r-md)", padding: 20, minWidth: 0 };
const tile = (cor: string, lado: number): CSSProperties => ({
  flex: "none", width: lado, height: lado, display: "grid", placeItems: "center",
  borderRadius: lado >= 40 ? "var(--r-sm)" : "var(--r-xs)",
  background: `color-mix(in srgb, ${cor} 13%, transparent)`,
});
const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");

export function VisaoGeral({
  lista: inicial, colaboradores, modelos, itens, podeAtribuir, podeConfigurar = false, personalizado = false, grupos = [],
  configPronta = true, presenca = null, onAbrirQuadro,
}: {
  lista: Atividade[];
  colaboradores: Colaborador[];
  modelos: LinhaDeModelo[];
  itens: ItemDaVisao[];
  podeAtribuir: boolean;
  podeConfigurar?: boolean;
  personalizado?: boolean;
  /** Categorias criadas à mão ("Almofada" com os tamanhos dentro). */
  grupos?: GrupoDaVisao[];
  /** Falso quando o SQL da escolha/grupos ainda não rodou — a seção avisa. */
  configPronta?: boolean;
  /** Quem o ponto diz que está na empresa agora (bolinhas da "Equipe agora"). */
  presenca?: PresencaDaEquipe | null;
  onAbrirQuadro: (p?: PedidoAoQuadro) => void;
  onNovaAtividade: (p?: PedidoDeNova) => void;
}) {
  // Cópia local só pra a troca de prioridade aparecer na hora (otimista).
  const [lista, setLista] = useState(inicial);
  useEffect(() => { setLista(inicial); }, [inicial]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const agora = useMemo(() => Date.now(), [inicial]);
  const hoje = useMemo(() => hojeSP(agora), [agora]);
  const painel = useMemo(() => painelDaSemana(lista, agora), [lista, agora]);
  const prio = useMemo(() => porPrioridade(lista, agora), [lista, agora]);
  const pessoaPorId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);
  const setorDe = useCallback(
    (a: Atividade) => (a.para_id ? pessoaPorId.get(a.para_id)?.setor : null) || a.setor || null,
    [pessoaPorId],
  );
  const setores = useMemo(() => porSetor(lista, setorDe, agora), [lista, setorDe, agora]);
  const totalSetores = setores.reduce((s, x) => s + x.n, 0);

  const [filtro, setFiltro] = useState<FiltroRecentes>("todas");
  const [busca, setBusca] = useState("");
  // "Nova atividade" abre o escolher item aqui mesmo (antes pulava pro Histórico).
  const [novaN, setNovaN] = useState(0);
  const filtradas = useMemo(() => filtrarRecentes(lista, filtro, busca), [lista, filtro, busca]);

  async function mudarPrioridade(a: Atividade, p: Prioridade) {
    const antes = a.prioridade ?? null;
    const volta = () => setLista((l) => l.map((x) => (x.id === a.id ? { ...x, prioridade: antes } : x)));
    setLista((l) => l.map((x) => (x.id === a.id ? { ...x, prioridade: p } : x)));
    try {
      const r = await fetch("/api/atividades", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, prioridade: p }),
      });
      // `json().catch` + `d.ok`: sessão expirada volta 200 + HTML do login, e
      // isso não pode virar "salvo".
      const d = await r.json().catch(() => ({}) as { ok?: boolean; error?: string });
      if (r.ok && d.ok) return;
      volta();
      toast.erro(d.error === "sem_coluna_prioridade"
        ? "A prioridade ainda não está ligada no banco — falta rodar o SQL atividades_prioridade."
        : "Não foi possível mudar a prioridade.");
    } catch {
      volta();
      toast.erro("A conexão caiu. Tente de novo.");
    }
  }

  const acoesDaLinha = (a: Atividade): AcaoDoMenu[] => {
    const acoes: AcaoDoMenu[] = [{ rotulo: "Abrir no quadro", icone: "layout-grid", onClick: () => onAbrirQuadro({ busca: a.tarefa }) }];
    if (podeAtribuir && a.status !== "concluida") {
      const atual = prioridadeDe(a);
      PRIORIDADES.forEach((p, i) => acoes.push({
        rotulo: `Prioridade ${ROTULO_PRIORIDADE[p].toLowerCase()}`, icone: "flag", marcado: p === atual, separar: i === 0,
        onClick: () => { if (p !== atual) void mudarPrioridade(a, p); },
      }));
    }
    return acoes;
  };

  const s = painel.agora, antes = painel.antes;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* ── Os quatro números ───────────────────────────────────────────── */}
      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 16 }}>
        <Kpi icone="clipboard-list" cor={TOM.marca} rotulo="Total de atividades" valor={s.total} antes={antes.total} />
        <Kpi icone="checkbox" cor={TOM.ok} rotulo="Concluídas" valor={s.concluidas} antes={antes.concluidas} />
        <Kpi icone="clock" cor={TOM.atencao} rotulo="Em andamento" valor={s.emAndamento} antes={antes.emAndamento} />
        <Kpi icone="alert-triangle" cor={TOM.perigo} rotulo="Pendentes" valor={s.pendentes} antes={antes.pendentes} />
      </div>

      {/* ── Recentes + coluna de apoio ──────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <section className="glass glass-spec" style={{ ...cartao, flex: "999 1 520px", padding: 22 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Atividades recentes</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-dim)" }}>Veja as últimas atividades atribuídas e seu status.</p>
            </div>
            {podeAtribuir && <Botao variante="primario" icone="plus" onClick={() => setNovaN((n) => n + 1)}>Nova atividade</Botao>}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
            <div className="tab-strip" role="group" aria-label="Filtrar por status" style={{ display: "flex", gap: 8, minWidth: 0 }}>
              {FILTROS.map((f) => (
                <Chip key={f.valor} ativo={filtro === f.valor} onClick={() => setFiltro(f.valor)}>{f.rotulo}</Chip>
              ))}
            </div>
            <Busca valor={busca} onMuda={setBusca} placeholder="Buscar atividade..." largura={300} />
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="tab-linha-head" style={{ display: "grid", gridTemplateColumns: COLUNAS, gap: 12, padding: "10px 8px", fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
              <span>Tarefa</span><span>Responsável</span><span>Prazo</span><span>Status</span><span>Prioridade</span><span />
            </div>
            {filtradas.length === 0
              ? <p style={{ margin: "18px 8px", fontSize: 13, color: "var(--text-dim)" }}>{lista.length === 0 ? "Nenhuma atividade ainda." : "Nenhuma atividade com esse filtro."}</p>
              : (
                <div style={{ display: "grid", gap: 0 }}>
                  {filtradas.slice(0, N_RECENTES).map((a) => (
                    <LinhaRecente key={a.id} a={a} hoje={hoje} pessoa={a.para_id ? pessoaPorId.get(a.para_id) : undefined} acoes={acoesDaLinha(a)} />
                  ))}
                </div>
              )}
            {filtradas.length > N_RECENTES && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 12, fontSize: 12.5, color: "var(--text-dim)" }}>
                <span>Mostrando {N_RECENTES} de {filtradas.length}</span>
                <Botao variante="sutil" tamanho="sm" iconeFim="arrow-right" onClick={() => onAbrirQuadro({ busca })}>Ver todas no quadro</Botao>
              </div>
            )}
          </div>
        </section>

        <div style={{ flex: "1 1 330px", display: "grid", gap: 20, minWidth: 0 }}>
          <section className="glass glass-spec" style={cartao}>
            <h3 style={tituloCartao}>Resumo por status</h3>
            {s.total === 0
              ? <p style={vazio}>Nada aberto nem concluído na semana.</p>
              : (
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginTop: 14 }}>
                  <div style={{ flex: "none", width: 136 }}>
                    <MonoRosca tamanho={136} espessura={18} fatias={[
                      { nome: "Concluídas", valor: s.concluidas, cor: TOM_GRAFICO[0] },
                      { nome: "Em andamento", valor: s.emAndamento, cor: TOM_GRAFICO[1] },
                      { nome: "Pendentes", valor: s.pendentes, cor: TOM_GRAFICO[2] },
                    ]} centro={
                      <div style={{ lineHeight: 1.1 }}>
                        <div className="stat" style={{ fontSize: 26, fontWeight: 800 }}>{s.total}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>atividades</div>
                      </div>
                    } />
                  </div>
                  <div style={{ flex: "1 1 150px", display: "grid", gap: 12, minWidth: 0 }}>
                    {([["Concluídas", s.concluidas], ["Em andamento", s.emAndamento], ["Pendentes", s.pendentes]] as const).map(([nome, n], i) => (
                      <div key={nome} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 999, background: TOM_GRAFICO[i], flex: "none" }} />
                        <span style={{ flex: 1, minWidth: 0 }}>{nome}</span>
                        <strong className="stat">{n}</strong>
                        <span style={{ width: 36, textAlign: "right", color: "var(--text-dim)", fontSize: 12 }}>{pct(n, s.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </section>

          <section className="glass glass-spec" style={cartao}>
            <h3 style={tituloCartao}>Por prioridade</h3>
            <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
              {PRIORIDADES.map((p, i) => {
                const total = prio.alta + prio.media + prio.baixa;
                const max = Math.max(1, prio.alta, prio.media, prio.baixa);
                return (
                  <div key={p} style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr) 30px 38px", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span>{ROTULO_PRIORIDADE[p]}</span>
                    <Barra frac={prio[p] / max} cor={TOM_GRAFICO[i]} />
                    <strong className="stat" style={{ textAlign: "right" }}>{prio[p]}</strong>
                    <span style={{ textAlign: "right", color: "var(--text-dim)", fontSize: 12 }}>{pct(prio[p], total)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass glass-spec" style={cartao}>
            <h3 style={tituloCartao}>Atividades por equipe</h3>
            {setores.length === 0
              ? <p style={vazio}>Nada aberto nem feito na semana.</p>
              : (
                <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                  {setores.slice(0, 5).map((x) => (
                    <div key={x.setor} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <span style={tile(TOM.marca, 30)}><Icon name={iconeDaEquipe(x.setor)} size={15} color={TOM.marca} /></span>
                      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 5 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.setor}</span>
                        <Barra frac={x.n / Math.max(1, setores[0].n)} cor="var(--graf-1)" fina />
                      </div>
                      <strong className="stat" style={{ width: 28, textAlign: "right" }}>{x.n}</strong>
                      <span style={{ width: 38, textAlign: "right", color: "var(--text-dim)", fontSize: 12 }}>{pct(x.n, totalSetores)}</span>
                    </div>
                  ))}
                </div>
              )}
          </section>
        </div>
      </div>

      <EquipeAgora colaboradores={colaboradores} lista={lista} presenca={presenca} />

      <TempoParaAceitar lista={lista} colaboradores={colaboradores} agora={agora} />

      <ItensDaVisao novaN={novaN} itens={itens} grupos={grupos} configPronta={configPronta} lista={lista} modelos={modelos} colaboradores={colaboradores}
        personalizado={personalizado} podeAtribuir={podeAtribuir} podeConfigurar={podeConfigurar} onAbrirQuadro={onAbrirQuadro} />
    </div>
  );
}

const tituloCartao: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" };
const vazio: CSSProperties = { margin: "12px 0 0", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 };

function Kpi({ icone, cor, rotulo, valor, antes }: { icone: string; cor: string; rotulo: string; valor: number; antes: number }) {
  const v = variacao(valor, antes);
  const sobe = (v ?? 0) >= 0;
  const corDelta = sobe ? TOM.ok : TOM.perigo;
  return (
    // `wrap` + piso de 120px no texto: no carrossel do celular o cartão tem
    // ~180px e o ícone ao lado espremia o rótulo até quebrar "Concluídas" no
    // meio da palavra. Sem espaço, o ícone sobe e o texto fica com a largura.
    <div className="glass glass-spec" style={{ ...cartao, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <span style={tile(cor, 52)}><Icon name={icone} size={26} color={cor} /></span>
      <div style={{ minWidth: 0, flex: "1 1 120px" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{rotulo}</div>
        <div className="stat" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, marginTop: 6 }}>{valor}</div>
        {v === null
          ? <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginTop: 4 }}>—</div>
          : (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: corDelta, marginTop: 4 }}>
              <Icon name={sobe ? "trending-up" : "trending-down"} size={14} color={corDelta} />
              {sobe ? "+" : ""}{v}%
            </div>
          )}
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 1 }}>
          {v === null ? "sem a semana anterior pra comparar" : "vs. semana anterior"}
        </div>
      </div>
    </div>
  );
}

function Barra({ frac, cor, fina }: { frac: number; cor: string; fina?: boolean }) {
  return (
    <div style={{ height: fina ? 5 : 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", minWidth: 0 }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: cor, borderRadius: 999 }} />
    </div>
  );
}

function Chip({ ativo, onClick, children, contorno }: { ativo: boolean; onClick: () => void; children: ReactNode; contorno?: boolean }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} className="ui-toque"
      style={{
        flex: "none", display: "inline-flex", alignItems: "center", gap: 7, minHeight: 36,
        padding: contorno ? "7px 14px" : "7px 16px", borderRadius: contorno ? "var(--r-sm)" : 999, cursor: "pointer",
        border: `1px solid ${ativo ? "transparent" : contorno ? "var(--border)" : "transparent"}`,
        background: ativo ? "var(--primary-acao, var(--primary))" : contorno ? "var(--bg)" : "var(--surface-2)",
        color: ativo ? "var(--on-primary, #fff)" : "var(--text)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
      }}>
      {children}
    </button>
  );
}

function Busca({ valor, onMuda, placeholder, largura }: { valor: string; onMuda: (v: string) => void; placeholder: string; largura?: number }) {
  return (
    <div style={{ position: "relative", flex: "1 1 220px", maxWidth: largura, minWidth: 0 }}>
      <span style={{ position: "absolute", left: 12, top: 0, bottom: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
        <Icon name="search" size={16} color="var(--text-dim)" />
      </span>
      <input value={valor} onChange={(e) => onMuda(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={{
          width: "100%", boxSizing: "border-box", minHeight: 40, padding: "9px 12px 9px 36px", borderRadius: "var(--r-sm)",
          border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13.5,
        }} />
    </div>
  );
}

function Pilula({ texto, cor, ponto }: { texto: string; cor: string; ponto?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", width: "fit-content",
      fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
      color: cor, background: `color-mix(in srgb, ${cor} 13%, transparent)`,
    }}>
      {ponto && <span style={{ width: 6, height: 6, borderRadius: 999, background: cor, flex: "none" }} />}
      {texto}
    </span>
  );
}

function LinhaRecente({ a, hoje, pessoa, acoes }: { a: Atividade; hoje: string; pessoa?: Colaborador; acoes: AcaoDoMenu[] }) {
  const st = STATUS[a.status] ?? STATUS.pendente;
  const p = prioridadeDe(a);
  const prazo = rotuloDoPrazo(a.prazo, hoje);
  const atrasado = !!prazo?.atrasado && a.status !== "concluida";
  const sub = a.detalhe || a.produto_nome || a.categoria;
  const menu = <MenuAcoes acoes={acoes} titulo={`Ações de ${a.tarefa}`} />;
  return (
    <div className="tab-linha" style={{ display: "grid", gridTemplateColumns: COLUNAS, gap: 12, alignItems: "center", padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
      <div className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span style={tile(TOM.marca, 38)}><Icon name={iconeDaTarefa(a.tarefa)} size={18} color={TOM.marca} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.tarefa}</div>
          <div style={{ fontSize: 12, fontWeight: 400, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
        </div>
        <span className="mob-only">{menu}</span>
      </div>
      <div data-l="Responsável" style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {a.para_id
            ? <Avatar url={pessoa?.fotoUrl} nome={a.para_nome || pessoa?.nome || "?"} size={32} formato="redondo" />
            : <span style={{ ...tile(TOM.neutro, 32), borderRadius: 999 }}><Icon name="users" size={15} color={TOM.neutro} /></span>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.para_id ? (a.para_nome || pessoa?.nome) : "Fila do tablet"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(a.para_id ? pessoa?.departamento || pessoa?.setor : a.setor) || "—"}
            </div>
          </div>
        </div>
      </div>
      {/* A célula fica bloco e o flex vai por dentro: no celular o rótulo
          (`data-l`, via ::before) viraria item do flex e racharia "Praz/o". */}
      <div data-l="Prazo" style={{ minWidth: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: atrasado ? TOM.perigo : prazo ? "var(--text)" : "var(--text-dim)" }}>
          <Icon name="calendar" size={15} color={atrasado ? TOM.perigo : "var(--text-dim)"} style={{ flex: "none" }} />
          <span style={{ whiteSpace: "nowrap" }}>{prazo?.texto ?? "Sem prazo"}</span>
        </span>
      </div>
      <div data-l="Status"><Pilula texto={st.rotulo} cor={st.cor} /></div>
      <div data-l="Prioridade"><Pilula texto={ROTULO_PRIORIDADE[p]} cor={COR_PRIORIDADE[p]} /></div>
      <div className="desk-only" style={{ justifySelf: "end" }}>{menu}</div>
    </div>
  );
}

// ── Equipe agora (bolinhas) ─────────────────────────────────────────────────
// Pedido do dono (12/09/2026): ver num olhar quem está livre, quem está
// fazendo atividade e quem não está na empresa, por grupo. Sem poll próprio:
// o retrato é da abertura da tela, e o "Atualizado" do cabeçalho relê.

const LEGENDA: { estado: Disponibilidade; rotulo: string }[] = [
  { estado: "disponivel", rotulo: "Disponível" },
  { estado: "ocupado", rotulo: "Ocupado" },
  { estado: "ausente", rotulo: "Fora da empresa" },
];

function EquipeAgora({ colaboradores, lista, presenca }: {
  colaboradores: Colaborador[]; lista: Atividade[]; presenca: PresencaDaEquipe | null;
}) {
  const grupos = useMemo(() => equipeAgora(colaboradores, lista, presenca), [colaboradores, lista, presenca]);
  if (grupos.every((g) => g.pessoas.length === 0)) return null;
  const total: Record<Disponibilidade, number> = { disponivel: 0, ocupado: 0, ausente: 0 };
  for (const g of grupos) for (const k of Object.keys(total) as Disponibilidade[]) total[k] += g.contagem[k];
  return (
    <section className="glass glass-spec" style={{ ...cartao, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Equipe agora</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-dim)" }}>Produção, máquinas e logística: quem está livre, quem está fazendo atividade e quem não está na empresa.</p>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
          {LEGENDA.map((l) => (
            <span key={l.estado} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Bolinha estado={l.estado} tamanho={10} />
              {l.rotulo} <strong className="stat" style={{ color: COR_DISPONIBILIDADE[l.estado] }}>{total[l.estado]}</strong>
            </span>
          ))}
        </div>
      </div>
      {/* Três colunas lado a lado; auto-fit com exatamente 3 filhos dá 3 no
          desktop e empilha sozinho no celular. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12, alignItems: "start" }}>
        {grupos.map((g) => (
          <div key={g.grupo} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 12, background: "var(--bg)", display: "grid", gap: 10, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={tile(TOM.marca, 28)}><Icon name={iconeDaEquipe(g.grupo)} size={14} color={TOM.marca} /></span>
              <strong style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.grupo}</strong>
              <span style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>
                {g.contagem.disponivel} {g.contagem.disponivel === 1 ? "livre" : "livres"}
              </span>
            </div>
            {g.pessoas.length === 0 && (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>Ninguém nesta equipe.</p>
            )}
            {g.pessoas.map((p) => {
              const texto = p.estado === "ausente" ? "Fora da empresa"
                : p.estado === "ocupado" ? `Fazendo: ${p.fazendo}` : "Disponível";
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Bolinha estado={p.estado} />
                  <Avatar url={p.fotoUrl} nome={p.nome} size={30} formato="redondo" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
                    <div style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: p.estado === "ocupado" ? "var(--text)" : "var(--text-dim)" }}>
                      {texto}{p.semPonto && p.estado !== "ausente" ? " · sem ponto" : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Itens escolhidos (segunda referência) ───────────────────────────────────

const SITUACAO: Record<SituacaoDoItem, { texto: string; cor: string }> = {
  sem_estoque: { texto: "Sem estoque", cor: TOM.perigo },
  no_minimo: { texto: "No mínimo", cor: TOM.atencao },
  em_estoque: { texto: "Em estoque", cor: TOM.ok },
};
const ICONE_DO_GRUPO: Record<string, string> = {
  produto: "box", componente: "package-import", peca: "tools", mp_processada: "box-multiple", materia_prima: "stack-2",
  insumo_direto: "droplet", insumo_indireto: "droplet-half-2", embalagem: "package", outros: "box",
};
const grade: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 232px), 1fr))", gap: 12 };
const grupoCss: CSSProperties = { ...cartao, padding: 16, display: "grid", gap: 14 };

type Ordem = "nome" | "abertas" | "saldo";
type FiltroSituacao = "todos" | SituacaoDoItem;

/** Os itens de um cartão: o próprio, ou os de dentro da categoria. */
const itensDaEntrada = (e: EntradaDaVisao): ItemDaVisao[] => (e.tipo === "grupo" ? e.itens : [e.item]);
const menorSaldo = (e: EntradaDaVisao) => Math.min(...itensDaEntrada(e).map((i) => i.quantidade));

function ItensDaVisao({ novaN = 0, itens, grupos: categorias, configPronta, lista, modelos, colaboradores, personalizado, podeAtribuir, podeConfigurar, onAbrirQuadro }: {
  itens: ItemDaVisao[]; grupos: GrupoDaVisao[]; configPronta: boolean; lista: Atividade[]; modelos: LinhaDeModelo[]; colaboradores: Colaborador[];
  personalizado: boolean; podeAtribuir: boolean; podeConfigurar: boolean;
  onAbrirQuadro: (p?: PedidoAoQuadro) => void;
  /** Muda a cada "Nova atividade" do topo: abre o escolher item AQUI, sem pular pro Histórico. */
  novaN?: number;
}) {
  const router = useRouter();
  const [escolhendo, setEscolhendo] = useState(false);
  const [criando, setCriando] = useState(false);
  useEffect(() => { if (novaN > 0) setEscolhendo(true); }, [novaN]);
  const [sel, setSel] = useState("todos");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("nome");
  const [situacao, setSituacao] = useState<FiltroSituacao>("todos");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<EntradaDaVisao | null>(null);
  const [personalizando, setPersonalizando] = useState(false);
  const [categorizando, setCategorizando] = useState(false);

  const abertas = useMemo(() => abertasPorItem(lista), [lista]);
  // A categoria soma as abertas dos itens de dentro — o cartão fala do todo.
  const abertasDe = useCallback(
    (e: EntradaDaVisao) => itensDaEntrada(e).reduce((s, i) => s + (abertas.get(chaveDoItem(i.nome)) ?? 0), 0),
    [abertas],
  );
  const entradas = useMemo(() => entradasDaVisao(itens, categorias), [itens, categorias]);
  const grupos = useMemo(() => gruposPorHierarquia(entradas), [entradas]);
  const visiveis = useMemo(() => {
    const q = normal(busca);
    return grupos
      .filter((g) => sel === "todos" || g.chave === sel)
      .map((g) => {
        // Busca e status olham também DENTRO da categoria: procurar "22x22"
        // tem de achar o cartão "Almofada", que é onde o tamanho mora.
        let l = g.itens.filter((e) => {
          const dentro = itensDaEntrada(e);
          return (!q || normal(e.nome).includes(q) || dentro.some((i) => normal(i.nome).includes(q)))
            && (situacao === "todos" || dentro.some((i) => situacaoDoItem(i) === situacao));
        });
        if (ordem === "abertas") l = l.slice().sort((a, b) => abertasDe(b) - abertasDe(a) || a.nome.localeCompare(b.nome, "pt-BR"));
        else if (ordem === "saldo") l = l.slice().sort((a, b) => menorSaldo(a) - menorSaldo(b) || a.nome.localeCompare(b.nome, "pt-BR"));
        return { ...g, itens: l };
      })
      .filter((g) => g.itens.length > 0);
  }, [grupos, sel, busca, ordem, situacao, abertasDe]);

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={tile(TOM.marca, 42)}><Icon name="box" size={22} color={TOM.marca} /></span>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>Produtos e componentes</h2>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-dim)" }}>Clique num item pra ver as atividades dele e mandar pra alguém.</p>
        </div>
        {/* Os nomes são os do dono ("escolher os produtos", "grupos de
            produtos"): "Personalizar" e "Categorias" existiam e ele pediu as
            duas coisas de novo, sem reconhecer que eram estes botões. */}
        {(podeConfigurar || podeAtribuir) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {podeAtribuir && <Botao variante="primario" icone="plus" onClick={() => setEscolhendo(true)}>Nova atividade</Botao>}
            {podeConfigurar && <Botao variante="secundario" icone="checks" onClick={() => setPersonalizando(true)}>Escolher produtos</Botao>}
            {podeConfigurar && <Botao variante="secundario" icone="layout-grid" onClick={() => setCategorizando(true)}>Grupos</Botao>}
          </div>
        )}
      </div>
      {podeConfigurar && !configPronta && (
        <Alerta tom="atencao" role="note">
          Pra salvar a escolha de produtos e os grupos, falta rodar no Supabase o SQL <strong>atividades_itens_da_visao</strong>.
          Até lá a tela mostra os produtos e as matérias-primas processadas.
        </Alerta>
      )}
      {!personalizado && podeConfigurar && configPronta && itens.length > 0 && (
        <p style={{ ...vazio, margin: 0 }}>
          Mostrando os produtos e as matérias-primas processadas. Em <strong>Escolher produtos</strong> você decide quais aparecem; em <strong>Grupos</strong>, junta produtos num cartão só (ex.: Almofada com todos os tamanhos).
        </p>
      )}

      {itens.length === 0
        ? <p style={{ ...vazio, margin: 0 }}>Nenhum item pra mostrar. {podeConfigurar ? "Escolha os itens em Escolher produtos." : ""}</p>
        : (
          <>
            <div className="tab-strip" role="group" aria-label="Filtrar por tipo" style={{ display: "flex", gap: 8, minWidth: 0 }}>
              <Chip contorno ativo={sel === "todos"} onClick={() => setSel("todos")}>
                <Icon name="layout-grid" size={15} /> Todos ({entradas.length})
              </Chip>
              {grupos.map((g) => (
                <Chip key={g.chave} contorno ativo={sel === g.chave} onClick={() => setSel(g.chave)}>
                  <Icon name={ICONE_DO_GRUPO[g.chave] ?? "box"} size={15} /> {g.rotulo} ({g.itens.length})
                </Chip>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Busca valor={busca} onMuda={setBusca} placeholder="Buscar item por nome..." />
              <GlassSelect value={ordem} onChange={(v) => setOrdem(v as Ordem)} style={{ flex: "0 1 220px", minWidth: 0 }}
                options={[{ value: "nome", label: "Ordenar por nome" }, { value: "abertas", label: "Mais atividades abertas" }, { value: "saldo", label: "Menor saldo primeiro" }]} />
              <GlassSelect value={situacao} onChange={(v) => setSituacao(v as FiltroSituacao)} style={{ flex: "0 1 200px", minWidth: 0 }}
                options={[{ value: "todos", label: "Todos os status" }, { value: "sem_estoque", label: "Sem estoque" }, { value: "no_minimo", label: "No mínimo" }, { value: "em_estoque", label: "Em estoque" }]} />
            </div>
            {visiveis.length === 0 && <p style={{ ...vazio, margin: 0 }}>Nenhum item com esse filtro.</p>}
            {visiveis.map((g) => {
              const expandido = expandidos.has(g.chave) || sel === g.chave;
              const mostra = expandido ? g.itens : g.itens.slice(0, POR_FILEIRA);
              return (
                <section key={g.chave} className="glass glass-spec" style={grupoCss}>
                  <CabecalhoGrupo icone={ICONE_DO_GRUPO[g.chave] ?? "box"} titulo={g.rotulo} n={g.itens.length} aberto={expandido}
                    podeAlternar={g.itens.length > POR_FILEIRA && sel !== g.chave}
                    onAlterna={() => setExpandidos((e) => { const n = new Set(e); if (n.has(g.chave)) n.delete(g.chave); else n.add(g.chave); return n; })} />
                  <div style={grade}>
                    {mostra.map((e) => {
                      const n = abertasDe(e);
                      const abertasTxt = n > 0 ? `${n} ${n === 1 ? "atividade aberta" : "atividades abertas"}` : "Nada aberto";
                      if (e.tipo === "grupo") {
                        // A categoria: o pior selo de dentro (e quantos), e o
                        // saldo somado quando todos usam a mesma unidade.
                        const r = resumoDoGrupo(e.itens);
                        const foto = e.itens.find((i) => i.imagem_url)?.imagem_url ?? null;
                        return (
                          <CartaoItem key={e.id} onClick={() => setAberto(e)} rotulo={`Itens de ${e.nome}`}
                            thumb={<Miniatura src={foto} icone="layout-grid" />}
                            titulo={e.nome} destaque={`${e.itens.length} ${e.itens.length === 1 ? "item" : "itens"}`}
                            pilula={r.pior === "em_estoque"
                              ? SITUACAO.em_estoque
                              : { texto: `${r.quantos} ${r.pior === "sem_estoque" ? "sem estoque" : "no mínimo"}`, cor: SITUACAO[r.pior].cor }}
                            rodape={[r.saldo != null ? `Saldo total ${r.saldo}${r.unidade ? ` ${r.unidade}` : ""}` : "Unidades diferentes", abertasTxt]} />
                        );
                      }
                      const i = e.item;
                      return (
                        <CartaoItem key={e.id} onClick={() => setAberto(e)} rotulo={`Atividades de ${i.nome}`}
                          thumb={<Miniatura src={i.imagem_url} icone={ICONE_DO_GRUPO[g.chave] ?? "box"} />}
                          titulo={i.nome} destaque={`Saldo ${i.quantidade}${i.unidade ? ` ${i.unidade}` : ""}`}
                          pilula={SITUACAO[situacaoDoItem(i)]}
                          rodape={[i.qtd_minima > 0 ? `Mín. ${i.qtd_minima}` : "Sem mínimo", abertasTxt]} />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}

      {aberto && (
        // `key`: o pop-up guarda a trilha (Almofada › Almofada 11, Carimbo ›
        // Puxador) de onde nasceu; outro cartão começa do zero.
        <LancadorDeAtividade key={aberto.id}
          item={aberto.tipo === "item" ? aberto.item : undefined}
          grupo={aberto.tipo === "grupo" ? { nome: aberto.nome, itens: aberto.itens } : undefined}
          lista={lista} modelos={modelos} colaboradores={colaboradores}
          podeAtribuir={podeAtribuir} podeConfigurar={podeConfigurar} onFechar={() => setAberto(null)} onAbrirQuadro={onAbrirQuadro} />
      )}
      {escolhendo && (
        <EscolherItem itens={itens} grupos={categorias}
          onCriarDoZero={() => { setEscolhendo(false); setCriando(true); }}
          onFechar={() => setEscolhendo(false)}
          onEscolher={(e) => { setEscolhendo(false); setAberto(e); }} />
      )}
      {criando && <CriarAtividade colaboradores={colaboradores} onFechar={() => setCriando(false)} />}
      {personalizando && <PersonalizarItens onFechar={() => setPersonalizando(false)} onSalvo={() => router.refresh()} />}
      {categorizando && <GerenciarCategorias onFechar={() => setCategorizando(false)} onSalvo={() => router.refresh()} />}
    </section>
  );
}

/** O cartão inteiro é o alvo: abre o pop-up do item. O "⋯" é só a marca do
 *  desenho de referência — as ações moram no pop-up. */
function CartaoItem({ thumb, titulo, destaque, pilula, rodape, onClick, rotulo }: {
  thumb: ReactNode; titulo: string; destaque: ReactNode; pilula: { texto: string; cor: string };
  rodape: string[]; onClick: () => void; rotulo: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo}
      style={{
        border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 14, background: "var(--bg)", color: "var(--text)",
        display: "grid", gap: 12, minWidth: 0, alignContent: "start", textAlign: "left", font: "inherit", cursor: "pointer", width: "100%",
      }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
        {thumb}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 5 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }}>{titulo}</div>
          <div className="stat" style={{ fontSize: 15, fontWeight: 800 }}>{destaque}</div>
          <Pilula texto={pilula.texto} cor={pilula.cor} ponto />
        </div>
        <Icon name="dots" size={18} color="var(--text-dim)" style={{ flex: "none" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", fontSize: 11.5, color: "var(--text-dim)" }}>
        {rodape.map((r, i) => (
          <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <span aria-hidden style={{ width: 1, height: 11, background: "var(--border)" }} />}
            {r}
          </span>
        ))}
      </div>
    </button>
  );
}

function Miniatura({ src, icone }: { src?: string | null; icone: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" style={{ width: 64, height: 64, flex: "none", objectFit: "cover", borderRadius: "var(--r-sm)", background: "var(--surface-2)" }} />
    : <span style={{ ...tile(TOM.marca, 64), background: "color-mix(in srgb, var(--primary) 9%, var(--surface-2))" }}><Icon name={icone} size={28} color={TOM.marca} /></span>;
}

function CabecalhoGrupo({ icone, titulo, n, aberto, onAlterna, podeAlternar }: {
  icone: string; titulo: string; n: number; aberto: boolean; onAlterna: () => void; podeAlternar: boolean;
}) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ ...tile("var(--primary)", 34), background: "var(--primary-acao, var(--primary))" }}><Icon name={icone} size={17} color="var(--on-primary, #fff)" /></span>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, flex: "1 1 auto", minWidth: 0 }}>
        {titulo} <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>({n})</span>
      </h3>
      {podeAlternar && (
        <Botao variante="sutil" tamanho="sm" iconeFim={aberto ? "chevron-up" : "arrow-right"} onClick={onAlterna}>
          {aberto ? "Ver menos" : "Ver todos"}
        </Botao>
      )}
    </header>
  );
}
