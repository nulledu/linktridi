"use client";

// ── Quadro das máquinas ──────────────────────────────────────────────────────
//
// A aba "Máquinas" mostra um cartão por máquina, com a fila dentro. O quadro é
// a mesma fábrica como kanban de verdade: uma RAIA por máquina, três COLUNAS
// de status (Pendente · Em andamento · Concluído), e o cartão andando nos dois
// eixos — de status quando o trabalho anda, de raia quando a peça troca de
// laser. Um gesto só, uma escrita só.
//
// Corte (programação) e trabalho de pessoa (atividade da faixa "maquinas")
// dividem o quadro, que é o que sincroniza os dois: com listas separadas, a
// parede mostrava a máquina livre enquanto a pessoa estava trabalhando nela.
//
// Dois jeitos de mover, e os dois existem porque o quadro é usado nos dois
// lugares: ARRASTAR no desktop, e o botão "Mover" — que abre status e máquinas
// numa folha — no celular e no tablet. Arrasto não é acessível com o dedo numa
// fileira que também rola de lado: o gesto de arrastar e o de rolar são o
// mesmo, e o quadro viraria uma briga.
//
// No celular a grade de 3 colunas não cabe: ali o quadro vira UMA coluna de
// status por vez (as três viram abas) com as raias empilhadas embaixo. Isso é
// estrutura, não estilo — por isso `useIsMobile()` e não media query.
//
// Sem poll: recarrega ao abrir e depois de cada movimento — que é quando algo
// muda por causa DESTA tela (a parede tem o ritmo dela).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Botao, PainelLateral } from "../ui/controles";
import { toast } from "../Toast";
import { useIsMobile } from "../ui/useMediaQuery";
import {
  cartoesDa, combinaComPorte, duracao, filtrarQuadro, FILTRO_VAZIO, hora, resumoDoQuadro,
  SEM_MAQUINA, STATUS_QUADRO,
  type CartaoQuadro, type FiltroQuadro, type Quadro, type RaiaQuadro, type StatusQuadro, type TipoCartao,
} from "@/lib/maquina-quadro";

type Carga =
  | { estado: "carregando" }
  | { estado: "sem-tabela"; frase: string }
  | { estado: "erro" }
  | { estado: "ok"; quadro: Quadro; moveAtividade: boolean };

/** Para onde um cartão vai: raia + coluna. */
export interface Destino { maquinaId: string; status: StatusQuadro }

export function QuadroMaquinas() {
  const [carga, setCarga] = useState<Carga>({ estado: "carregando" });
  const [movendo, setMovendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/maquinas/quadro", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setCarga({ estado: "erro" }); return; }
      if (d.disponivel === false) { setCarga({ estado: "sem-tabela", frase: String(d.detalhe ?? "Rode supabase/maquinas.sql no Supabase.") }); return; }
      setCarga({ estado: "ok", quadro: d.quadro, moveAtividade: d.moveAtividade !== false });
    } catch { setCarga({ estado: "erro" }); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function mover(cartao: CartaoQuadro, de: Destino, para: Destino) {
    if (movendo) return;
    const trocaMaquina = de.maquinaId !== para.maquinaId;
    const trocaStatus = cartao.status !== para.status;
    if (!trocaMaquina && !trocaStatus) return;
    setMovendo(cartao.chave);
    try {
      const r = await fetch("/api/maquinas/quadro", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: cartao.tipo, id: cartao.id,
          ...(trocaMaquina ? { paraMaquinaId: para.maquinaId === SEM_MAQUINA ? null : para.maquinaId } : {}),
          ...(trocaStatus ? { paraStatus: para.status } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(String(d.detalhe ?? "Não deu agora. Tente de novo.")); await carregar(); return; }
      toast.ok(
        trocaStatus
          ? para.status === "andamento" ? "Em andamento." : para.status === "concluida" ? "Feita." : "Voltou pra fila."
          : "Trocou de máquina.",
      );
      await carregar();
    } catch {
      toast.erro("Sem conexão — nada mudou.");
    } finally { setMovendo(null); }
  }

  if (carga.estado === "carregando") return <p style={{ color: "var(--text-dim)" }}>Montando o quadro…</p>;
  if (carga.estado === "sem-tabela") {
    return <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 480 }}>{carga.frase}</p>;
  }
  if (carga.estado === "erro") {
    return (
      <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
        Não deu pra montar o quadro.{" "}
        <button type="button" onClick={() => void carregar()}
          style={{ background: "none", border: "none", color: "var(--primary-texto)", fontWeight: 700, cursor: "pointer", padding: 0, font: "inherit" }}>
          Tentar de novo
        </button>
      </p>
    );
  }

  return (
    <QuadroVisual
      quadro={carga.quadro} moveAtividade={carga.moveAtividade}
      movendo={movendo} onMover={mover} onAtualizar={() => void carregar()}
    />
  );
}

