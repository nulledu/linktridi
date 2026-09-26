"use client";

/**
 * Analytics · widgets e análises salvas.
 *
 * A tela tem duas metades. A de CIMA (resumo + insights) é fixa e igual pra
 * todo mundo — é a manchete, e manchete que cada um configura deixa de ser
 * manchete. A de BAIXO é a grade de widgets: a pessoa escolhe o que olha,
 * em que ordem e com que largura, e guarda combinações como "análises salvas".
 *
 * Onde isso mora: `user_prefs`, chave `analytics.visoes`, pela porta do
 * `lib/prefs-da-conta.ts`. Três motivos pra não ser `localStorage`:
 *
 *   · a visão segue a PESSOA, não o aparelho — quem monta a análise no
 *     computador quer encontrá-la no celular;
 *   · a leitura já é compartilhada (uma ida por carregamento pra TODAS as
 *     telas), então isto não acrescenta nenhuma requisição ao carregar;
 *   · a gravação é debounced e `keepalive`, então arrastar cinco widgets
 *     seguidos é UM PUT, não cinco.
 *
 * E não é tabela nova: `user_prefs` já existe, já é por usuário, já tem teto
 * de 20 KB por chave. Criar `analytics_visoes` seria uma segunda porta pro
 * mesmo armário.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Botao, BotaoIcone } from "../ui/controles";
import { Modal } from "../ui/Modal";
import { Dropdown } from "../ui/Dropdown";
import { Campo } from "../ui/controles";
import { Momento } from "../ui/Momento";
import { Selo } from "../ui/primitives";
import { useReordenavel, porIds } from "../ui/reordenar";
import { toast } from "../Toast";
import { gravarPrefDaConta, lerPrefsDaConta } from "@/lib/prefs-da-conta";
import { Bloco } from "./faixas";
import "./central.css";

export const PREF_ANALYTICS = "analytics.visoes";

export type Largura = "cheia" | "dois-tercos" | "meia" | "terco";

/** Uma peça do catálogo: o que ela responde, e quanto espaço ela merece. */
export interface DefWidget {
  id: string;
  nome: string;
  /** A PERGUNTA que ele responde. O catálogo lista perguntas, não gráficos —
   *  "Linha temporal" não ajuda ninguém a escolher. */
  sub: string;
  icon: string;
  largura: Largura;
  /** Só pode aparecer uma vez na grade (faixas grandes, como o fluxo). */
  unico?: boolean;
}

export interface ItemNaGrade { uid: string; def: string; largura: Largura }

export interface VisaoSalva {
  id: string;
  nome: string;
  categoria: string;
  itens: ItemNaGrade[];
  /** Em que data foi salva — o "Atualizado em" da lista. */
  em: string;
}

interface EstadoAnalytics {
  v: 1;
  /** Grade viva por categoria (operacao, vendas, produtos, trafego). */
  layout: Record<string, ItemNaGrade[]>;
  salvas: VisaoSalva[];
}

const VAZIO: EstadoAnalytics = { v: 1, layout: {}, salvas: [] };

const novoId = () => Math.random().toString(36).slice(2, 9);

/** As quatro larguras, no vocabulário de quem usa ("metade", não "6/12"). */
const LARGURAS: [Largura, string][] = [
  ["cheia", "Largura total"], ["dois-tercos", "Dois terços"], ["meia", "Metade"], ["terco", "Um terço"],
];

/** Só o que o estado precisa ter pra ser aproveitável — pref gravada por uma
 *  versão futura (ou corrompida à mão) não pode deixar a tela em branco. */
function normalizar(bruto: unknown): EstadoAnalytics {
  if (!bruto || typeof bruto !== "object") return VAZIO;
  const o = bruto as Partial<EstadoAnalytics>;
  const layout: Record<string, ItemNaGrade[]> = {};
  if (o.layout && typeof o.layout === "object") {
    for (const [k, v] of Object.entries(o.layout)) {
      if (Array.isArray(v)) layout[k] = v.filter((i): i is ItemNaGrade => !!i && typeof i.uid === "string" && typeof i.def === "string");
    }
  }
  const salvas = Array.isArray(o.salvas)
    ? o.salvas.filter((s): s is VisaoSalva => !!s && typeof s.id === "string" && typeof s.nome === "string" && Array.isArray(s.itens))
    : [];
  return { v: 1, layout, salvas };
}

/**
 * Estado do Analytics da pessoa.
 *
 * `pronto` importa: enquanto a pref não chegou, a tela mostra o PADRÃO da
 * categoria. Gravar nesse instante apagaria a visão montada pela pessoa com o
 * padrão — por isso o `gravar` só sai depois que a leitura voltou.
 */
