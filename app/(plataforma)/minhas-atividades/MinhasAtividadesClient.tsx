"use client";

import { useMemo, useRef, useState } from "react";
import type { Atividade, AtividadeStatus } from "@/lib/atividades-catalog";
import { aparenciaDoEstagio, jaEntrouNoEstoque, nascidaDaAutomacao } from "@/lib/atividades-estagio";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { TarefasPessoais } from "../TarefasPessoais";
import { toast } from "../Toast";

type Filtro = "ativas" | "pendente" | "em_andamento" | "concluida";

// Estado do prazo: atrasado / hoje / futuro.
function prazoInfo(prazo: string | null): { txt: string; cor: string } | null {
  if (!prazo) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(prazo + "T00:00:00");
  const dias = Math.round((d.getTime() - hoje.getTime()) / 86400000);
  const txt = prazo.split("-").reverse().join("/");
  if (dias < 0) return { txt: `Atrasada · ${txt}`, cor: "var(--perigo)" };
  if (dias === 0) return { txt: "Hoje", cor: "var(--atencao)" };
  if (dias === 1) return { txt: "Amanhã", cor: "var(--text-dim)" };
  return { txt, cor: "var(--text-dim)" };
}

export function MinhasAtividadesClient({ initial, pool = [] }: { initial: Atividade[]; pool?: Atividade[] }) {
  const [lista, setLista] = useState<Atividade[]>(initial);
  const [poolLista, setPoolLista] = useState<Atividade[]>(pool);
  const [filtro, setFiltro] = useState<Filtro>("ativas");

  // Pega uma ordem do pool do setor (vira "em andamento" com dono).
  async function pegar(id: string) {
    setPoolLista((p) => p.filter((a) => a.id !== id));   // otimista: some do pool
    let d: { atividade?: Atividade; error?: string } = {};
    try {
      const r = await fetch("/api/atividades/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(d?.error === "ja_foi_pega" || d?.error === "indisponivel" ? "Alguém já pegou essa." : "Não deu pra pegar."); return; }
    } catch { toast.erro("Sem conexão."); return; }
    if (d.atividade) { setLista((p) => [d.atividade as Atividade, ...p]); toast.ok("Ordem sua! Bora."); }
  }

  // ── Gravação que diz a verdade ────────────────────────────────────────────
  // A tela não tem poll: se o PATCH é recusado e a tela não volta, a mudança
  // fica "valendo" só neste navegador. Toda escrita olha a resposta e, se
  // falhou, volta pro último valor que o SERVIDOR confirmou, com aviso.
  const listaRef = useRef(lista);
  listaRef.current = lista;
  const confirmadoRef = useRef(new Map<string, { quantidade_feita: number; status: AtividadeStatus }>(
    initial.map((a) => [a.id, { quantidade_feita: a.quantidade_feita || 0, status: a.status }]),
  ));
  const emVooRef = useRef(new Set<string>());
  const proximoRef = useRef(new Map<string, Record<string, unknown>>());

  const patch = (corpo: Record<string, unknown>) =>
    fetch("/api/atividades", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      .then((r) => r.ok, () => false);

  function voltar(id: string) {
    const c = confirmadoRef.current.get(id);
    if (!c) return;
    setLista((p) => p.map((a) => (a.id === id ? { ...a, ...c } : a)));
  }

  function lembrar(id: string) {
    const a = listaRef.current.find((x) => x.id === id);
    if (a && !confirmadoRef.current.has(id)) confirmadoRef.current.set(id, { quantidade_feita: a.quantidade_feita || 0, status: a.status });
  }

  async function mudar(id: string, status: AtividadeStatus) {
    lembrar(id);
    setLista((p) => p.map((a) => (a.id === id ? { ...a, status } : a)));
    if (!(await patch({ id, status }))) {
      voltar(id);
      toast.erro("Não foi possível salvar a mudança. A atividade voltou como estava.");
      return;
    }
    const c = confirmadoRef.current.get(id);
    if (c) confirmadoRef.current.set(id, { ...c, status });
  }

  // "+1 feito" manda o valor ABSOLUTO — então um envio por vez por atividade.
  // Toques que chegam com um envio no ar viram UM próximo envio, com o valor
  // mais novo: nunca o 2 gravando depois do 3.
  async function enviarQtd(id: string, corpo: Record<string, unknown>) {
    if (emVooRef.current.has(id)) { proximoRef.current.set(id, corpo); return; }
    emVooRef.current.add(id);
    let atual: Record<string, unknown> | undefined = corpo;
    while (atual) {
      const ok = await patch(atual);
      if (!ok) {
        proximoRef.current.delete(id);
        voltar(id);
        toast.erro("Não foi possível salvar a quantidade. Voltou para o último valor gravado.");
        break;
      }
      const c = confirmadoRef.current.get(id);
      confirmadoRef.current.set(id, {
        quantidade_feita: Number(atual.quantidade_feita),
        status: (atual.status as AtividadeStatus | undefined) ?? c?.status ?? "em_andamento",
      });
      atual = proximoRef.current.get(id);
      proximoRef.current.delete(id);
    }
    emVooRef.current.delete(id);
  }

  function mudarQtd(id: string, delta: number) {
    lembrar(id);
    const cur = listaRef.current.find((a) => a.id === id);
    if (!cur) return;
    const q = Math.max(0, (cur.quantidade_feita || 0) + delta);
    const status: AtividadeStatus = cur.quantidade_alvo > 0 && q >= cur.quantidade_alvo ? "concluida" : cur.status === "pendente" ? "em_andamento" : cur.status;
    const novo = { ...cur, quantidade_feita: q, status };
    listaRef.current = listaRef.current.map((a) => (a.id === id ? novo : a));
    setLista((p) => p.map((a) => (a.id === id ? novo : a)));
    // O status vai junto só quando mudou: concluir pela contagem é o servidor
    // que decide (como antes), e pendente → em andamento precisa ir.
    void enviarQtd(id, { id, quantidade_feita: q, ...(status !== "concluida" && status !== cur.status ? { status } : {}) });
  }

  const counts = useMemo(() => ({
    ativas: lista.filter((a) => a.status !== "concluida").length,
    pendente: lista.filter((a) => a.status === "pendente").length,
    em_andamento: lista.filter((a) => a.status === "em_andamento").length,
    concluida: lista.filter((a) => a.status === "concluida").length,
  }), [lista]);

  const visiveis = lista.filter((a) => (filtro === "ativas" ? a.status !== "concluida" : a.status === filtro));
  const feitoHoje = counts.concluida;
  const totalDia = lista.length;

  const CHIPS: { k: Filtro; label: string; n: number }[] = [
    { k: "ativas", label: "Ativas", n: counts.ativas },
    { k: "pendente", label: "Pendentes", n: counts.pendente },
    { k: "em_andamento", label: "Em andamento", n: counts.em_andamento },
    { k: "concluida", label: "Concluídas", n: counts.concluida },
  ];

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-head">
        <h1>Minhas atividades</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4 }}>
          <span className="desk-only">Suas tarefas — inicie, avance e conclua. </span>
          {totalDia > 0 && <strong style={{ color: "var(--text)" }}>{feitoHoje}/{totalDia} concluídas.</strong>}
        </p>
      </div>

      {/* Pool do setor — ordens disponíveis pra pegar */}
      {poolLista.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Icon name="inbox" size={17} color="var(--primary-texto)" />
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Disponíveis no seu setor</h2>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: "1px 8px", borderRadius: 8, background: "var(--surface-2)", color: "var(--text-dim)" }}>{poolLista.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {poolLista.map((a) => (
              <div key={a.id} className="glass" style={{ padding: 14, borderRadius: 16, borderLeft: "3px solid var(--primary)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)" }}>{a.categoria}</span>
                    {a.quantidade_alvo > 1 && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))", background: "color-mix(in srgb, var(--primary) 12%, transparent)", padding: "1px 8px", borderRadius: 999 }}>{a.quantidade_alvo}x</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, margin: "3px 0 1px" }}>{a.tarefa}</div>
                  {a.detalhe && <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{a.detalhe}</div>}
                </div>
                <Botao variante="primario" onClick={() => pegar(a.id)} style={{ flex: "1 0 120px" }}>Pegar</Botao>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="tab-strip" style={{ gap: 8, marginTop: 16, padding: 0 }}>
        {CHIPS.map((c) => (
          <button key={c.k} onClick={() => setFiltro(c.k)} className="tap-m" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "7px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: "1px solid var(--border)", boxShadow: "none",
            color: filtro === c.k ? "var(--on-primary, #fff)" : "var(--text-dim)", background: filtro === c.k ? "var(--primary-acao, var(--primary))" : "var(--surface)",
          }}>
            {c.label}
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: filtro === c.k ? "rgba(255,255,255,.22)" : "var(--surface-2)", color: filtro === c.k ? "#fff" : "var(--text-dim)" }}>{c.n}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        {visiveis.length === 0 && <div className="glass" style={{ padding: 34, borderRadius: 18, textAlign: "center", color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>{filtro === "ativas" ? <><Icon name="confetti" size={16} color="var(--text-dim)" /> Tudo em dia por aqui.</> : "Nada nesse filtro."}</div>}
        {visiveis.map((a) => {
          const pi = prazoInfo(a.prazo);
          const concl = a.status === "concluida";
          const ap = aparenciaDoEstagio(a);
          const noEstoque = jaEntrouNoEstoque(a);
          return (
            <div key={a.id} className="glass glass-spec" style={{ padding: 16, borderRadius: 18, opacity: concl ? 0.78 : 1, borderLeft: `3px solid ${ap.cor}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: ap.cor, textTransform: "uppercase", letterSpacing: ".03em", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name={ap.icone} size={13} color={ap.cor} />{ap.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>· {a.categoria}</span>
                {a.produto_nome && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))", background: "color-mix(in srgb, var(--primary) 12%, transparent)", padding: "2px 8px", borderRadius: 999 }}>{a.produto_nome}</span>}
                {pi && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: pi.cor, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="calendar" size={13} color={pi.cor} /> {pi.txt}</span>}
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 700, margin: "8px 0 2px", letterSpacing: "-0.01em" }}>{a.tarefa}</div>
              {/* Atividade conferida antes da conferência sair (11/09/2026):
                  diz que as peças entraram (por isso "reabrir" some mais
                  abaixo). Fica DEPOIS do nome da tarefa: primeiro o que é,
                  depois em que pé está. */}
              {ap.dica && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
                  <span style={{ flex: "none", lineHeight: 0, marginTop: 2 }}><Icon name={ap.icone} size={13} color="var(--text-dim)" /></span>
                  <span>{ap.dica}</span>
                </div>
              )}
              {/* A instrução da atividade é o texto que a pessoa vai LER e
                  seguir, muitas vezes um parágrafo inteiro. Solto, com a mesma
                  cor e o mesmo peso dos metadados em volta, ele virava um
                  paredão cinza no meio do card. Com a barra na lateral, o
                  respiro e a entrelinha de leitura, vira um bloco citado: dá
                  pra achar onde começa, ler e voltar. */}
              {a.detalhe && <div className="ma-instrucao">{a.detalhe}</div>}
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {/* "Atribuído por Sistema (requisição)" não diz nada a quem
                    está no chão de fábrica. O que ela precisa saber é que
                    ninguém pediu isso na mão: o estoque bateu no mínimo. */}
                {nascidaDaAutomacao(a)
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="robot" size={12} color="var(--text-dim)" /> Reposição automática do estoque</span>
                  : <span>Atribuído por {a.por_nome}</span>}
                {a.tempo_estimado_min != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="hourglass-high" size={12} color="var(--text-dim)" /> {a.tempo_estimado_min}min</span>}
              </div>

              {a.foto_url && // eslint-disable-next-line @next/next/no-img-element
                <img src={a.foto_url} alt="" style={{ maxWidth: 220, borderRadius: 12, display: "block", marginBottom: 10 }} />}

              {a.quantidade_alvo > 1 && (
                <div style={{ marginBottom: concl ? 0 : 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: "var(--text-dim)" }}>Quantidade feita</span>
                    <strong>{a.quantidade_feita} / {a.quantidade_alvo}</strong>
                  </div>
                  <div style={{ height: 7, background: "var(--surface)", borderRadius: 4, overflow: "hidden", marginBottom: concl ? 0 : 8 }}>
                    <div style={{ width: `${Math.min(100, Math.round((a.quantidade_feita / Math.max(1, a.quantidade_alvo)) * 100))}%`, height: "100%", background: ap.cor, borderRadius: 4, transition: "width .3s ease" }} />
                  </div>
                  {!concl && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Acao onClick={() => mudarQtd(a.id, -1)} icone="minus">1</Acao>
                      <Acao onClick={() => mudarQtd(a.id, 1)} cor="var(--primary-texto)" icone="plus">1 feito</Acao>
                    </div>
                  )}
                </div>
              )}

              {!concl && (
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {a.status === "pendente" && <Acao onClick={() => mudar(a.id, "em_andamento")} cor="var(--primary-texto)" icone="player-play">Iniciar</Acao>}
                  {a.status === "em_andamento" && <Acao onClick={() => mudar(a.id, "pendente")} icone="player-pause">Pausar</Acao>}
                  <Acao onClick={() => mudar(a.id, "concluida")} cor="var(--ok)" icone="check">Concluir</Acao>
                </div>
              )}
              {/* "Reabrir" só existe enquanto reabrir ainda é reversível.
                  Depois da conferência as peças JÁ estão no estoque (com
                  etiqueta impressa e nota dada), e o botão não desfazia nada
                  disso: quem reabrisse produzia de novo, concluiria de novo, e
                  a atividade nunca mais voltaria pra fila do tablet — porque a
                  fila filtra `estoque_lancado = false`. Peça refeita que nunca
                  entra no estoque, sem aviso em lugar nenhum. */}
              {concl && !noEstoque && <Botao variante="sutil" tamanho="sm" icone="arrow-back-up" onClick={() => mudar(a.id, "pendente")} style={{ marginTop: 8 }}>reabrir</Botao>}
              {concl && noEstoque && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}><Icon name="lock" size={13} color="var(--text-dim)" /> fechada pela conferência</div>}
            </div>
          );
        })}
      </div>

      {/* To-do pessoal (separado das atividades atribuídas) */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 12 }}>Minha lista de tarefas</h2>
        <TarefasPessoais titulo="Tarefas pessoais" />
      </div>
    </div>
  );
}

// Ação da atividade: alvo de 44px (dedo, no chão de fábrica) e ícone Tabler.
function Acao({ children, onClick, cor, icone }: { children: React.ReactNode; onClick: () => void; cor?: string; icone?: string }) {
  // Ação em destaque (Iniciar/+1 feito) é a primária; o resto, secundária.
  return (
    <Botao variante={cor === "var(--primary-texto)" ? "primario" : "secundario"} icone={icone} onClick={onClick} style={{ flex: 1 }}>
      {children}
    </Botao>
  );
}
