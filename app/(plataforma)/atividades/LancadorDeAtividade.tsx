"use client";

// ── Pop-up de um item: as atividades possíveis e pra quem mandar ─────────────
//
// Pedido do dono (11/09/2026): clicou em Carimbo, aparecem as atividades do
// Carimbo e os componentes da ficha técnica (Puxador…). Entrou no Puxador:
// "Cortar peças do puxador" (Máquinas) ou "Montar puxador" (Produção).
// Escolheu uma: o setor dela já vem marcado — dá pra trocar — e aparecem as
// pessoas daquele setor. Embaixo das atividades, "Nova atividade" cria
// uma opção nova pro item (Atividades › Configurar).
//
// Categoria criada à mão ("Almofada"): o pop-up abre nos itens dela (os
// tamanhos) e só depois entra nas atividades do escolhido.
//
// Quem aparece em cada setor segue a régua do pool do tablet
// (lib/atividades-lancador.ts › pessoasDoSetor), pra a tela não oferecer quem
// o tablet recusaria.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../Icon";
import { Botao, BotaoIcone, Interruptor, PainelLateral } from "../ui/controles";
import { Avatar } from "../ui/Avatar";
import { GlassSelect } from "../GlassPicker";
import { confirmar, toast } from "../Toast";
import { hierarquiaLabel } from "@/lib/estoque-hierarquia";
import {
  abertasPorItem, chaveDoItem, iconeDaTarefa, situacaoDoItem,
  type ItemDaVisao, type LinhaDeModelo, type SituacaoDoItem,
} from "@/lib/atividades-visao";
import {
  faixaDoSetor, opcoesDoItem, pessoasDoSetor, relacionadasAoItem, setorDoPool, setoresDisponiveis,
  type OpcaoDeAtividade, type OpcaoSalva,
} from "@/lib/atividades-lancador";
import {
  PRIORIDADES, ROTULO_PRIORIDADE, type Atividade, type Colaborador, type Prioridade,
} from "@/lib/atividades-catalog";

type Detalhe = { componentes: ItemDaVisao[]; opcoes: OpcaoSalva[]; semTabela: boolean };
export const POOL = "__pool__";
const norm = (s: string | null | undefined) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const aberta = (a: Atividade) => a.status === "pendente" || a.status === "em_andamento";
const SELO: Record<SituacaoDoItem, { texto: string; cor: string }> = {
  sem_estoque: { texto: "Sem estoque", cor: "var(--perigo)" },
  no_minimo: { texto: "No mínimo", cor: "var(--atencao)" },
  em_estoque: { texto: "Em estoque", cor: "var(--ok)" },
};

/** Cor do setor: faixa da produção pela paleta semântica; outro setor, neutro. */
function corDoSetor(setor: string): string {
  const f = faixaDoSetor(setor);
  return f === "maquinas" ? "var(--info)" : f === "preparo" ? "var(--atencao)" : f === "producao" ? "var(--primary-texto)" : "var(--text-dim)";
}

const linha: CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: "var(--tap)", padding: "10px 12px",
  borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
  textAlign: "left", font: "inherit", cursor: "pointer", minWidth: 0,
};
const tile = (lado: number): CSSProperties => ({
  flex: "none", width: lado, height: lado, display: "grid", placeItems: "center", borderRadius: "var(--r-sm)",
  background: "color-mix(in srgb, var(--primary) 11%, transparent)",
});
const corta: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