export function useVisoes() {
  const [estado, setEstado] = useState<EstadoAnalytics>(VAZIO);
  const [pronto, setPronto] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let vivo = true;
    void lerPrefsDaConta().then((p) => {
      if (!vivo) return;
      setEstado(normalizar(p?.[PREF_ANALYTICS]));
      setPronto(true);
    });
    return () => { vivo = false; };
  }, []);

  // Debounce de 600ms: arrastar cinco widgets seguidos vira UM PUT. Sem isto,
  // cada quadro do arrasto que troca a ordem dispararia uma gravação.
  const persistir = useCallback((proximo: EstadoAnalytics) => {
    setEstado(proximo);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void gravarPrefDaConta(PREF_ANALYTICS, proximo); }, 600);
  }, []);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return { estado, pronto, persistir };
}

// ── A grade ─────────────────────────────────────────────────────────────────

/**
 * Renderiza a grade de widgets da categoria.
 *
 * O CONTEÚDO de cada widget não mora aqui: quem chama passa `render`. É o que
 * permite a mesma grade servir Operação, Vendas e Produtos sem este arquivo
 * conhecer nenhum dado.
 */
export function GradeDeWidgets({ itens, catalogo, render, onMudar }: {
  itens: ItemNaGrade[];
  catalogo: DefWidget[];
  render: (def: string) => ReactNode;
  onMudar: (itens: ItemNaGrade[]) => void;
}) {
  const porId = useMemo(() => new Map(catalogo.map((d) => [d.id, d])), [catalogo]);
  // `porIds` casa por `id`, e a identidade do item na grade é o `uid` (o mesmo
  // widget pode aparecer duas vezes). A cópia com `id` existe só pra atravessar
  // o helper do kit.
  const comId = useMemo(() => itens.map((i) => ({ ...i, id: i.uid })), [itens]);
  const arrasto = useReordenavel(
    itens.map((i) => i.uid),
    (ids) => onMudar(porIds(comId, ids).map((i) => ({ uid: i.uid, def: i.def, largura: i.largura }))),
  );

  const trocarLargura = (uid: string, largura: Largura) =>
    onMudar(itens.map((i) => (i.uid === uid ? { ...i, largura } : i)));
  const remover = (uid: string) => onMudar(itens.filter((i) => i.uid !== uid));

  if (itens.length === 0) {
    return (
      <Momento icone="layout-grid" titulo="Nenhuma análise nesta visão"
        texto="Use “Adicionar análise” para escolher o que quer acompanhar aqui." />
    );
  }

  return (
    <div className="an-grade">
      {arrasto.ordenar(comId).map((item) => {
        const def = porId.get(item.def);
        if (!def) return null; // widget de uma versão futura: some em silêncio
        return (
          <div key={item.uid} className="an-item" data-larg={item.largura}
            ref={arrasto.linha(item.uid)}
            data-arrastando={arrasto.arrastando === item.uid ? "1" : undefined}>
            <div className="an-item-ferramentas">
              <span className="an-puxador" role="button" tabIndex={0} aria-label={`Reordenar ${def.nome}`}
                data-dica="Arraste para reordenar" {...arrasto.puxador(item.uid)}>
                <Icon name="grip-vertical" size={15} color="currentColor" />
              </span>
              <Dropdown
                titulo={`Opções de ${def.nome}`}
                gatilho={(p) => <BotaoIcone {...p} icone="dots-vertical" titulo={`Opções de ${def.nome}`} variante="sutil" />}
                secoes={[
                  {
                    titulo: "Largura",
                    // `selecao: "unica"` com `indicador: "ponto"`: são alternativas
                    // de um mesmo eixo, e o check sugeriria que dá pra marcar
                    // mais de uma.
                    selecao: "unica",
                    indicador: "ponto",
                    selecionados: [item.largura],
                    onSelecao: ([l]) => l && trocarLargura(item.uid, l as Largura),
                    itens: LARGURAS.map(([l, nome]) => ({ id: l, rotulo: nome })),
                  },
                  { itens: [{ id: "remover", rotulo: "Remover da visão", icone: "trash", perigo: true, onSelect: () => remover(item.uid) }] },
                ]}
              />
            </div>
            {render(item.def)}
          </div>
        );
      })}
    </div>
  );
}

// ── Adicionar análise ───────────────────────────────────────────────────────