/**
 * O quadro em si, sem banco — é o que o banco de provas
 * (`/dev-quadro-maquinas`) monta com dados de mentira. Separar não é
 * cerimônia: aprovar o desenho de um kanban que só existe depois de
 * `maquinas.sql` + atividades reais custaria criar máquina e programação de
 * verdade a cada ajuste de layout.
 */
export function QuadroVisual({ quadro, moveAtividade, movendo, onMover, onAtualizar }: {
  quadro: Quadro; moveAtividade: boolean; movendo: string | null;
  onMover: (cartao: CartaoQuadro, de: Destino, para: Destino) => void;
  onAtualizar?: () => void;
}) {
  const celular = useIsMobile();
  const [filtro, setFiltro] = useState<FiltroQuadro>(FILTRO_VAZIO);
  const [colunaCelular, setColunaCelular] = useState<StatusQuadro>("pendente");
  const [escolhendo, setEscolhendo] = useState<{ cartao: CartaoQuadro; de: Destino } | null>(null);
  // Onde o cartão arrastado está pairando: é o que acende a célula de destino.
  const [alvo, setAlvo] = useState<string | null>(null);
  const arrastando = useRef<{ cartao: CartaoQuadro; de: Destino } | null>(null);

  const visto = useMemo(() => filtrarQuadro(quadro, filtro), [quadro, filtro]);
  const resumo = useMemo(() => resumoDoQuadro(visto), [visto]);
  const raias = useMemo(() => {
    const todas = [...visto.raias];
    const monte = visto.semMaquina;
    // O monte só aparece quando tem alguma coisa nele — uma raia vazia
    // permanente no fim do quadro só rouba altura.
    if (monte.pendentes.length + monte.andamento.length + monte.concluidas.length > 0) todas.push(monte);
    return todas;
  }, [visto]);

  const portes = useMemo(
    () => Array.from(new Set(quadro.raias.map((r) => r.porte.toUpperCase()))).sort(),
    [quadro.raias],
  );

  // Atividade só é travada pra troca de MÁQUINA (falta a coluna no banco); o
  // status dela muda normalmente. Travar o cartão inteiro esconderia metade do
  // quadro por causa de um `alter table`.
  const podeTrocarMaquina = (c: CartaoQuadro) => c.tipo === "programacao" || moveAtividade;

  function soltar(para: Destino) {
    const d = arrastando.current;
    arrastando.current = null;
    setAlvo(null);
    if (!d) return;
    if (d.de.maquinaId !== para.maquinaId && !podeTrocarMaquina(d.cartao)) {
      toast.erro("Esta atividade ainda não guarda a máquina — rode supabase/maquinas_quadro.sql.");
      return;
    }
    onMover(d.cartao, d.de, para);
  }

  const cel = (maquinaId: string, status: StatusQuadro) => `${maquinaId}|${status}`;

  const props = (raia: RaiaQuadro, status: StatusQuadro) => ({
    cartoes: cartoesDa(raia, status),
    aceso: alvo === cel(raia.maquinaId, status),
    movendo,
    onEntrar: () => setAlvo(cel(raia.maquinaId, status)),
    onSair: () => setAlvo((a) => (a === cel(raia.maquinaId, status) ? null : a)),
    onSoltar: () => soltar({ maquinaId: raia.maquinaId, status }),
    onPegar: (c: CartaoQuadro) => { arrastando.current = { cartao: c, de: { maquinaId: raia.maquinaId, status } }; },
    onLargar: () => { arrastando.current = null; setAlvo(null); },
    onEscolher: (c: CartaoQuadro) => setEscolhendo({ cartao: c, de: { maquinaId: raia.maquinaId, status } }),
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Resumo r={resumo} />

      <Filtros
        filtro={filtro} onMuda={setFiltro} portes={portes}
        onAtualizar={onAtualizar} atualizadoEm={quadro.atualizadoEm}
      />

      {!moveAtividade && (
        <p style={{
          margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)",
          border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px",
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <Icon name="info-circle" size={16} color="var(--atencao)" />
          <span>As atividades ainda não guardam a máquina: elas mudam de status, mas não trocam de raia. Rode <code>supabase/maquinas_quadro.sql</code> no Supabase.</span>
        </p>
      )}

      {celular ? (
        <>
          {/* Três colunas não cabem num celular. Elas viram abas, e o quadro
              mostra uma coluna por vez com as raias empilhadas. */}
          <div className="tab-strip" style={{ display: "flex", gap: 6, overflowX: "auto", padding: 2 }}>
            {STATUS_QUADRO.map((s) => {
              const n = raias.reduce((acc, r) => acc + cartoesDa(r, s.chave).length, 0);
              const ativo = colunaCelular === s.chave;
              return (
                <button key={s.chave} type="button" onClick={() => setColunaCelular(s.chave)}
                  style={{
                    minHeight: "var(--tap)", padding: "0 14px", borderRadius: 12, flex: "none",
                    border: `1px solid ${ativo ? s.cor : "var(--border)"}`,
                    background: ativo ? `color-mix(in srgb, ${s.cor} 16%, transparent)` : "transparent",
                    color: "var(--text)", font: "inherit", fontSize: 13, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                  }}>
                  <Icon name={s.icone} size={15} color={ativo ? s.cor : "var(--text-dim)"} />
                  {s.nome} <span style={{ color: "var(--text-dim)" }}>{n}</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {raias.map((r) => (
              <section key={r.maquinaId} className="glass glass-spec" style={{ borderRadius: 16, padding: 12, display: "grid", gap: 10 }}>
                <CabecaDaRaia r={r} />
                <Celula {...props(r, colunaCelular)} status={colunaCelular} vazio={r.paradaMotivo ? "Máquina parada." : undefined} />
              </section>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {/* O cabeçalho das colunas mora fora das raias: repetir "Pendente ·
              Em andamento · Concluído" em cada máquina tiraria metade da
              altura útil do quadro. */}
          <div style={{ display: "grid", gridTemplateColumns: GRADE, gap: 10, position: "sticky", top: 0, zIndex: 2, background: "var(--bg)", paddingBottom: 2 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: .4, alignSelf: "end", paddingBottom: 6 }}>
              Máquina
            </div>
            {STATUS_QUADRO.map((s) => {
              const n = raias.reduce((acc, r) => acc + cartoesDa(r, s.chave).length, 0);
              return (
                <div key={s.chave} style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 12,
                  background: `color-mix(in srgb, ${s.cor} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${s.cor} 35%, transparent)`,
                }}>
                  <Icon name={s.icone} size={16} color={s.cor} />
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{s.nome}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)" }}>{n}</span>
                </div>
              );
            })}
          </div>

          {raias.length === 0 && (
            <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Nenhuma máquina neste filtro.</p>
          )}

          {raias.map((r) => (
            <div key={r.maquinaId} className="glass glass-spec" style={{ borderRadius: 16, padding: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: GRADE, gap: 10, alignItems: "stretch" }}>
                <CabecaDaRaia r={r} />
                {STATUS_QUADRO.map((s) => (
                  <Celula key={s.chave} {...props(r, s.chave)} status={s.chave}
                    vazio={s.chave === "pendente" && r.paradaMotivo ? "Máquina parada." : undefined} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {escolhendo && (
        <FolhaMover
          cartao={escolhendo.cartao}
          de={escolhendo.de}
          raias={[...visto.raias, visto.semMaquina]}
          podeTrocarMaquina={podeTrocarMaquina(escolhendo.cartao)}
          onFechar={() => setEscolhendo(null)}
          onEscolher={(para) => {
            const e = escolhendo;
            setEscolhendo(null);
            onMover(e.cartao, e.de, para);
          }}
        />
      )}
    </div>
  );
}

// A raia é estreita de propósito: o espaço da tela é das TRÊS colunas, não do
// nome da máquina. `minmax(min(100%, …))` pra não estourar a largura.
const GRADE = "minmax(min(100%, 150px), 170px) repeat(3, minmax(min(100%, 220px), 1fr))";

function Resumo({ r }: { r: ReturnType<typeof resumoDoQuadro> }) {
  const itens = [
    { icone: "hourglass-high", cor: "var(--atencao)", label: "Pendentes", valor: String(r.pendentes) },
    { icone: "player-play", cor: "var(--ok)", label: "Em andamento", valor: String(r.andamento) },
    { icone: "circle-check", cor: "var(--info)", label: "Feitas hoje", valor: String(r.concluidasHoje) },
    { icone: "clock-hour-4", cor: "var(--text)", label: "Fila", valor: duracao(r.minutosPendentes) },
    { icone: "alert-triangle", cor: r.maquinasParadas ? "var(--perigo)" : "var(--text-dim)", label: "Paradas", valor: String(r.maquinasParadas) },
    { icone: "package-import", cor: r.semMaquina ? "var(--atencao)" : "var(--text-dim)", label: "Sem máquina", valor: String(r.semMaquina) },
  ];
  return (
    <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 10 }}>
      {itens.map((i) => (
        <div key={i.label} className="glass glass-spec" style={{ padding: "12px 14px", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>
            <Icon name={i.icone} size={14} color={i.cor} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</span>
          </div>
          <div className="stat" style={{ fontSize: 24, marginTop: 2, color: i.cor }}>{i.valor}</div>
        </div>
      ))}
    </div>
  );
}

function Filtros({ filtro, onMuda, portes, onAtualizar, atualizadoEm }: {
  filtro: FiltroQuadro; onMuda: (f: FiltroQuadro) => void; portes: string[];
  onAtualizar?: () => void; atualizadoEm: string;
}) {
  const pill = (ativo: boolean) => ({
    minHeight: "var(--tap)", padding: "0 12px", borderRadius: 10, flex: "none",
    border: `1px solid ${ativo ? "var(--primary)" : "var(--border)"}`,
    background: ativo ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent",
    color: "var(--text)", font: "inherit" as const, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <label style={{ position: "relative", flex: "1 1 200px", minWidth: 0, display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: 10, display: "flex" }}><Icon name="list-check" size={15} color="var(--text-dim)" /></span>
        <input
          value={filtro.busca} onChange={(e) => onMuda({ ...filtro, busca: e.target.value })}
          placeholder="Buscar pedido, material, pessoa…"
          style={{
            width: "100%", minHeight: "var(--tap)", padding: "0 12px 0 32px", borderRadius: 10,
            border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
            font: "inherit", fontSize: 13,
          }} />
      </label>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: 1 }} className="tab-strip">
        <button type="button" style={pill(filtro.porte === "todos")} onClick={() => onMuda({ ...filtro, porte: "todos" })}>Todos os portes</button>
        {portes.map((p) => (
          <button key={p} type="button" style={pill(filtro.porte === p)} onClick={() => onMuda({ ...filtro, porte: p })}>Porte {p}</button>
        ))}
        <button type="button" style={pill(filtro.tipo === "programacao")}
          onClick={() => onMuda({ ...filtro, tipo: filtro.tipo === "programacao" ? "todos" : "programacao" })}>Só cortes</button>
        <button type="button" style={pill(filtro.tipo === "atividade")}
          onClick={() => onMuda({ ...filtro, tipo: filtro.tipo === "atividade" ? "todos" : "atividade" })}>Só atividades</button>
        <button type="button" style={pill(filtro.soUrgentes)}
          onClick={() => onMuda({ ...filtro, soUrgentes: !filtro.soUrgentes })}>Urgentes</button>
      </div>

      {onAtualizar && (
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{hora(atualizadoEm)}</span>
          <Botao variante="sutil" tamanho="sm" icone="refresh" onClick={onAtualizar}>Atualizar</Botao>
        </span>
      )}
    </div>
  );
}

function CabecaDaRaia({ r }: { r: RaiaQuadro }) {
  const monte = r.maquinaId === SEM_MAQUINA;
  const cor = monte ? "var(--text-dim)"
    : r.paradaMotivo ? "var(--perigo)"
    : r.andamento.length ? "var(--ok)"
    : r.pendentes.length ? "var(--atencao)" : "var(--text-dim)";
  const rotulo = monte ? "Sem lugar"
    : r.paradaMotivo ? "Parada"
    : r.andamento.length ? "Rodando"
    : r.pendentes.length ? "Aguardando" : "Livre";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 6px 8px 8px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, flex: "none" }} />
        <span style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</span>
      </div>
      <div style={{ fontSize: 11, color: cor, fontWeight: 700 }}>{rotulo}</div>
      {!monte && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Porte {r.porte}{r.materiais ? ` · ${r.materiais}` : ""}
          <br />{duracao(r.minutosPendentes)} na fila
          <br />{r.feitasHoje} {r.feitasHoje === 1 ? "feita" : "feitas"} hoje
        </div>
      )}
      {monte && <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>{r.materiais}</div>}
      {r.paradaMotivo && (
        <div style={{ fontSize: 11, color: "var(--perigo)", display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.4 }}>
          <Icon name="alert-triangle" size={13} color="var(--perigo)" />
          <span>{r.paradaMotivo}</span>
        </div>
      )}
    </div>
  );
}

function Celula({ cartoes, status, aceso, movendo, vazio, onEntrar, onSair, onSoltar, onPegar, onLargar, onEscolher }: {
  cartoes: CartaoQuadro[]; status: StatusQuadro; aceso: boolean; movendo: string | null; vazio?: string;
  onEntrar: () => void; onSair: () => void; onSoltar: () => void;
  onPegar: (c: CartaoQuadro) => void; onLargar: () => void; onEscolher: (c: CartaoQuadro) => void;
}) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onEntrar(); }}
      onDragLeave={onSair}
      onDrop={(e) => { e.preventDefault(); onSoltar(); }}
      style={{
        display: "flex", flexDirection: "column", gap: 8, minHeight: 76, padding: 8,
        borderRadius: 12, border: `1px dashed ${aceso ? "var(--primary)" : "var(--border)"}`,
        // Anel por `box-shadow`, nunca `transform`: transform em ancestral cria
        // contexto de empilhamento e derruba popover de dentro.
        boxShadow: aceso ? "0 0 0 2px var(--primary) inset" : undefined,
        background: aceso ? "color-mix(in srgb, var(--primary) 8%, transparent)" : undefined,
      }}
    >
      {cartoes.length === 0 && (
        <p style={{ margin: "auto", fontSize: 11.5, color: "var(--text-dim)", textAlign: "center" }}>
          {vazio ?? (status === "concluida" ? "Nada fechou hoje." : "—")}
        </p>
      )}
      {cartoes.map((c) => (
        <Cartao key={c.chave} c={c} ocupado={movendo === c.chave}
          onPegar={() => onPegar(c)} onLargar={onLargar} onEscolher={() => onEscolher(c)} />
      ))}
    </div>
  );
}

function Cartao({ c, ocupado, onPegar, onLargar, onEscolher }: {
  c: CartaoQuadro; ocupado: boolean;
  onPegar: () => void; onLargar: () => void; onEscolher: () => void;
}) {
  const feito = c.status === "concluida";
  const borda = feito ? "var(--info)" : c.status === "andamento" ? "var(--ok)" : c.urgente ? "var(--perigo)" : "var(--border)";
  return (
    <article
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onPegar(); }}
      onDragEnd={onLargar}
      style={{
        borderRadius: 12, padding: "9px 10px", border: "1px solid var(--border)",
        borderLeft: `3px solid ${borda}`, background: "var(--surface-2)",
        opacity: ocupado ? 0.5 : feito ? 0.78 : 1, cursor: "grab",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <Icon name={c.tipo === "programacao" ? "printer" : "tools"} size={13}
          color={c.tipo === "programacao" ? "var(--indigo)" : "var(--atencao)"} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .3, color: "var(--text-dim)", textTransform: "uppercase" }}>
          {c.tipo === "programacao" ? "Corte" : "Atividade"}
        </span>
        {c.urgente && !feito && (
          <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, color: "var(--perigo)" }}>URGENTE</span>
        )}
        {feito && c.concluidaAt && (
          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--text-dim)" }}>{hora(c.concluidaAt)}</span>
        )}
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, textDecoration: feito ? "line-through" : undefined }}>{c.titulo}</div>
      {c.detalhe && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{c.detalhe}</div>}
      {c.responsavel && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, display: "flex", gap: 4, alignItems: "center" }}>
          <Icon name="user-check" size={12} color="var(--text-dim)" /> {c.responsavel}
        </div>
      )}

      {c.status === "andamento" && (
        // A barra é de RELÓGIO, não de sensor: minutos rodados contra a
        // estimativa. Satura em 99% — quem diz que acabou é o operador.
        <div style={{ marginTop: 7 }}>
          <div style={{ height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${c.progressoPct}%`, background: "var(--ok)" }} />
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 3 }}>
            {/* `duracao(0)` é "sem estimativa", que não quer dizer nada sobre
                tempo DECORRIDO — quem acabou de apertar iniciar lia "sem
                estimativa rodando". */}
            {c.rodandoHaMin ? `${duracao(c.rodandoHaMin)} rodando` : "começou agora"}
            {c.minutos ? ` · estimado ${duracao(c.minutos)}` : ""}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
        {c.status !== "andamento" && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{duracao(c.minutos)}</span>}
        {!c.combina && !feito && (
          <span title="Fora do porte de sempre desta máquina"
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "var(--atencao)" }}>
            <Icon name="alert-triangle" size={12} color="var(--atencao)" /> fora do porte
          </span>
        )}
        <button type="button" onClick={onEscolher} disabled={ocupado}
          style={{
            marginLeft: "auto", minHeight: "var(--tap)", minWidth: "var(--tap)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "0 10px", borderRadius: 10, border: "1px solid var(--border)",
            background: "transparent", color: "var(--text)", font: "inherit",
            fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          }}>
          <Icon name="arrows-exchange" size={13} color="currentColor" /> Mover
        </button>
      </div>
    </article>
  );
}

/**
 * A folha de mover: status em cima, máquina embaixo. É o caminho do celular —
 * e o do desktop quando a pessoa prefere não arrastar. As máquinas que
 * combinam com o cartão vêm primeiro; as outras ficam disponíveis, mas fora do
 * caminho.
 */
function FolhaMover({ cartao, de, raias, podeTrocarMaquina, onFechar, onEscolher }: {
  cartao: CartaoQuadro; de: Destino; raias: RaiaQuadro[]; podeTrocarMaquina: boolean;
  onFechar: () => void; onEscolher: (para: Destino) => void;
}) {
  const material = cartao.tipo === "programacao" ? cartao.detalhe : null;
  const destinos = raias.filter(
    (r) => r.maquinaId !== de.maquinaId && !(r.maquinaId === SEM_MAQUINA && cartao.tipo === "programacao"),
  );
  const combina = destinos.filter((r) => r.maquinaId !== SEM_MAQUINA && combinaComPorte(r.porte, cartao.tipo, material));
  const resto = destinos.filter((r) => !combina.includes(r));

  return (
    <PainelLateral titulo="Mover cartão" subtitulo={cartao.titulo} onFechar={onFechar}>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <Titulo>Status</Titulo>
          <div style={{ display: "grid", gap: 8 }}>
            {STATUS_QUADRO.filter((s) => s.chave !== cartao.status).map((s) => (
              <Linha key={s.chave} icone={s.icone} cor={s.cor} nome={s.nome}
                sub={s.chave === "andamento" ? "marca que começou agora"
                  : s.chave === "concluida" ? "marca como feita" : "volta pra fila"}
                onClick={() => onEscolher({ maquinaId: de.maquinaId, status: s.chave })} />
            ))}
          </div>
        </div>

        {podeTrocarMaquina && combina.length > 0 && (
          <div>
            <Titulo>Máquinas deste tipo de trabalho</Titulo>
            <Maquinas itens={combina} status={cartao.status} onEscolher={onEscolher} />
          </div>
        )}
        {podeTrocarMaquina && resto.length > 0 && (
          <div>
            <Titulo>{combina.length ? "Outras máquinas" : "Máquinas"}</Titulo>
            <Maquinas itens={resto} status={cartao.status} onEscolher={onEscolher} />
          </div>
        )}
        {!podeTrocarMaquina && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Trocar a máquina desta atividade exige rodar <code>supabase/maquinas_quadro.sql</code>.
          </p>
        )}
      </div>
    </PainelLateral>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: .3, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Maquinas({ itens, status, onEscolher }: {
  itens: RaiaQuadro[]; status: StatusQuadro; onEscolher: (d: Destino) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {itens.map((r) => (
        <Linha key={r.maquinaId}
          icone={r.maquinaId === SEM_MAQUINA ? "package-import" : "bolt"} cor="var(--text-dim)"
          nome={r.nome}
          sub={r.maquinaId === SEM_MAQUINA
            ? "tira o cartão da máquina"
            : `${r.pendentes.length + r.andamento.length} na fila · ${duracao(r.minutosPendentes)}`}
          onClick={() => onEscolher({ maquinaId: r.maquinaId, status })} />
      ))}
    </div>
  );
}

function Linha({ icone, cor, nome, sub, onClick }: {
  icone: string; cor: string; nome: string; sub: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      style={{
        minHeight: "var(--tap)", display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)",
        background: "transparent", color: "var(--text)", font: "inherit",
        textAlign: "left", cursor: "pointer", width: "100%",
      }}>
      <Icon name={icone} size={17} color={cor} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{nome}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>{sub}</span>
      </span>
      <Icon name="chevron-right" size={16} color="var(--text-dim)" />
    </button>
  );
}

export type { TipoCartao };