export function LancadorDeAtividade({ item, grupo, lista, modelos, colaboradores, podeAtribuir, podeConfigurar, onFechar, onAbrirQuadro }: {
  /** O item clicado. Ausente quando o pop-up abre por uma categoria. */
  item?: ItemDaVisao;
  /** Categoria criada à mão: o pop-up começa escolhendo um dos itens dela. */
  grupo?: { nome: string; itens: ItemDaVisao[] };
  lista: Atividade[];
  modelos: LinhaDeModelo[];
  colaboradores: Colaborador[];
  podeAtribuir: boolean;
  podeConfigurar: boolean;
  onFechar: () => void;
  onAbrirQuadro: (p?: { busca?: string }) => void;
}) {
  const router = useRouter();
  const [trilha, setTrilha] = useState<ItemDaVisao[]>(item ? [item] : []);
  const atual: ItemDaVisao | undefined = trilha[trilha.length - 1];
  const [detalhes, setDetalhes] = useState<Record<string, Detalhe | "carregando" | "erro">>({});
  const det = atual ? detalhes[atual.id] : undefined;
  const carregado = det && typeof det === "object" ? det : null;

  // Componentes e opções salvas de cada nó, uma ida por item (e guardado: voltar
  // na trilha não busca de novo).
  useEffect(() => {
    if (!atual) return;
    const id = atual.id;
    if (detalhes[id] && detalhes[id] !== "erro") return;
    setDetalhes((d) => ({ ...d, [id]: "carregando" }));
    fetch(`/api/atividades/visao?item=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setDetalhes((d) => ({
        ...d, [id]: { componentes: j.componentes ?? [], opcoes: j.opcoes ?? [], semTabela: !!j.semTabelaDeOpcoes },
      })))
      .catch(() => setDetalhes((d) => ({ ...d, [id]: "erro" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.id]);

  const opcoes = useMemo(() => (atual ? opcoesDoItem(atual, carregado?.opcoes ?? [], modelos) : []), [atual, carregado, modelos]);
  const relacionadas = useMemo(
    () => (atual ? relacionadasAoItem(lista, atual.nome, opcoes.map((o) => o.nome)) : []),
    [lista, atual, opcoes],
  );
  const abertasPorTarefa = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of relacionadas) if (aberta(a)) m.set(norm(a.tarefa), (m.get(norm(a.tarefa)) ?? 0) + 1);
    return m;
  }, [relacionadas]);
  const abertasDoItem = useMemo(() => abertasPorItem(lista), [lista]);
  const setores = useMemo(() => setoresDisponiveis(colaboradores), [colaboradores]);
  const setorPadrao = opcoes.find((o) => o.origem === "produzir")?.setor ?? "Produção";

  // ── Passo 2: pra quem mandar ────────────────────────────────────────────
  const [escolhida, setEscolhida] = useState<OpcaoDeAtividade | null>(null);
  const [setor, setSetor] = useState("Produção");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qtd, setQtd] = useState("1");
  // Tempo da atividade em MINUTOS (pedido do dono, 23/09): o que importa na
  // bancada é quanto leva, não o dia. Vira a meta do relógio no tablet.
  const [tempo, setTempo] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [enviando, setEnviando] = useState(false);
  const pessoas = useMemo(() => pessoasDoSetor(colaboradores, setor), [colaboradores, setor]);
  const pessoasSel = [...sel].filter((id) => id !== POOL);

  function escolher(o: OpcaoDeAtividade) {
    setEscolhida(o); setSetor(setores.includes(o.setor) ? o.setor : "Produção");  // setor antigo (Marketing…) não recebe mais setSel(new Set()); setQtd("1"); setTempo(""); setPrioridade("media");
  }
  function trocarSetor(s: string) { setSetor(s); setSel(new Set()); }
  // "Tablet do setor" e pessoas são exclusivos: marcar os dois criava DUAS
  // cópias da mesma atividade (uma na fila, uma dirigida) — visto em 23/09 com
  // "Montar puxador", que caiu duas vezes e teve de ser cancelada à mão.
  function alternar(id: string) {
    setSel((s) => {
      if (s.has(id)) { const n = new Set(s); n.delete(id); return n; }
      if (id === POOL) return new Set([POOL]);
      const n = new Set(s); n.delete(POOL); n.add(id); return n;
    });
  }
  function entrar(c: ItemDaVisao) { setEscolhida(null); setTrilha((t) => [...t, c]); }
  /** `-1` volta pra lista da categoria. */
  function voltarPara(i: number) { setEscolhida(null); setTrilha((t) => t.slice(0, i + 1)); }

  async function enviar() {
    if (!escolhida || sel.size === 0 || !atual) return;
    const faixa = faixaDoSetor(setor);
    const base = {
      // Categoria = o item: é o que liga a atividade a ele (o pop-up e a Visão
      // geral a encontram por aqui) e o que o tablet mostra embaixo da tarefa.
      categoria: atual.nome, tarefa: escolhida.nome, detalhe: null,
      prazo: null, prioridade,
      tempo_estimado_min: Math.round(Number(tempo)) > 0 ? Math.round(Number(tempo)) : null,
      quantidade_alvo: Math.max(1, Math.round(Number(qtd) || 1)),
      // Só o "Produzir X" diz qual item a atividade produz.
      produto_nome: escolhida.produz ? atual.nome : null,
      ...(faixa ? { faixa } : {}),
    };
    const post = (corpo: object) => fetch("/api/atividades", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    });
    const foram: string[] = [];
    let falhou = 0;
    setEnviando(true);
    try {
      if (sel.has(POOL)) {
        const r = await post({ ...base, pool: true, setor: setorDoPool(setor), mesa_alvo: null, confirmar: false });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.atividade) foram.push(`o tablet de ${setor}`); else falhou++;
      }
      for (const id of pessoasSel) {
        const p = colaboradores.find((c) => c.id === id);
        // Sem mesa_alvo: o servidor põe no tablet da Produção (o único que recebe).
        const corpo = { ...base, para_id: id };
        let r = await post({ ...corpo, confirmar: false });
        let d = await r.json().catch(() => ({}));
        if (r.status === 409 && d.error === "nao_presente") {
          const vai = await confirmar(`${d.nome ?? p?.nome ?? "A pessoa"} não bateu ponto hoje. Mandar mesmo assim?`, {
            detalhe: "Cai no tablet como pedido pra aceitar quando ela chegar.",
          });
          if (!vai) continue;
          r = await post({ ...corpo, confirmar: true });
          d = await r.json().catch(() => ({}));
        }
        if (r.ok && d.atividade) foram.push(p?.nome ?? "?"); else falhou++;
      }
    } catch {
      falhou++;
    } finally {
      setEnviando(false);
    }
    if (foram.length) {
      toast.ok(`${escolhida.nome}: enviada pra ${foram.join(", ")}.`);
      setEscolhida(null);
      router.refresh();
    }
    if (falhou) toast.erro(foram.length ? `${falhou} envio(s) não passaram. Confira no quadro.` : "Não foi possível enviar agora.");
  }

  // ── Adicionar atividade (Configurar) ────────────────────────────────────
  const [novo, setNovo] = useState<{ nome: string; setor: string; guardar: boolean } | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const atualizarOpcoes = (f: (o: OpcaoSalva[]) => OpcaoSalva[]) => {
    const id = atual?.id;
    if (!id) return;
    setDetalhes((m) => {
      const x = m[id];
      return x && typeof x === "object" ? { ...m, [id]: { ...x, opcoes: f(x.opcoes) } } : m;
    });
  };
  // Atividade que ainda não existe: escreve o nome e JÁ vai pro envio. Guardar
  // nas atividades do item é opcional (e best-effort): se não der pra guardar
  // — sem o SQL, nome repetido, sem Configurar — ela é mandada igual, avulsa.
  async function salvarNovo() {
    const nome = novo?.nome.trim();
    if (!novo || !nome || !atual) return;
    const seguir = () => {
      const setorOk = setores.includes(novo.setor) ? novo.setor : "Produção";
      setNovo(null);
      escolher({ chave: `nova:${nome}`, nome, setor: setorOk, origem: "salva", produz: false });
    };
    if (!novo.guardar) { seguir(); return; }
    setSalvandoNovo(true);
    try {
      const r = await fetch("/api/atividades/opcoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: atual.id, nome, setor: novo.setor }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.opcao) atualizarOpcoes((o) => [...o, d.opcao as OpcaoSalva]);
      else if (d.error !== "ja_existe") toast(d.error === "sem_tabela"
        ? "Não deu pra guardar na lista (falta o SQL atividades_itens_da_visao). Ela vai só desta vez."
        : "Não deu pra guardar na lista. Ela vai só desta vez.", "atencao");
    } catch { /* manda igual, avulsa */ }
    finally { setSalvandoNovo(false); }
    seguir();
  }
  async function removerOpcao(o: OpcaoDeAtividade) {
    if (!o.id || !atual) return;
    const vai = await confirmar(`Remover "${o.nome}" das atividades de ${atual.nome}?`, {
      detalhe: "Some das opções deste item. O que já foi enviado continua.", perigo: true,
    });
    if (!vai) return;
    const antes = carregado?.opcoes ?? [];
    atualizarOpcoes((l) => l.filter((x) => x.id !== o.id));
    const r = await fetch(`/api/atividades/opcoes?id=${encodeURIComponent(o.id)}`, { method: "DELETE" }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !d.ok) { atualizarOpcoes(() => antes); toast.erro("Não foi possível remover agora."); }
  }

  const crumb = (rotulo: string, onClick?: () => void) => onClick
    ? <button type="button" className="ui-toque" onClick={onClick}
        style={{ border: "none", background: "none", padding: "4px 2px", cursor: "pointer", color: "var(--primary-texto)", fontWeight: 700, font: "inherit" }}>{rotulo}</button>
    : <strong>{rotulo}</strong>;
  const seta = <Icon name="chevron-right" size={13} color="var(--text-dim)" />;
  const trilhaVisivel = (
    <nav aria-label="Caminho" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: 12.5 }}>
      {grupo && crumb(grupo.nome, trilha.length > 0 ? () => voltarPara(-1) : undefined)}
      {trilha.map((t, i) => (
        <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {(i > 0 || grupo) && seta}
          {crumb(t.nome, i < trilha.length - 1 || escolhida ? () => voltarPara(i) : undefined)}
        </span>
      ))}
      {escolhida && <>{seta}<strong>{escolhida.nome}</strong></>}
    </nav>
  );
  const temCaminho = !!grupo || trilha.length > 1 || !!escolhida;

  return (
    <PainelLateral centrado largura={640} onFechar={onFechar}
      titulo={escolhida ? escolhida.nome : atual ? atual.nome : grupo?.nome ?? ""}
      subtitulo={temCaminho && (atual || escolhida)
        ? trilhaVisivel
        : atual ? `${hierarquiaLabel(atual.hierarquia)} · saldo ${atual.quantidade}${atual.unidade ? ` ${atual.unidade}` : ""}` : "Escolha um item da categoria."}
      rodape={escolhida ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", width: "100%" }}>
          <Botao variante="sutil" onClick={() => setEscolhida(null)} disabled={enviando}>Voltar</Botao>
          <Botao variante="primario" icone="send" onClick={enviar} carregando={enviando} disabled={sel.size === 0}>
            {sel.size <= 1 ? "Enviar" : `Enviar pra ${sel.size}`}
          </Botao>
        </div>
      ) : undefined}>
      {!atual && grupo ? (
        <Bloco titulo={`Itens (${grupo.itens.length})`} ajuda="Escolha um pra ver as atividades dele.">
          <div style={{ display: "grid", gap: 6 }}>
            {grupo.itens.map((i) => {
              const s = SELO[situacaoDoItem(i)];
              const n = abertasDoItem.get(chaveDoItem(i.nome)) ?? 0;
              return (
                <button key={i.id} type="button" onClick={() => entrar(i)} style={linha}>
                  {i.imagem_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={i.imagem_url} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", objectFit: "cover", flex: "none" }} />
                    : <span style={tile(44)}><Icon name="box" size={20} color="var(--primary-texto)" /></span>}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, ...corta }}>{i.nome}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", ...corta }}>
                      Saldo {i.quantidade}{i.unidade ? ` ${i.unidade}` : ""} · {n ? `${n} ${n === 1 ? "atividade aberta" : "atividades abertas"}` : "nada aberto"}
                    </span>
                  </span>
                  <span style={{ flex: "none", fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: s.cor, background: `color-mix(in srgb, ${s.cor} 13%, transparent)`, whiteSpace: "nowrap" }}>{s.texto}</span>
                  <Icon name="chevron-right" size={16} color="var(--text-dim)" />
                </button>
              );
            })}
          </div>
        </Bloco>
      ) : !atual ? null : escolhida ? (
        <div style={{ display: "grid", gap: 20 }}>
          <Bloco titulo="Setor" ajuda="Já vem com o setor desta atividade. Trocar muda quem aparece embaixo.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {setores.map((s) => <ChipSetor key={s} setor={s} ativo={s === setor} onClick={() => trocarSetor(s)} />)}
            </div>
          </Bloco>
          <Bloco titulo={`Quem faz · ${setor}`} ajuda="Marque uma ou mais pessoas, ou mande pro tablet do setor — quem estiver livre pega.">
            <div style={{ display: "grid", gap: 6 }}>
              <LinhaPessoa marcado={sel.has(POOL)} onClick={() => alternar(POOL)} titulo={`Tablet de ${setor}`}
                sub="Quem estiver livre pega" icone="device-mobile" />
              {pessoas.length === 0
                ? <p style={vazio}>Ninguém de {setor} cadastrado. A especialidade de cada pessoa fica na ficha, em Pessoas.</p>
                : pessoas.map((p) => (
                  <LinhaPessoa key={p.id} marcado={sel.has(p.id)} onClick={() => alternar(p.id)} titulo={p.nome}
                    sub={p.especialidade || p.departamento || p.setor || ""} foto={p.fotoUrl} />
                ))}
            </div>
          </Bloco>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
            <Bloco titulo="Quantidade">
              <input type="number" min={1} inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade"
                style={{ width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }} />
            </Bloco>
            <Bloco titulo="Tempo (minutos)">
              <input type="number" min={1} inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value)}
                placeholder="60" aria-label="Tempo da atividade em minutos"
                style={{ width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }} />
            </Bloco>
            <Bloco titulo="Prioridade">
              <GlassSelect value={prioridade} onChange={(v) => setPrioridade(v as Prioridade)}
                options={PRIORIDADES.map((p) => ({ value: p, label: ROTULO_PRIORIDADE[p] }))} />
            </Bloco>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 22 }}>
          <Bloco titulo={`Atividades${opcoes.length ? ` (${opcoes.length})` : ""}`}
            ajuda={podeAtribuir ? "Escolha uma pra mandar pra alguém." : "Mandar atividade pede Atividades › Atribuir."}>
            {det === "carregando" && <p style={vazio}>Carregando…</p>}
            {det === "erro" && <p style={vazio}>Não deu pra carregar os detalhes deste item. As opções abaixo são as de sempre.</p>}
            <div style={{ display: "grid", gap: 6 }}>
              {opcoes.map((o) => {
                const abertas = abertasPorTarefa.get(norm(o.nome)) ?? 0;
                return (
                  <div key={o.chave} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <button type="button" onClick={() => podeAtribuir && escolher(o)} disabled={!podeAtribuir}
                      style={{ ...linha, cursor: podeAtribuir ? "pointer" : "default" }}>
                      <span style={tile(36)}><Icon name={iconeDaTarefa(o.nome)} size={17} color="var(--primary-texto)" /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {/* Quebra em vez de cortar: no celular o chip do setor comia o nome ("Cortar peças d…"). */}
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflowWrap: "break-word", lineHeight: 1.3 }}>{o.nome}</span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>
                          {o.fase ? `Fase ${o.fase} · ` : ""}{abertas ? `${abertas} ${abertas === 1 ? "aberta" : "abertas"}` : "nada aberto"}
                        </span>
                        {/* Setor embaixo do nome, não do lado: a 320px o chip lateral espremia o nome. */}
                        <span style={{ display: "flex", marginTop: 6 }}><ChipSetor setor={o.setor} /></span>
                      </span>
                      {podeAtribuir && <Icon name="chevron-right" size={16} color="var(--text-dim)" />}
                    </button>
                    {podeConfigurar && o.id && <BotaoIcone icone="trash" titulo={`Remover ${o.nome}`} onClick={() => removerOpcao(o)} />}
                  </div>
                );
              })}
            </div>
            {(podeConfigurar || podeAtribuir) && (novo ? (
              <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: "var(--r-sm)", border: "1px dashed var(--border)" }}>
                <input autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") void salvarNovo(); }}
                  placeholder="Nome da atividade (ex.: Cortar peças do puxador)" aria-label="Nome da atividade"
                  style={{ width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>Setor desta atividade</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {setores.map((s) => <ChipSetor key={s} setor={s} ativo={s === novo.setor} onClick={() => setNovo({ ...novo, setor: s })} />)}
                </div>
                <Interruptor ligado={novo.guardar} onChange={(v) => setNovo({ ...novo, guardar: v })}
                  rotulo={`Guardar nas atividades de ${atual.nome}`} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <Botao variante="sutil" onClick={() => setNovo(null)} disabled={salvandoNovo}>Cancelar</Botao>
                  <Botao variante="primario" iconeFim="arrow-right" onClick={salvarNovo} carregando={salvandoNovo} disabled={!novo.nome.trim()}>Continuar pra mandar</Botao>
                </div>
              </div>
            ) : (
              <Botao variante="secundario" icone="plus" bloco onClick={() => setNovo({ nome: "", setor: setorPadrao, guardar: podeConfigurar })}>
                Nova atividade (que não está na lista)
              </Botao>
            ))}
            {carregado?.semTabela && podeConfigurar && (
              <p style={vazio}>Pra guardar atividades novas, falta rodar o SQL <strong>atividades_itens_da_visao</strong>.</p>
            )}
          </Bloco>

          {carregado && carregado.componentes.length > 0 && (
            <Bloco titulo={`Componentes (${carregado.componentes.length})`} ajuda="Da ficha técnica. Entre num pra ver as atividades dele.">
              <div style={{ display: "grid", gap: 6 }}>
                {carregado.componentes.map((c) => (
                  <button key={c.id} type="button" onClick={() => entrar(c)} style={linha}>
                    {c.imagem_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.imagem_url} alt="" loading="lazy" style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", objectFit: "cover", flex: "none" }} />
                      : <span style={tile(36)}><Icon name="box" size={17} color="var(--primary-texto)" /></span>}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, ...corta }}>{c.nome}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>
                        {hierarquiaLabel(c.hierarquia)} · saldo {c.quantidade}{c.unidade ? ` ${c.unidade}` : ""}
                      </span>
                    </span>
                    <Icon name="chevron-right" size={16} color="var(--text-dim)" />
                  </button>
                ))}
              </div>
            </Bloco>
          )}

          <Bloco titulo={`Em andamento (${relacionadas.filter(aberta).length})`}>
            {relacionadas.filter(aberta).length === 0
              ? <p style={vazio}>Nada aberto de {atual.nome} agora.</p>
              : (
                <div style={{ display: "grid", gap: 6 }}>
                  {relacionadas.filter(aberta).slice(0, 6).map((a) => (
                    <div key={a.id} style={{ ...linha, cursor: "default" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, flex: "none", background: a.status === "em_andamento" ? "var(--primary-texto)" : "var(--atencao)" }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, ...corta }}>{a.tarefa}</span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", ...corta }}>
                          {a.para_id ? a.para_nome : "Fila do tablet"} · {a.status === "em_andamento" ? "em andamento" : "pendente"}
                        </span>
                      </span>
                    </div>
                  ))}
                  <div>
                    <Botao variante="sutil" tamanho="sm" iconeFim="arrow-right" onClick={() => { onFechar(); onAbrirQuadro({ busca: atual.nome }); }}>
                      Ver no quadro
                    </Botao>
                  </div>
                </div>
              )}
          </Bloco>
        </div>
      )}
    </PainelLateral>
  );
}

export const vazio: CSSProperties = { margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 };

export function Bloco({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{titulo}</h3>
        {ajuda && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-dim)" }}>{ajuda}</p>}
      </div>
      {children}
    </section>
  );
}

export function ChipSetor({ setor, ativo, onClick }: { setor: string; ativo?: boolean; onClick?: () => void }) {
  const cor = corDoSetor(setor);
  const estilo: CSSProperties = {
    flex: "none", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    padding: onClick ? "8px 14px" : "4px 10px", borderRadius: 999, font: "inherit",
    color: ativo ? "var(--on-primary, #fff)" : cor,
    background: ativo ? "var(--primary-acao, var(--primary))" : `color-mix(in srgb, ${cor} 12%, transparent)`,
    border: `1px solid ${ativo ? "transparent" : `color-mix(in srgb, ${cor} 30%, transparent)`}`,
  };
  if (!onClick) return <span style={{ ...estilo, fontSize: 11.5 }}>{setor}</span>;
  return (
    <button type="button" aria-pressed={!!ativo} onClick={onClick} className="ui-toque" style={{ ...estilo, cursor: "pointer", minHeight: 36 }}>
      {ativo && <Icon name="check" size={13} color="currentColor" />}{setor}
    </button>
  );
}

export function LinhaPessoa({ marcado, onClick, titulo, sub, foto, icone }: {
  marcado: boolean; onClick: () => void; titulo: string; sub: string; foto?: string | null; icone?: string;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={marcado} onClick={onClick}
      style={{ ...linha, borderColor: marcado ? "var(--primary)" : "var(--border)", background: marcado ? "color-mix(in srgb, var(--primary) 8%, var(--bg))" : "var(--bg)" }}>
      <span aria-hidden style={{
        flex: "none", width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center",
        border: `2px solid ${marcado ? "var(--primary)" : "var(--border)"}`, background: marcado ? "var(--primary-acao, var(--primary))" : "transparent",
      }}>{marcado && <Icon name="check" size={13} color="var(--on-primary, #fff)" />}</span>
      {icone
        ? <span style={{ ...tile(34), borderRadius: 999 }}><Icon name={icone} size={16} color="var(--primary-texto)" /></span>
        : <Avatar url={foto} nome={titulo} size={34} formato="redondo" />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, ...corta }}>{titulo}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", ...corta }}>{sub}</span>}
      </span>
    </button>
  );
}