export function AdicionarAnalise({ catalogo, itens, onAdicionar }: {
  catalogo: DefWidget[];
  itens: ItemNaGrade[];
  onAdicionar: (def: DefWidget) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const usados = new Set(itens.map((i) => i.def));
  return (
    <>
      <Botao icone="plus" variante="primario" onClick={() => setAberto(true)}>Adicionar análise</Botao>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo="Adicionar análise"
        subtitulo="Cada peça responde uma pergunta. Escolha pela pergunta, não pelo gráfico."
        icone="chart-bar" tamanho="lg">
        <div className="an-catalogo">
          {catalogo.map((d) => {
            const bloqueado = !!d.unico && usados.has(d.id);
            return (
              <button key={d.id} type="button" className="an-catalogo-item" disabled={bloqueado}
                onClick={() => { onAdicionar(d); setAberto(false); }}>
                <span className="an-catalogo-nome">
                  <Icon name={d.icon} size={16} color="var(--primary-texto, var(--primary))" />
                  {d.nome}
                  {/* O que já está na tela diz isso — em vez de sumir da lista
                      e deixar a pessoa procurando o que ela mesma adicionou. */}
                  {bloqueado && <Selo tom="neutro">já na visão</Selo>}
                </span>
                <span className="an-catalogo-sub">{d.sub}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

// ── Análises salvas ─────────────────────────────────────────────────────────

export function AnalisesSalvas({ salvas, categoria, itensAtuais, onAplicar, onSalvar, onApagar }: {
  salvas: VisaoSalva[];
  categoria: string;
  itensAtuais: ItemNaGrade[];
  onAplicar: (v: VisaoSalva) => void;
  onSalvar: (nome: string) => void;
  onApagar: (id: string) => void;
}) {
  const [nomeando, setNomeando] = useState(false);
  const [nome, setNome] = useState("");
  const daCategoria = salvas.filter((s) => s.categoria === categoria);

  // "Aplicada agora" = a visão salva bate exatamente com a grade viva. É o que
  // permite a lista dizer qual delas você está vendo, em vez de virar um
  // arquivo morto de nomes.
  const assinatura = (itens: ItemNaGrade[]) => itens.map((i) => `${i.def}:${i.largura}`).join("|");
  const atual = assinatura(itensAtuais);

  const salvar = () => {
    const limpo = nome.trim();
    if (!limpo) return;
    onSalvar(limpo);
    setNome(""); setNomeando(false);
    toast(`Análise “${limpo}” salva.`);
  };

  return (
    <Bloco icone="bookmark" titulo="Análises salvas"
      dica="Uma análise salva guarda QUAIS peças estão na tela e com que largura — não o período. Assim a mesma visão serve pra hoje e pro mês fechado."
      direita={<BotaoIcone icone="plus" titulo="Salvar a visão atual" variante="sutil" onClick={() => setNomeando(true)} />}>
      {nomeando && (
        <div style={{ display: "grid", gap: 8 }}>
          <Campo label="Nome da análise" largo>
            {(id) => (
              <input id={id} value={nome} placeholder="Visão geral da operação" autoFocus
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setNomeando(false); }} />
            )}
          </Campo>
          <div style={{ display: "flex", gap: 8 }}>
            <Botao onClick={salvar} variante="primario" disabled={!nome.trim()}>Salvar</Botao>
            <Botao onClick={() => { setNomeando(false); setNome(""); }} variante="sutil">Cancelar</Botao>
          </div>
        </div>
      )}

      {daCategoria.length === 0 && !nomeando
        ? <Momento compacto icone="bookmark" titulo="Nenhuma análise salva"
            texto="Monte a grade como você gosta e salve para voltar a ela com um clique." />
        : (
          <div style={{ display: "grid", gap: 2 }}>
            {daCategoria.map((s) => (
              <button key={s.id} type="button" className="an-salva" onClick={() => onAplicar(s)}
                aria-current={assinatura(s.itens) === atual}>
                <Icon name="chart-bar" size={16} color="var(--primary-texto, var(--primary))" />
                <span style={{ flex: 1, minWidth: 0, display: "grid" }}>
                  <span className="an-salva-nome">{s.nome}</span>
                  <span className="an-salva-sub">{s.itens.length} {s.itens.length === 1 ? "análise" : "análises"} · {s.em}</span>
                </span>
                {/* `span` e não `button`: botão dentro de botão é HTML inválido
                    e o Firefox simplesmente não dispara o de dentro. */}
                <span role="button" tabIndex={0} aria-label={`Apagar ${s.nome}`} className="ui-toque"
                  style={{ flex: "none", display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, color: "var(--text-dim)" }}
                  onClick={(e) => { e.stopPropagation(); onApagar(s.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onApagar(s.id); } }}>
                  <Icon name="trash" size={14} color="currentColor" />
                </span>
              </button>
            ))}
          </div>
        )}
    </Bloco>
  );
}

/** Item novo pra grade, a partir do catálogo. */
export const itemDe = (d: DefWidget): ItemNaGrade => ({ uid: novoId(), def: d.id, largura: d.largura });
/** Grade padrão de uma categoria: a ordem do catálogo, sem nada escondido. */
export const gradePadrao = (catalogo: DefWidget[]): ItemNaGrade[] => catalogo.map(itemDe);
