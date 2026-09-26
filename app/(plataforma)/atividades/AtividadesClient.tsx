"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CATALOGO, CATEGORIAS } from "@/lib/atividades-catalog";
import { PecasModal } from "./PecasModal";
import { MaterialDaAtividade, textoDoConsumo, type ResumoConsumo } from "./MaterialDaAtividade";
import { PRIORIDADES, ROTULO_PRIORIDADE, resumoProdutividade, type Atividade, type Colaborador, type AtividadeStatus, type StatusDeTrabalho, type Prioridade } from "@/lib/atividades-catalog";
import { gerarOrdens, RECEITAS, PRODUTOS, LABEL_PRODUTO, META_PADRAO, TEMPO_PADRAO_MIN, type ProdutoProducao } from "@/lib/producao-receita";
import { aparenciaDoEstagio, jaEntrouNoEstoque, nascidaDaAutomacao } from "@/lib/atividades-estagio";
import { Icon } from "../Icon";
import { confirmar, toast } from "../Toast";
import { GlassSelect, GlassDate } from "../GlassPicker";
import { useSticky } from "../useSticky";
import { useIsMobile } from "../ui/useMediaQuery";
import { usePollComRecuo } from "../ui/usePoll";
import { VerMais } from "../ui/mobile";
import { Secao } from "../ui/Secao";
import { Botao, BotaoIcone, PainelLateral, Caixa } from "../ui/controles";
import { grade } from "../ui/grade";
import { TrocaIcone } from "../ui/micro";
import { ChipIcone, MEDALHA, TINTA_MEDALHA } from "../ui/ChipIcone";

// Uma coluna por status. A coluna "A conferir" saiu em 11/09/2026 junto com a
// conferência de atividade (pedido do dono): concluir fecha, e peça entra no
// estoque pelo próprio Estoque (lib/conferencia-de-atividade.ts).
// Só os três do trabalho: `cancelada`/`aguardando_material` são da cadeia e
// nem chegam neste quadro (lib/atividades.ts › foraDaCadeia).
type ColunaQuadro = StatusDeTrabalho;

const STATUS_LABEL: Record<ColunaQuadro, string> = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída" };
const STATUS_COR: Record<ColunaQuadro, string> = { pendente: "var(--atencao)", em_andamento: "var(--primary-texto)", concluida: "var(--ok)" };

interface CatItem { id: string; setor: string; categoria: string; nome: string }
// Setores conhecidos do catálogo fixo (por enquanto tudo é Produção).
const SETOR_FIXO = "Produção";

/** Pedido que chega das outras abas da área (Visão geral, Calendário): abrir
 *  o formulário já com a tarefa escolhida, ou filtrar o quadro por uma busca.
 *  `n` muda a cada pedido — dois cliques iguais seguidos também valem. */
export type PedidoDoQuadro = { n: number; nova?: { categoria?: string; tarefa?: string }; busca?: string };

// `embutido` = montado dentro de "Produtividade & metas": os KPIs, o
// cabeçalho e a produtividade por pessoa já existem LÁ EM CIMA, consolidados.
// Aqui sobra o que esta peça é de verdade — o quadro operacional: o que está
// pendente, o que está rolando, o que travou. O formulário de atribuição vira
// painel lateral, comandado de fora pelo botão "Nova atividade".
//
// Embutido, o recorte (período + setor) TAMBÉM vem de fora. Antes o painel de
// análise trazia o filtro dele junto, então a mesma fileira de "Hoje · 7 dias ·
// 30 dias · Todos os setores…" aparecia duas vezes na mesma rolagem — e as duas
// podiam discordar, cada metade da tela falando de um recorte diferente.
export function AtividadesClient({ colaboradores, initial, produtos = [], embutido, abrirForm, onFecharForm, periodo, setor: setorFiltro, onSetor, onLista, acoesRef, semTitulo, pode, pedido }: {
  colaboradores: Colaborador[]; initial: Atividade[]; roleLabel: string;
  produtos?: { nome: string; tipo?: string }[];
  embutido?: boolean; abrirForm?: boolean; onFecharForm?: () => void;
  /** Recorte comandado de fora (só embutido). */
  periodo?: Periodo; setor?: string; onSetor?: (s: string) => void;
  /** Espelha a lista viva pra quem embute — os números de cima seguem o quadro. */
  onLista?: (l: Atividade[]) => void;
  /** Entrega o `recarregar` pra quem embute pôr o botão "Atualizar" na barra global. */
  acoesRef?: { current: { recarregar: () => Promise<boolean> } | null };
  /** Dentro das abas da área (AtividadesShell): o título já está em cima. */
  semTitulo?: boolean;
  /** As chaves da área Atividades (lib/atividades-acesso.ts). A tela esconde o
   *  que a pessoa não pode — a rota recusaria. Ausente (embutidos antigos,
   *  bancos de prova) = tudo liberado, como era. */
  pode?: { ver: boolean; atribuir: boolean; configurar: boolean };
  /** Pedido das outras abas da área (ver `PedidoDoQuadro`). */
  pedido?: PedidoDoQuadro;
}) {
  const router = useRouter();
  const podeAtribuir = pode?.atribuir ?? true;
  const podeConfigurar = pode?.configurar ?? true;
  const [lista, setLista] = useState<Atividade[]>(initial);
  const [custom, setCustom] = useState<CatItem[]>([]);
  const [setor, setSetor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [tarefa, setTarefa] = useState("");
  const [tarefaCustom, setTarefaCustom] = useState("");
  const [salvarOpcao, setSalvarOpcao] = useState(true);
  const [detalhe, setDetalhe] = useState("");
  const [paraIds, setParaIds] = useState<string[]>([]);   // pode atribuir pra VÁRIAS pessoas (setores diferentes)
  const [qtdPorPessoa, setQtdPorPessoa] = useState<Record<string, string>>({});   // quantidade por pessoa (vazio = usa a global)
  const [pool, setPool] = useState(false); // mandar pro pool do setor (cai pro tablet)
  const [prazo, setPrazo] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [qtd, setQtd] = useState("1");
  // 40 min é o padrão de toda atividade (mesmo TEMPO_PADRAO_MIN do servidor).
  // O campo vinha vazio e o servidor caía no default — agora o número aparece
  // na tela, então dá pra ver e ajustar antes de mandar.
  const [tempo, setTempo] = useState(String(TEMPO_PADRAO_MIN));
  const [produtoNome, setProdutoNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [foto, setFoto] = useState<string | null>(null); // lightbox da foto de comprovação
  const [gerarAberto, setGerarAberto] = useState(false);  // modal "Gerar produção"
  const [pecasAberto, setPecasAberto] = useState(false);  // modal "Peças por atividade"
  const [materialDe, setMaterialDe] = useState<Atividade | null>(null); // painel "Material desta atividade"
  // Entrega: em qual tablet cai (ou só no sistema, p/ dirigida).
  const [tablets, setTablets] = useState<string[]>([]);
  const [entregaTablet, setEntregaTablet] = useState(true);  // dirigida: tablet vs só no sistema
  const [mesaAlvo, setMesaAlvo] = useState("");              // "" = qualquer tablet do setor (pool)
  const celular = useIsMobile();
  const [colMobile, setColMobile] = useState<ColunaQuadro>("pendente");   // no celular o quadro vira abas
  const [formLocal, setFormLocal] = useState(false);                         // atribuição nasce fechada no celular
  const formAberto = embutido ? !!abrirForm : formLocal;
  const setFormAberto = (v: boolean | ((p: boolean) => boolean)) => {
    if (embutido) { if (!(typeof v === "function" ? v(formAberto) : v)) onFecharForm?.(); return; }
    setFormLocal(v);
  };

  async function loadCustom() {
    try { const r = await fetch("/api/atividades-catalogo", { cache: "no-store" }); const d = await r.json(); setCustom(d.itens ?? []); } catch { /* ok */ }
  }
  useEffect(() => { loadCustom(); }, []);
  // Tablets de PRODUÇÃO (pro seletor de entrega).
  // /api/devices/mesas, NÃO /api/devices: o completo é só-admin (devolve códigos
  // de pareamento). Gerente de produção/vendas levava 401 → lista vazia → o
  // seletor sumia e a dirigida nascia "só no sistema" sem a pessoa saber.
  useEffect(() => {
    fetch("/api/devices/mesas").then((r) => r.json()).then((d) => {
      const nomes = [...new Set(((d.devices ?? []) as { nome_mesa: string | null; ativo?: boolean; tipo?: string }[]).filter((x) => x.ativo !== false && x.tipo !== "ponto").map((x) => x.nome_mesa).filter(Boolean) as string[])];
      setTablets(nomes);
    }).catch(() => {});
  }, []);

  // Assinatura barata da lista em tela: o que muda visualmente é quem está em
  // qual estado. Serve pro poll saber se o ciclo trouxe novidade ou não.
  const assinaturaRef = useRef("");
  const assinar = (as: Atividade[]) => as.map((a) => `${a.id}:${a.status}`).join(",");

  // Recarrega a lista do servidor (após gerar/cancelar produção).
  // Devolve `true` quando algo de fato mudou — é o sinal que o poll usa pra
  // manter o ritmo rápido em vez de recuar.
  async function recarregar(): Promise<boolean> {
    try {
      const r = await fetch("/api/atividades", { cache: "no-store" });
      const d = await r.json();
      if (!d.atividades) return false;
      const nova = assinar(d.atividades);
      const mudou = nova !== assinaturaRef.current;
      assinaturaRef.current = nova;
      setLista(d.atividades);
      return mudou;
    } catch { return false; }
  }
  // ── Material consumido por atividade ───────────────────────────────────────
  //
  // O selo "Material: 2 etiquetas · 100 peças" no card. Uma consulta só pro
  // quadro inteiro, e SÓ quando o conjunto de atividades muda — não a cada
  // ciclo do poll (a lista vem nova a cada 10s, mas a chave só muda quando
  // alguma atividade de fato entra ou sai).
  const [consumo, setConsumo] = useState<Record<string, ResumoConsumo>>({});
  const [versaoConsumo, setVersaoConsumo] = useState(0);
  // Banco sem `baixa_atividade_id` (o SQL da caixa ainda não rodou): a primeira
  // resposta diz isso e a pergunta não se repete mais. Sem esta trava a tela
  // gastaria uma chamada por mudança de quadro pra receber sempre `{}`.
  const semVinculoRef = useRef(false);
  // 120 e não a lista inteira: são ~4 kB de uuid na query string. Concluídas vão
  // pro fim — o material interessa em quem ainda está sendo feito e em quem
  // espera conferência.
  const chaveConsumo = useMemo(() => [...lista]
    .sort((a, b) => Number(a.status === "concluida") - Number(b.status === "concluida"))
    .slice(0, 120).map((a) => a.id).sort().join(","), [lista]);
  useEffect(() => {
    if (!chaveConsumo || semVinculoRef.current) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/estoque/unidades?atividades=${encodeURIComponent(chaveConsumo)}`, { cache: "no-store" });
        if (!r.ok) return;   // sem permissão de estoque: o quadro funciona igual, sem o selo
        const d = (await r.json()) as { porAtividade?: Record<string, ResumoConsumo>; semVinculo?: boolean };
        if (!vivo) return;
        if (d.semVinculo) { semVinculoRef.current = true; return; }
        setConsumo(d.porAtividade ?? {});
      } catch { /* o selo é informação a mais; a falta dele não quebra nada */ }
    })();
    return () => { vivo = false; };
  }, [chaveConsumo, versaoConsumo]);

  // Quem embute recebe a lista VIVA. Sem isto os quatro números do topo ficavam
  // presos no que o servidor mandou na primeira carga: alguém concluía uma
  // atividade no quadro, o card mudava de coluna e o KPI logo acima continuava
  // no valor antigo até um F5.
  useEffect(() => { onLista?.(lista); }, [lista, onLista]);
  // O "Atualizar" pertence à barra de filtro global, não ao painel de análise
  // lá embaixo — mas o `recarregar` mora aqui. A ref entrega a ação sem
  // levantar a lista inteira de estado.
  useEffect(() => {
    if (!acoesRef) return;
    acoesRef.current = { recarregar };
    return () => { acoesRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acoesRef]);
  // Marca a última ação LOCAL (mover/remover) pra o poll pular os ~3s seguintes:
  // sem isso, um refresh no meio da atualização otimista (antes do PATCH gravar)
  // reverteria o card por um instante.
  const ultimaAcaoRef = useRef(0);
  // Tempo real: quando alguém aceita/inicia/conclui, aparece sozinho.
  //
  // O ritmo é 10s pra QUEM ESTÁ MEXENDO e recua até 1min na tela esquecida
  // aberta. Antes eram 10s fixos enquanto a aba estivesse visível — um monitor
  // secundário com a tela aberta o dia todo gerava ~2.900 invocações por dia
  // sozinho, sem ninguém olhando. Qualquer clique/tecla/rolagem devolve os 10s
  // na hora, e mudança vinda do servidor também.
  //
  // O teto é 1min (não 5, como nos painéis de análise) porque este quadro é
  // acompanhado ao vivo: alguém fica olhando, SEM tocar em nada, esperando um
  // colega pegar uma ordem. Já corta 6x os ciclos ociosos.
  usePollComRecuo(() => {
    if (Date.now() - ultimaAcaoRef.current <= 3000) return false;
    return recarregar();
  }, 10_000, 60_000);
  // `focus` continua sendo revalidação imediata: voltar pra janela mostra o agora.
  useEffect(() => {
    const aoVoltar = () => { if (!document.hidden && Date.now() - ultimaAcaoRef.current > 1500) recarregar(); };
    window.addEventListener("focus", aoVoltar);
    return () => { window.removeEventListener("focus", aoVoltar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function cancelarLote(lote: string) {
    if (!(await confirmar("Cancelar este lote de produção?", { detalhe: "Some do pool o que ainda NÃO foi pego. O que já está em andamento/concluído não é afetado.", perigo: true }))) return;
    try {
      const r = await fetch(`/api/atividades/producao?lote=${lote}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.ok(`${d.removidas ?? 0} ordem(ns) cancelada(s).`); recarregar(); } else toast.erro("Falha ao cancelar.");
    } catch { toast.erro("Sem conexão."); }
  }

  const setores = useMemo(() => {
    const s = new Set<string>([SETOR_FIXO]);
    colaboradores.forEach((c) => c.setor && s.add(c.setor));
    custom.forEach((c) => s.add(c.setor));
    return [...s].sort();
  }, [colaboradores, custom]);


  // categorias disponíveis no setor: fixas (só Produção) + personalizadas do setor.
  const categorias = useMemo(() => {
    const s = new Set<string>();
    if (setor === SETOR_FIXO) CATEGORIAS.forEach((c) => s.add(c));
    custom.filter((c) => c.setor === setor).forEach((c) => s.add(c.categoria));
    if (s.size === 0) s.add("Personalizadas");
    return [...s].sort();
  }, [setor, custom]);

  // tarefas da categoria: fixas (Produção) + personalizadas.
  const tarefas = useMemo(() => {
    const out: string[] = [];
    if (setor === SETOR_FIXO) CATALOGO.filter((c) => c.categoria === categoria).forEach((c) => out.push(c.nome));
    custom.filter((c) => c.setor === setor && c.categoria === categoria).forEach((c) => out.push(c.nome));
    return [...new Set(out)];
  }, [setor, categoria, custom]);

  const opcoesDoSetor = useMemo(() => custom.filter((c) => c.setor === setor), [custom, setor]);
  const produtividade = useMemo(() => resumoProdutividade(lista), [lista]);

  function escolherSetor(v: string) { setSetor(v); setCategoria(""); setTarefa(""); setTarefaCustom(""); }
  // ao trocar categoria, reseta tarefa
  function escolherCategoria(v: string) { setCategoria(v); setTarefa(""); }

  async function criar() {
    if (!setor) { setMsg({ ok: false, texto: "Escolha o setor." }); return; }
    const nomeTarefa = tarefaCustom.trim() || tarefa;
    if (!nomeTarefa) { setMsg({ ok: false, texto: "Escolha ou digite a tarefa." }); return; }
    if (!pool && paraIds.length === 0) { setMsg({ ok: false, texto: "Escolha ao menos uma pessoa (ou marque “pool do setor”)." }); return; }
    // Dirigida no tablet exige escolher qual (se houver tablets cadastrados).
    // SEM a condição tablets.length > 0: com a lista vazia (fetch em voo,
    // falho, ou nenhum tablet ativo) a dirigida passava e nascia silenciosamente
    // "só no sistema" — a pessoa lançava e a atividade nunca caía no tablet.
    // Já mordeu duas vezes; melhor bloquear com o motivo claro.
    if (!pool && entregaTablet && !mesaAlvo) {
      setMsg({
        ok: false,
        texto: tablets.length === 0
          ? "Nenhum tablet ativo encontrado — recarregue a página, reative o tablet em Administração → Dispositivos, ou marque “Só no sistema”."
          : "Escolha em qual tablet a atividade cai (ou marque “só no sistema”).",
      });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const cat = categoria || "Personalizadas";
      // salva a tarefa personalizada como opção, se marcado
      if (tarefaCustom.trim() && salvarOpcao) {
        await fetch("/api/atividades-catalogo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setor, categoria: cat, nome: nomeTarefa }) });
        loadCustom();
      }
      // mesa_alvo: pool → tablet específico ou null (qualquer do setor). Dirigida →
      // tablet escolhido, ou null quando "só no sistema".
      const mesa_alvo = pool ? (mesaAlvo || null) : (entregaTablet ? (mesaAlvo || null) : null);
      const qtdGeral = Number(qtd) || 1;
      const base = { categoria: cat, tarefa: nomeTarefa, detalhe, prazo: prazo || null, prioridade, tempo_estimado_min: Number(tempo) || null, produto_nome: produtoNome || null, mesa_alvo };
      const post = (corpo: object) => fetch("/api/atividades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const limparTudo = () => { setDetalhe(""); setTarefa(""); setTarefaCustom(""); setPrazo(""); setPrioridade("media"); setQtd("1"); setTempo(String(TEMPO_PADRAO_MIN)); setProdutoNome(""); };

      // #5 Pool E pessoas podem ir JUNTOS: manda pro pool (se marcado) + pra cada
      // pessoa selecionada (setores diferentes ok, cada uma com a sua quantidade).
      const novas: Atividade[] = [];
      let falhou = 0;
      if (pool) {
        const r = await post({ ...base, quantidade_alvo: qtdGeral, pool: true, setor, confirmar: false });
        const d = await r.json();
        if (r.ok && d.atividade) novas.push(d.atividade);
        else { falhou++; if (d.error === "fora_da_hierarquia") setMsg({ ok: false, texto: "Você não pode atribuir nesse setor." }); }
      }
      for (const pid of paraIds) {
        const qtdPessoa = Number(qtdPorPessoa[pid]) || qtdGeral;
        let r = await post({ ...base, para_id: pid, quantidade_alvo: qtdPessoa, confirmar: false });
        let d = await r.json();
        if (r.status === 409 && d.error === "nao_presente") {
          const ok = await confirmar(`${d.nome} não bateu ponto (não está na empresa). Enviar a atividade mesmo assim?`, { detalhe: "Cai no tablet da pessoa como pedido pra aceitar. Você é avisado quando ela aceitar." });
          if (!ok) continue;
          r = await post({ ...base, para_id: pid, quantidade_alvo: qtdPessoa, confirmar: true }); d = await r.json();
        }
        if (r.ok && d.atividade) novas.push(d.atividade); else falhou++;
      }
      if (novas.length) {
        setLista((p) => [...novas, ...p]);
        // Pool sozinho = one-off (limpa tudo). Com pessoas = mantém a tarefa pro próximo grupo.
        if (paraIds.length) { setParaIds([]); setQtdPorPessoa({}); setMsg({ ok: true, texto: `${novas.length} atividade(s) criada(s)${falhou ? ` · ${falhou} não pôde` : ""} — tarefa mantida` }); }
        else { limparTudo(); setMsg({ ok: true, texto: "enviada pro pool do setor (cai pro tablet)" }); }
      } else setMsg({ ok: false, texto: "Não foi possível atribuir (verifique a hierarquia/permissão)." });
    } finally { setBusy(false); }
  }

  async function mudarStatus(id: string, status: AtividadeStatus) {
    ultimaAcaoRef.current = Date.now();
    setLista((p) => p.map((a) => (a.id === id ? { ...a, status } : a)));
    await fetch("/api/atividades", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    recarregar();   // pega os timestamps reais (iniciada_at/concluida_at) do servidor
  }

  async function removerAtividade(a: Atividade) {
    if (!(await confirmar(`Remover a atividade "${a.tarefa}" de ${a.para_nome}?`, { detalhe: "Esta ação não pode ser desfeita.", perigo: true }))) return;
    ultimaAcaoRef.current = Date.now();
    setLista((p) => p.filter((x) => x.id !== a.id));
    const r = await fetch(`/api/atividades?id=${a.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      // Recusou: o card volta agora, com aviso — não no próximo poll, calado.
      setLista((p) => (p.some((x) => x.id === a.id) ? p : [a, ...p]));
      toast.erro(`Não foi possível remover "${a.tarefa}". A atividade continua no quadro.`);
    }
  }

  async function removerOpcao(c: CatItem) {
    if (!(await confirmar(`Remover a opção de tarefa "${c.nome}"?`, { perigo: true }))) return;
    setCustom((p) => p.filter((x) => x.id !== c.id));
    if (tarefa === c.nome) setTarefa("");
    await fetch(`/api/atividades-catalogo?id=${c.id}`, { method: "DELETE" });
  }

  const cols: ColunaQuadro[] = ["pendente", "em_andamento", "concluida"];

  // #3 busca no quadro + #4 seleção em lote.
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const q = busca.trim().toLowerCase();
  const matchBusca = (a: Atividade) => !q || `${a.tarefa} ${a.categoria} ${a.para_nome ?? ""}`.toLowerCase().includes(q);
  const toggleSel = (id: string) => setSelecao((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Pedido das outras abas. A tarefa vem por NOME: se existe no catálogo de
  // Produção, fica selecionada; senão entra como tarefa personalizada — sem
  // virar opção salva, porque quem pediu não pediu isso.
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pedido) return;
    if (pedido.busca !== undefined) setBusca(pedido.busca);
    if (!pedido.nova) return;
    const { categoria: c, tarefa: t } = pedido.nova;
    if (c || t) {
      const igual = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;
      const cat = c ? CATEGORIAS.find((x) => igual(x, c)) : undefined;
      const doCatalogo = cat && t ? CATALOGO.find((x) => x.categoria === cat && igual(x.nome, t)) : undefined;
      setSetor(SETOR_FIXO);
      setCategoria(cat ?? c ?? "");
      setTarefa(doCatalogo?.nome ?? "");
      setTarefaCustom(doCatalogo ? "" : t ?? "");
      setSalvarOpcao(false);
    }
    setFormLocal(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.n]);
  async function cancelarSelecionadas() {
    const ids = [...selecao];
    if (!ids.length) return;
    if (!(await confirmar(`Cancelar/remover ${ids.length} atividade(s) selecionada(s)?`, { detalhe: "Esta ação não pode ser desfeita.", perigo: true }))) return;
    ultimaAcaoRef.current = Date.now();
    setLista((p) => p.filter((x) => !selecao.has(x.id)));
    setSelecao(new Set());
    const removidas = lista.filter((x) => ids.includes(x.id));
    const res = await Promise.all(ids.map((id) => fetch(`/api/atividades?id=${id}`, { method: "DELETE" }).then((r) => r.ok, () => false)));
    const voltam = removidas.filter((x) => !res[ids.indexOf(x.id)]);
    if (voltam.length) {
      setLista((p) => [...voltam.filter((v) => !p.some((x) => x.id === v.id)), ...p]);
      toast.erro(`${voltam.length} atividade(s) não foram removidas e continuam no quadro.`);
    }
  }

  // O quadro é O QUE a tela é. No celular ele sobe pro topo: painel de
  // desempenho, formulário e produtividade viram blocos recolhidos abaixo,
  // porque quem abre isto em pé quer ver o trabalho, não os indicadores.
  const buscaEQuadro = (
    <>
    {/* Busca + ações em lote */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
        <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", display: "grid", placeItems: "center" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por tarefa, categoria ou pessoa…"
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5 }} />
      </div>
      {selecao.size > 0 && (
        <Botao variante="perigo" icone="trash" onClick={cancelarSelecionadas}>
          Cancelar {selecao.size} selecionada(s)
        </Botao>
      )}
      {selecao.size > 0 && <Botao variante="sutil" onClick={() => setSelecao(new Set())}>Limpar seleção</Botao>}
    </div>

    {/* Quadro por etapa. "Concluída" mostra só as de HOJE (reseta à meia-noite SP);
        o histórico permanente fica em "Histórico de atividades" logo abaixo. */}
    {(() => {
      const s = new Date(Date.now() - 3 * 3600 * 1000);
      const inicioHoje = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 3, 0, 0);
      const itensDe = (st: ColunaQuadro) => (
        st === "concluida"
          ? lista.filter((a) => a.status === "concluida" && a.concluida_at && Date.parse(a.concluida_at) >= inicioHoje)
          : lista.filter((a) => a.status === st)
      ).filter(matchBusca);
      const coluna = (st: ColunaQuadro, comCabecalho: boolean) => {
        const items = itensDe(st);
        return (
          <div key={st}>
            {comCabecalho && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: STATUS_COR[st] }} />
                <strong style={{ fontSize: 14 }}>{STATUS_LABEL[st]}{st === "concluida" ? " (hoje)" : ""}</strong>
                <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-dim)" }}>{items.length}</span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((a) => <Card key={a.id} a={a} onMove={mudarStatus} onRemove={removerAtividade} onFoto={setFoto} sel={selecao.has(a.id)} onToggleSel={toggleSel} consumo={consumo[a.id]} onMaterial={setMaterialDe} />)}
              {items.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", padding: 8 }}>—</div>
              )}
            </div>
          </div>
        );
      };
      // Celular: as três colunas empilhadas viram uma rolagem sem fim e a pessoa
      // perde a referência de onde está. Vira faixa de abas com a contagem.
      if (celular) {
        return (
          <div style={{ marginTop: 14 }}>
            <QuadroAbas atual={colMobile} onTrocar={setColMobile} contagem={(st) => itensDe(st).length} />
            <div style={{ marginTop: 12 }}>{coluna(colMobile, false)}</div>
          </div>
        );
      }
      // 215px é o menor card em que as ações ainda cabem em duas por linha —
      // e é o que faz as QUATRO colunas caberem lado a lado na coluna de
      // conteúdo com a sidebar aberta (4×215 + 3×14 = 902). Num monitor mais
      // estreito o `auto-fit` reorganiza sozinho (2×2) em vez de espremer o
      // card até o botão não caber; abaixo de 700px o quadro já virou abas.
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 215px), 1fr))", gap: 14, marginTop: 14 }}>
          {cols.map((st) => coluna(st, true))}
        </div>
      );
    })()}
    </>
  );

  return (
    <div style={{ maxWidth: 1180 }}>
      {/* O TÍTULO é o que não se repete quando a tela está embutida em
          Pessoas › Produtividade — as AÇÕES continuam, sempre.
          Elas já estiveram dentro deste `!embutido`, e por três dias úteis o
          sistema não enviou nenhuma atividade: "Gerar produção" (o fluxo que
          cria os lotes do dia) e "Peças por atividade" não tinham botão em
          NENHUMA porta, porque a sidebar não abre /atividades desde que a tela
          passou a morar dentro de Pessoas. Ação de quadro mora com o quadro. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        {!embutido && !semTitulo && (
        /* `.page-head`: no celular o cabeçalho fixo já escreve "Atividades" —
            repetir em 32px logo abaixo gasta um sexto da dobra dizendo o que a
            pessoa acabou de ler. A regra da fundação encolhe título e subtítulo. */
        <div className="page-head">
          <h1 style={{ fontWeight: 800 }}>Atividades</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4 }}>Escolha o setor e atribua as atividades. As tarefas dependem do setor.</p>
        </div>
        )}
        {/* `flex: none` no computador (os dois botões ficam à direita do
            título). No celular esse "none" impedia o grupo de encolher: os dois
            somavam 389px numa faixa útil menor e o segundo era CORTADO — e
            como a página não rola de lado, ele ficava inalcançável, pior do que
            transbordar. `.ativ-acoes` devolve a linha inteira pra eles. */}
        <div className="ativ-acoes" style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: "none" }}>
          {/* Kit, não estilo inline: `background: var(--primary)` + `color:#fff`
              escrito à mão ignora o `--primary-acao`/`--on-primary` calculados
              por luminância, e com as cores Carmim/Âmbar da coleção o rótulo
              reprovava em contraste (medido: 4,46 contra o piso de 4,5). */}
          {/* A produção de verdade (tempo real por produto + rastro da peça)
              mora em rota própria. A sidebar é FIXA e não abre /atividades, então
              se o botão não estiver AQUI, junto do quadro, a tela não tem porta
              nenhuma — é exatamente o que já aconteceu com "Gerar produção", que
              passou três dias úteis sem existir em lugar nenhum. */}
          <Botao variante="secundario" tamanho="lg" icone="history"
            onClick={() => router.push("/atividades/historico")}>
            Produção de verdade
          </Botao>
          {podeConfigurar && (
            <Botao variante="secundario" tamanho="lg" icone="package" onClick={() => setPecasAberto(true)}>
              Peças por atividade
            </Botao>
          )}
          {podeAtribuir && (
            <Botao variante="primario" tamanho="lg" icone="box" onClick={() => setGerarAberto(true)}>
              Gerar produção
            </Botao>
          )}
        </div>
      </div>

      {/* Celular: o trabalho primeiro. O quadro (com a busca) sobe pro topo e
          tudo que é indicador desce, recolhido. */}
      {celular && <div style={{ marginTop: 4 }}>{buscaEQuadro}</div>}

      {/* Atribuir: no celular é uma AÇÃO atrás de um botão, não um formulário de
          dez campos ocupando a tela toda antes de a pessoa ver as atividades. */}
      {/* AÇÃO principal, não "revelar mais": pesa como botão. Antes dividia a
          classe com os `VerMais` e sumia no meio deles. */}
      <div className="mob-only" style={{ marginTop: 14, display: embutido || !podeAtribuir ? "none" : undefined }}>
        <Botao variante={formAberto ? "secundario" : "primario"} tamanho="lg" bloco
          icone={formAberto ? "chevron-up" : "plus"}
          onClick={() => setFormAberto((v) => !v)}>
          {formAberto ? "Fechar" : "Atribuir atividade"}
        </Botao>
      </div>

      {/* Painel de desempenho (KPIs, presença, fila, atrasadas, tendência, setor, ranking) */}
      {/* Análise completa (tendência, ranking, por setor, tarefas lentas). Os
          quatro números que respondem "o dia está de pé?" ficam no topo da tela
          de Produtividade; isto aqui é o degrau abaixo, pra quem foi investigar. */}
      {/* Embutido isto é uma SEÇÃO fechada, não um bloco sempre aberto: os
          quatro números do topo respondem "o dia está de pé?", e tendência,
          ranking e tarefas lentas são a investigação — quem não foi investigar
          não deveria rolar por elas pra chegar no quadro. */}
      {embutido ? (
        <div style={{ marginTop: 16 }}>
          <Secao icone="chart-bar" titulo="Análise completa"
            resumo="tendência, por setor, ranking de pessoas e tarefas mais lentas">
            <PainelAtividades lista={lista} colaboradores={colaboradores} onRecarregar={() => { void recarregar(); }}
              compacto periodoFixo={periodo} setorFixo={setorFiltro} onSetor={onSetor} />
          </Secao>
        </div>
      ) : (
        <VerMais label="Ver desempenho da equipe">
          {/* `recarregar` devolve "mudou?" pro poll; aqui só interessa o efeito. */}
          <PainelAtividades lista={lista} colaboradores={colaboradores} onRecarregar={() => { void recarregar(); }} />
        </VerMais>
      )}

      {/* Formulário de atribuição. Embutido, ele é um PAINEL: dez campos de
          criação não podem ocupar a tela de quem veio só conferir o quadro. */}
      {podeAtribuir && (
      <Envelope embutido={embutido} aberto={formAberto} onFechar={() => setFormAberto(false)}>
      <div ref={formRef} className={`${embutido ? "" : "glass glass-spec "}mob-collapse${formAberto ? " aberto" : ""}`} style={{ padding: embutido ? 0 : 20, borderRadius: 18, marginTop: embutido ? 0 : 18, scrollMarginTop: 84 }}>
        {/* 1) Setor primeiro */}
        <Field label="1 · Setor">
          <GlassSelect value={setor} onChange={escolherSetor} placeholder="Selecione o setor…" options={setores.map((s) => ({ value: s, label: s }))} />
        </Field>

        {setor && (
          <>
            {/* "1fr 1.4fr" não casa nenhuma regra da fundação e virava dois selects
                de ~120px no celular — lá embaixo de 700px empilha. */}
            <div style={{ display: "grid", gridTemplateColumns: celular ? "minmax(0, 1fr)" : "1fr 1.4fr", gap: 12, marginTop: 12 }}>
              <Field label="2 · Categoria">
                <GlassSelect value={categoria} onChange={escolherCategoria} placeholder="Selecione…" options={categorias.map((c) => ({ value: c, label: c }))} />
              </Field>
              <Field label="3 · Tarefa">
                <GlassSelect value={tarefa} onChange={setTarefa} placeholder={categoria ? "Selecione…" : "Escolha a categoria"} options={tarefas.map((t) => ({ value: t, label: t }))} />
              </Field>
            </div>

            {/* Tarefa personalizada */}
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "var(--surface)" }}>
              <Field label="Ou crie uma tarefa personalizada">
                <input value={tarefaCustom} onChange={(e) => setTarefaCustom(e.target.value)} placeholder="ex.: Embalar pedido especial" style={sel} />
              </Field>
              {tarefaCustom.trim() && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, cursor: "pointer", color: "var(--text-dim)" }}>
                  <Caixa marcado={salvarOpcao} onChange={(marc) => setSalvarOpcao(marc)} />
                  Salvar como opção para o setor {setor} (aparece nas próximas vezes)
                </label>
              )}
            </div>

            {/* Opções personalizadas existentes (remover) */}
            {opcoesDoSetor.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>Opções salvas:</span>
                {opcoesDoSetor.map((c) => (
                  <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 6px 4px 10px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    {c.nome}
                    <button onClick={() => removerOpcao(c)} title="Remover opção" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}><Icon name="x" size={13} /></button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 12, marginTop: 12, alignItems: "end" }}>
              <Field label="Pessoas (uma ou várias, qualquer setor)">
                {(
                    <div>
                      {pool && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))", background: "color-mix(in srgb, var(--primary) 12%, transparent)", borderRadius: 999, padding: "3px 10px" }}><Icon name="device-mobile" size={13} color="var(--primary-texto)" /> + Pool do setor (tablet do livre){paraIds.length ? " e mais:" : ""}</div>}
                      {paraIds.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          {paraIds.map((id) => {
                            const c = colaboradores.find((x) => x.id === id);
                            return (
                              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, padding: "3px 5px 3px 10px", borderRadius: 999, background: "color-mix(in srgb, var(--primary) 12%, var(--surface))", border: "1px solid var(--primary)", color: "var(--primary-texto, var(--primary))" }}>
                                {c?.nome ?? "?"}
                                <input type="number" min={1} value={qtdPorPessoa[id] ?? ""} onChange={(e) => setQtdPorPessoa((q) => ({ ...q, [id]: e.target.value }))}
                                  title="Quantidade só desta pessoa (vazio = usa a quantidade geral)" placeholder={qtd || "1"}
                                  style={{ width: 46, padding: "2px 5px", borderRadius: 7, border: "1px solid var(--primary)", background: "var(--surface)", color: "var(--text)", fontSize: 11.5, textAlign: "center" }} />
                                <button onClick={() => { setParaIds((p) => p.filter((x) => x !== id)); setQtdPorPessoa((q) => { const n = { ...q }; delete n[id]; return n; }); }} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary-texto, var(--primary))", display: "flex", padding: 0 }}><Icon name="x" size={13} color="var(--primary-texto)" /></button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <GlassSelect value="" onChange={(id) => { if (id) setParaIds((p) => p.includes(id) ? p : [...p, id]); }}
                        placeholder={paraIds.length ? "Adicionar outra pessoa…" : "Selecione uma ou mais pessoas…"}
                        options={colaboradores.filter((c) => !paraIds.includes(c.id)).map((c) => ({ value: c.id, label: c.departamento ? `${c.nome} · ${c.departamento}` : c.nome }))} />
                    </div>
                  )}
              </Field>
              <Field label="Detalhe (opcional)">
                <input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="observação" style={sel} />
              </Field>
              <Field label="Quantidade">
                <input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} style={sel} />
              </Field>
              <Field label="Tempo est. (min)">
                <input type="number" min={0} value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="—" style={sel} />
              </Field>
              {/* A dica ficava no `title` do seletor — só aparecia no hover, ou
                  seja, nunca no celular — e prometia a regra revogada ("ao
                  concluir, soma a quantidade feita no item do catálogo").
                  Concluir não soma mais nada: quem dá entrada é a conferência. */}
              <Field label="Produto (estoque)" dica="As peças entram no estoque quando alguém conferir — não ao concluir.">
                <GlassSelect value={produtoNome} onChange={setProdutoNome} placeholder="— nenhum —"
                  options={[{ value: "", label: "— nenhum —" }, ...produtos.map((p) => ({ value: p.nome, label: p.tipo ? `${p.nome} · ${p.tipo}` : p.nome }))]} />
              </Field>
              <Field label="Prazo (opcional)">
                <GlassDate value={prazo} onChange={setPrazo} placeholder="Prazo (opcional)" style={sel} />
              </Field>
              <Field label="Prioridade">
                <GlassSelect value={prioridade} onChange={(v) => setPrioridade(v as Prioridade)}
                  options={PRIORIDADES.map((p) => ({ value: p, label: ROTULO_PRIORIDADE[p] }))} />
              </Field>
              <Botao variante="primario" onClick={criar} disabled={busy}>
                {busy ? "Salvando…" : pool ? "Enviar pro pool" : paraIds.length > 1 ? `Atribuir a ${paraIds.length} pessoas` : "Atribuir"}
              </Botao>
            </div>
            {/* Pool: cai pro tablet do primeiro que ficar livre (modelo Uber). */}
            <button type="button" onClick={() => setPool((v) => !v)} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 13px", color: pool ? "var(--on-primary, #fff)" : "var(--text-dim)", background: pool ? "var(--primary-acao, var(--primary))" : "var(--surface)" }}>
              <TrocaIcone ligado={pool} a="circle" b="circle-check" size={16} corA="var(--text-dim)" corB="#fff" />
              Pool do setor — cai no tablet do funcionário livre (pode combinar com pessoas específicas)
            </button>

            {/* Entrega: em qual tablet cai — ou, na dirigida, só no sistema. */}
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
              {pool ? (
                <Field label="Cai em qual tablet">
                  <GlassSelect value={mesaAlvo} onChange={setMesaAlvo} placeholder="Qualquer tablet do setor"
                    options={[{ value: "", label: "Qualquer tablet do setor" }, ...tablets.map((m) => ({ value: m, label: m }))]} />
                </Field>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Onde entregar?</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: entregaTablet ? 10 : 0 }}>
                    <button type="button" onClick={() => setEntregaTablet(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${entregaTablet ? "var(--primary)" : "var(--border)"}`, background: entregaTablet ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: entregaTablet ? "var(--primary-texto)" : "var(--text-dim)" }}>
                      <Icon name="device-mobile" size={15} color={entregaTablet ? "var(--primary-texto)" : "var(--text-dim)"} /> Num tablet
                    </button>
                    <button type="button" onClick={() => setEntregaTablet(false)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${!entregaTablet ? "var(--primary)" : "var(--border)"}`, background: !entregaTablet ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: !entregaTablet ? "var(--primary-texto)" : "var(--text-dim)" }}>
                      <Icon name="checklist" size={15} color={!entregaTablet ? "var(--primary-texto)" : "var(--text-dim)"} /> Só no sistema
                    </button>
                  </div>
                  {entregaTablet
                    ? <GlassSelect value={mesaAlvo} onChange={setMesaAlvo} placeholder={tablets.length ? "Escolha o tablet…" : "Nenhum tablet cadastrado"}
                        options={tablets.map((m) => ({ value: m, label: m }))} />
                    : <div style={{ fontSize: 12, color: "var(--text-dim)" }}>A pessoa vê a atividade em <strong>Minhas atividades</strong> (não cai em tablet).</div>}
                </>
              )}
            </div>
          </>
        )}
        {msg && (
          <div role={msg.ok ? "status" : "alert"} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--perigo)" }}>
            <Icon name={msg.ok ? "circle-check" : "alert-triangle"} size={15} color="currentColor" style={{ flex: "none" }} />
            <span>{msg.texto}</span>
          </div>
        )}
        {colaboradores.length === 0 && <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-dim)" }}>Nenhum colaborador sob sua hierarquia. (Defina o setor dos colaboradores em Colaboradores.)</div>}
      </div>
      </Envelope>
      )}

      {/* Lotes de produção gerados */}
      <VerMais label={embutido ? "Ver lotes de produção" : "Ver lotes e produtividade"}>
        <>
        <LotesProducao lista={lista} onCancelar={cancelarLote} />

      {/* Produtividade por colaborador — vira TABELA na tela de Produtividade,
          então aqui só sobrevive no uso avulso (rota /atividades). */}
      {!embutido && produtividade.length > 0 && (() => {
        const corEfic = (e: number | null) => e == null ? undefined : e >= 100 ? "var(--ok)" : e >= 70 ? "var(--atencao)" : "var(--perigo)";
        const g = produtividade.reduce((a, p) => ({ concluidas: a.concluidas + p.concluidas, total: a.total + p.total, feito: a.feito + p.feito, real: a.real + p.tempoRealMin, estim: a.estim + p.tempoEstimadoMin }), { concluidas: 0, total: 0, feito: 0, real: 0, estim: 0 });
        const mediaG = g.concluidas > 0 ? Math.round(g.real / g.concluidas) : 0;
        const eficG = g.real > 0 ? Math.round((g.estim / g.real) * 100) : null;
        const taxaG = g.total > 0 ? Math.round((g.concluidas / g.total) * 100) : 0;
        return (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 22, marginBottom: 8 }}>Produtividade por colaborador</h2>
          {/* Resumo geral do dia */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: 10, marginBottom: 14 }}>
            {([["circle-check", "Conclusão", `${g.concluidas}/${g.total} · ${taxaG}%`, undefined as string | undefined],
              ["box", "Peças feitas", String(g.feito), undefined],
              ["clock", "Tempo médio/atv", mediaG > 0 ? `${mediaG}min` : "—", undefined],
              ["bolt", "Eficiência média", eficG != null ? `${eficG}%` : "—", corEfic(eficG)]] as const).map(([ic, lb, vl, cor]) => (
              <div key={lb} className="glass glass-spec" style={{ padding: "12px 14px", borderRadius: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}><Icon name={ic} size={14} color={cor || "var(--text-dim)"} />{lb}</div>
                <div className="stat" style={{ fontSize: 22, marginTop: 4, color: cor || "var(--text)" }}>{vl}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
            {produtividade.map((p) => {
              const efic = p.tempoEstimadoMin > 0 && p.tempoRealMin > 0 ? Math.round((p.tempoEstimadoMin / p.tempoRealMin) * 100) : null;
              const media = p.concluidas > 0 && p.tempoRealMin > 0 ? Math.round(p.tempoRealMin / p.concluidas) : null;
              const taxa = p.total > 0 ? Math.round((p.concluidas / p.total) * 100) : 0;
              return (
                <div key={p.para_id} className="glass glass-spec" style={{ padding: 14, borderRadius: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <Icon name="user" size={15} /><strong style={{ fontSize: 14 }}>{p.nome}</strong>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>{p.concluidas}/{p.total} ok</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: grade(130, 2, 8), gap: 8, fontSize: 12.5 }}>
                    <Stat label="Feito / alvo" value={`${p.feito}/${p.alvo}`} />
                    <Stat label="Conclusão" value={`${taxa}%`} cor={taxa >= 80 ? "var(--ok)" : taxa >= 40 ? "var(--atencao)" : undefined} />
                    <Stat label="Média / atv" value={media != null ? `${media}min` : "—"} />
                    <Stat label="Eficiência" value={efic != null ? `${efic}%` : "—"} cor={corEfic(efic)} />
                  </div>
                  {p.tempoRealMin > 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                      <span>Tempo real <strong style={{ color: "var(--text)" }}>{p.tempoRealMin}min</strong></span>
                      <span>meta {p.tempoEstimadoMin}min</span>
                    </div>
                  )}
                  {p.pendentes + p.emAndamento > 0 && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{p.pendentes + p.emAndamento} em aberto</div>}
                </div>
              );
            })}
          </div>
        </>
        );
      })()}

        </>
      </VerMais>

      {/* Impedimentos (o que travou — reportado pelos colaboradores no app) */}
      {(() => {
        const imped = lista.filter((a) => a.impedida && a.status !== "concluida");
        if (imped.length === 0) return null;
        return (
          <div style={{ marginTop: 22, borderRadius: 16, padding: 16, background: "color-mix(in srgb, var(--perigo) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--perigo) 35%, transparent)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon name="alert-triangle" size={18} color="var(--perigo)" />
              <strong style={{ fontSize: 15, color: "var(--perigo)" }}>Atividades impedidas ({imped.length})</strong>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>reportadas pelos colaboradores</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
              {imped.map((a) => (
                <div key={a.id} className="glass" style={{ padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{a.categoria}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{a.tarefa}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--perigo)", marginTop: 6, fontWeight: 600 }}>
                    <Icon name="alert-triangle" size={14} color="var(--perigo)" /> {a.motivo_impedimento || "Sem motivo informado"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}><Icon name="user" size={12} /> {a.para_nome}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}


      {!celular && buscaEQuadro}

      <VerMais label="Ver histórico de atividades">
        <Historico colaboradores={colaboradores} onFoto={setFoto} />
      </VerMais>

      {foto && <Lightbox src={foto} onClose={() => setFoto(null)} />}
      {pecasAberto && <PecasModal tarefasConhecidas={CATALOGO.map((c) => c.nome)} onFechar={() => setPecasAberto(false)} />}
      {materialDe && (
        <MaterialDaAtividade
          atividade={materialDe}
          onFechar={() => setMaterialDe(null)}
          // Bipou dentro do painel: o selo do card tem que acompanhar, senão a
          // pessoa fecha o painel e o quadro continua dizendo "nada consumido".
          onMudou={() => setVersaoConsumo((v) => v + 1)}
        />
      )}
      {gerarAberto && <GerarProducaoModal podeEditar={podeConfigurar} produtosEstoque={produtos.map((p) => p.nome)} colaboradores={colaboradores} tablets={tablets} onFechar={() => setGerarAberto(false)} onGerado={(n) => { setGerarAberto(false); toast.ok(`${n} ordem(ns) criada(s).`); recarregar(); }} />}
    </div>
  );
}

// Envelope do formulário de atribuição: painel lateral quando a tela está
// embutida em "Produtividade & metas", e nada (o próprio bloco na página)
// quando o AtividadesClient roda sozinho. Um componente e não um `? :` no meio
// do JSX porque o conteúdo é o MESMO — o que muda é só onde ele mora.
function Envelope({ embutido, aberto, onFechar, children }: { embutido?: boolean; aberto: boolean; onFechar: () => void; children: React.ReactNode }) {
  if (!embutido) return <>{children}</>;
  if (!aberto) return null;
  return (
    <PainelLateral titulo="Nova atividade" subtitulo="setor, tarefa, pessoas e onde entregar" largura={640} onFechar={onFechar}>
      {children}
    </PainelLateral>
  );
}

// Faixa de abas do quadro no celular. A fundação (.tab-strip) faz rolar de lado
// quando não cabe; aqui só trazemos a aba atual pra vista.
function QuadroAbas({ atual, onTrocar, contagem }: { atual: ColunaQuadro; onTrocar: (s: ColunaQuadro) => void; contagem: (s: ColunaQuadro) => number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [atual]);
  return (
    <div ref={ref} className="tab-strip" style={{ background: "var(--seg-track)", border: "1px solid var(--border)" }}>
      {(["pendente", "em_andamento", "concluida"] as ColunaQuadro[]).map((st) => {
        const on = st === atual;
        return (
          <button key={st} onClick={() => onTrocar(st)} aria-current={on ? "page" : undefined}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: on ? "var(--seg-pill)" : "transparent", color: on ? "var(--text)" : "var(--text-dim)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: STATUS_COR[st], flex: "none" }} />
            {STATUS_LABEL[st]}{st === "concluida" ? " (hoje)" : ""}
            <span style={{ fontSize: 12, opacity: 0.7 }}>{contagem(st)}</span>
          </button>
        );
      })}
    </div>
  );
}

// Painel de desempenho das atividades — KPIs do dia, presença, fila, atrasadas, tendência.
function Presenca({ cor, label, n }: { cor: string; label: string; n: number }) {
  return (
    <div>
      <div className="stat" style={{ fontSize: 24, color: cor }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

const PERIODOS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"]] as const;
type Periodo = (typeof PERIODOS)[number][0];

// `compacto` = o recorte, os KPIs e a presença já estão na tela que embute
// isto. Sobra a ANÁLISE: tendência, categorias, por setor, ranking e o que
// está travando. Nada some — muda de lugar, uma vez só.
function PainelAtividades({ lista, colaboradores, onRecarregar, compacto, periodoFixo, setorFixo, onSetor }: {
  lista: Atividade[]; colaboradores: Colaborador[]; onRecarregar: () => Promise<void> | void;
  compacto?: boolean; periodoFixo?: Periodo; setorFixo?: string; onSetor?: (s: string) => void;
}) {
  const [pres, setPres] = useState<{ presentes: number; almoco: number; saiu: number; ausentes: number } | null>(null);
  const [periodoLocal, setPeriodo] = useState<Periodo>("hoje");
  const [setorLocal, setSetorLocal] = useState<string>("");   // "" = todos os setores
  const [atualizando, setAtualizando] = useState(false);
  const periodo = periodoFixo ?? periodoLocal;
  const setorSel = setorFixo ?? setorLocal;
  // Clicar num setor no gráfico continua filtrando — só que agora o clique
  // move o filtro GLOBAL, e a tela inteira acompanha em vez de só este bloco.
  const setSetorSel = (s: string) => (onSetor ? onSetor(s) : setSetorLocal(s));
  const carregarPresenca = () => fetch("/api/ponto/status").then((r) => r.json()).then((d) => { if (d?.resumo) setPres(d.resumo); }).catch(() => {});
  useEffect(() => { if (!compacto) carregarPresenca(); }, [compacto]);
  async function atualizar() {
    setAtualizando(true);
    try { await Promise.all([Promise.resolve(onRecarregar()), carregarPresenca()]); } finally { setAtualizando(false); }
  }
  const periodoLabel = periodo === "hoje" ? "hoje" : periodo === "7d" ? "7 dias" : "30 dias";

  const deptoDe = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of colaboradores) map.set(c.id, c.departamento || c.setor || "—");
    return (id: string | null) => (id && map.get(id)) || "—";
  }, [colaboradores]);
  const setoresDisp = useMemo(() => [...new Set(colaboradores.map((c) => c.departamento || c.setor || "").filter(Boolean))].sort(), [colaboradores]);

  const m = useMemo(() => {
    const now = Date.now();
    const s = new Date(now - 3 * 3600 * 1000);
    const midnight = (off: number) => Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - off, 3, 0, 0);
    const desde = periodo === "hoje" ? midnight(0) : periodo === "7d" ? midnight(6) : midnight(29);
    const durMin = (a: Atividade) => (a.iniciada_at && a.concluida_at) ? (Date.parse(a.concluida_at) - Date.parse(a.iniciada_at)) / 60000 : null;

    // Escopo por setor: quando um setor é escolhido, só atividades da equipe dele.
    const base = setorSel ? lista.filter((a) => deptoDe(a.para_id) === setorSel) : lista;

    const concluidas = base.filter((a) => a.status === "concluida" && a.concluida_at);
    const conclPer = concluidas.filter((a) => Date.parse(a.concluida_at as string) >= desde);
    const emAndamento = base.filter((a) => a.status === "em_andamento" && a.iniciada_at);
    const atrasadas = emAndamento.filter((a) => a.tempo_estimado_min && (now - Date.parse(a.iniciada_at as string)) > a.tempo_estimado_min * 60000);
    const poolPend = base.filter((a) => a.status === "pendente" && a.pool && !a.para_id);
    const poolUrg = poolPend.filter((a) => a.urgente);
    const dirigidasPend = base.filter((a) => a.status === "pendente" && !!a.para_id);
    const pecas = conclPer.reduce((n, a) => n + (a.quantidade_feita || 0), 0);

    let real = 0, estim = 0, comTempo = 0;
    for (const a of conclPer) { const d = durMin(a); if (d && d > 0) { real += d; estim += a.tempo_estimado_min || 0; comTempo++; } }
    const mediaMin = comTempo > 0 ? Math.round(real / comTempo) : 0;
    const efic = real > 0 ? Math.round((estim / real) * 100) : null;

    // Tendência (7 ou 30 barras).
    const nDias = periodo === "30d" ? 30 : 7;
    const rotDia = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const dias: { rot: string; n: number }[] = [];
    for (let i = nDias - 1; i >= 0; i--) {
      const d0 = midnight(i), d1 = d0 + 24 * 3600 * 1000;
      const n = concluidas.filter((a) => Date.parse(a.concluida_at as string) >= d0 && Date.parse(a.concluida_at as string) < d1).length;
      const dd = new Date(d0 + 3 * 3600 * 1000);
      dias.push({ rot: nDias > 7 ? String(dd.getUTCDate()) : rotDia[dd.getUTCDay()], n });
    }

    // Ranking por pessoa.
    type P = { id: string; nome: string; feitas: number; pecas: number; real: number; nTempo: number };
    const pessoas = new Map<string, P>();
    for (const a of conclPer) {
      if (!a.para_id) continue;
      let p = pessoas.get(a.para_id); if (!p) { p = { id: a.para_id, nome: a.para_nome || "—", feitas: 0, pecas: 0, real: 0, nTempo: 0 }; pessoas.set(a.para_id, p); }
      p.feitas++; p.pecas += a.quantidade_feita || 0;
      const d = durMin(a); if (d && d > 0) { p.real += d; p.nTempo++; }
    }
    const arr = [...pessoas.values()];
    const maisFez = [...arr].sort((x, y) => y.feitas - x.feitas || y.pecas - x.pecas).slice(0, 6);
    const maisRapido = arr.filter((p) => p.nTempo >= 2).map((p) => ({ ...p, media: Math.round(p.real / p.nTempo) })).sort((x, y) => x.media - y.media).slice(0, 6);

    // Por setor/departamento.
    type S = { setor: string; feitas: number; pecas: number; real: number; estim: number; nTempo: number };
    const setores = new Map<string, S>();
    for (const a of conclPer) {
      const st = deptoDe(a.para_id);
      let x = setores.get(st); if (!x) { x = { setor: st, feitas: 0, pecas: 0, real: 0, estim: 0, nTempo: 0 }; setores.set(st, x); }
      x.feitas++; x.pecas += a.quantidade_feita || 0;
      const d = durMin(a); if (d && d > 0) { x.real += d; x.estim += a.tempo_estimado_min || 0; x.nTempo++; }
    }
    const porSetor = [...setores.values()].map((x) => ({ ...x, media: x.nTempo > 0 ? Math.round(x.real / x.nTempo) : null, efic: x.real > 0 ? Math.round((x.estim / x.real) * 100) : null })).sort((a, b) => b.feitas - a.feitas);

    // Tarefas mais lentas (média).
    type T = { tarefa: string; n: number; real: number };
    const tarefas = new Map<string, T>();
    for (const a of conclPer) { const d = durMin(a); if (!d || d <= 0) continue; let t = tarefas.get(a.tarefa); if (!t) { t = { tarefa: a.tarefa, n: 0, real: 0 }; tarefas.set(a.tarefa, t); } t.n++; t.real += d; }
    const lentas = [...tarefas.values()].filter((t) => t.n >= 2).map((t) => ({ ...t, media: Math.round(t.real / t.n) })).sort((a, b) => b.media - a.media).slice(0, 6);

    // Categorias em produção agora.
    const cat = new Map<string, number>();
    for (const a of [...emAndamento, ...poolPend, ...dirigidasPend, ...conclPer]) cat.set(a.categoria || "—", (cat.get(a.categoria || "—") || 0) + 1);
    const topCat = [...cat.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);

    return { conclPer, emAndamento, atrasadas, poolPend, poolUrg, dirigidasPend, pecas, mediaMin, efic, dias, maisFez, maisRapido, porSetor, lentas, topCat };
  }, [lista, periodo, setorSel, deptoDe]);

  const corEfic = m.efic == null ? undefined : m.efic >= 100 ? "var(--ok)" : m.efic >= 70 ? "var(--atencao)" : "var(--perigo)";
  const maxDia = Math.max(1, ...m.dias.map((d) => d.n));
  const maxCat = Math.max(1, ...m.topCat.map(([, n]) => n));
  const maxSetor = Math.max(1, ...m.porSetor.map((x) => x.feitas));
  const medalha = MEDALHA;
  // Mesma anatomia dos números da tela de Produtividade: o ícone num disco à
  // esquerda, rótulo e valor à direita. Eram dois desenhos pro mesmo tipo de
  // bloco em telas que se abrem uma dentro da outra.
  const kpi = (icon: string, label: string, value: React.ReactNode, cor?: string, sub?: React.ReactNode) => (
    <div className="glass glass-spec" style={{ padding: "13px 15px", borderRadius: 14, display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
      <ChipIcone icone={icon} tom="neutro" size={38} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        <div className="stat" style={{ fontSize: 24, marginTop: 1, color: cor || "var(--text)", lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--perigo)", marginTop: 1, fontWeight: 700 }}>{sub}</div>}
      </div>
    </div>
  );
  const painel: React.CSSProperties = { padding: 16, borderRadius: 14 };
  const tituloPainel = (icon: string, txt: string) => <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Icon name={icon} size={15} /> {txt}</div>;

  return (
    <div style={{ marginTop: compacto ? 0 : 18 }}>
      {/* Filtros: período + setor. Embutido, quem manda é a barra global da
          tela — esta fileira era a SEGUNDA cópia dos mesmos chips. */}
      {!compacto && (
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* `.hr-chip` da fundação, e não três cópias de um pill escrito à
            mão: a barra de filtro da tela de Produtividade já usa esta classe,
            e os dois desenhos lado a lado — mesmo filtro, aparência diferente —
            eram o que fazia a análise parecer outra tela. */}
        <div className="tab-strip" style={{ gap: 7, flex: "0 1 auto", minWidth: 0, overflowX: "auto" }}>
          {PERIODOS.map(([k, lb]) => (
            <button key={k} type="button" className="hr-chip" aria-pressed={periodo === k} onClick={() => setPeriodo(k)}>{lb}</button>
          ))}
          {setoresDisp.length > 0 && <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 3px", flex: "none" }} />}
          {setoresDisp.length > 0 && (
            <button type="button" className="hr-chip" aria-pressed={!setorSel} onClick={() => setSetorSel("")}>Todos os setores</button>
          )}
          {setoresDisp.map((st) => (
            <button key={st} type="button" className="hr-chip" aria-pressed={setorSel === st} onClick={() => setSetorSel(st === setorSel ? "" : st)}>{st}</button>
          ))}
        </div>
        <button type="button" className="hr-chip" onClick={atualizar} disabled={atualizando} title="Atualizar dados do painel"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, opacity: atualizando ? 0.6 : 1 }}>
          <Icon name="refresh" size={14} color="currentColor" /> {atualizando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      )}
      {!compacto && setorSel && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: -6, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><Icon name="building-warehouse" size={14} color="var(--primary-texto)" /> Analisando o setor <strong style={{ color: "var(--text)" }}>{setorSel}</strong> · {periodoLabel}</div>}

      {/* KPIs (concluídas/peças/tempo/eficiência = período; em andamento/fila/aceite/atrasadas = agora).
          Embutido, estes oito viraram a faixa de quatro no topo mais o "Resumo
          operacional" da coluna de apoio — os mesmos números, uma vez só. */}
      {!compacto && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 190px), 1fr))", gap: 10 }}>
        {kpi("circle-check", `Concluídas (${periodoLabel})`, m.conclPer.length, "var(--ok)")}
        {kpi("box", `Peças (${periodoLabel})`, m.pecas)}
        {kpi("clock", "Tempo médio/atv", m.mediaMin > 0 ? `${m.mediaMin}min` : "—")}
        {kpi("bolt", "Eficiência", m.efic != null ? `${m.efic}%` : "—", corEfic)}
        {kpi("player-play", "Em andamento", m.emAndamento.length, "var(--primary-texto)")}
        {kpi("device-mobile", "Na fila (pool)", m.poolPend.length, undefined, m.poolUrg.length > 0 ? `${m.poolUrg.length} urgente(s)` : undefined)}
        {kpi("bell", "Aguardando aceite", m.dirigidasPend.length)}
        {kpi("alert-triangle", "Atrasadas", m.atrasadas.length, m.atrasadas.length > 0 ? "var(--perigo)" : undefined)}
      </div>
      )}

      {/* Presença + tendência + categorias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12, marginTop: compacto ? 0 : 12 }}>
        {!compacto && (
        <div className="glass glass-spec" style={painel}>
          {tituloPainel("users", "Presença agora")}
          {pres ? (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Presenca cor="var(--ok)" label="Presentes" n={pres.presentes} />
              <Presenca cor="var(--atencao)" label="Almoço" n={pres.almoco} />
              <Presenca cor="var(--text-dim)" label="Fora" n={pres.saiu + pres.ausentes} />
            </div>
          ) : <div style={{ fontSize: 12, color: "var(--text-dim)" }}>—</div>}
        </div>
        )}

        <div className="glass glass-spec" style={painel}>
          {tituloPainel("chart-bar", `Concluídas · ${m.dias.length} dias`)}
          <div style={{ display: "flex", alignItems: "flex-end", gap: m.dias.length > 7 ? 2 : 6, height: 60 }}>
            {m.dias.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div title={String(d.n)} style={{ width: "100%", height: `${Math.round((d.n / maxDia) * 46) + 3}px`, background: i === m.dias.length - 1 ? "var(--primary)" : "color-mix(in srgb, var(--primary) 45%, transparent)", borderRadius: 3 }} />
                {m.dias.length <= 7 && <span style={{ fontSize: 9.5, color: "var(--text-dim)" }}>{d.rot}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="glass glass-spec" style={painel}>
          {tituloPainel("box", "Em produção · categorias")}
          {m.topCat.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Nada agora.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {m.topCat.map(([c, n]) => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ width: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)" }}>{c}</span>
                  <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 999 }}>
                    <div style={{ width: `${Math.round((n / maxCat) * 100)}%`, height: "100%", background: "var(--primary)", borderRadius: 999 }} />
                  </div>
                  <strong style={{ width: 20, textAlign: "right" }}>{n}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Por setor + rankings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12, marginTop: 12 }}>
        {/* Por setor (só quando NÃO está filtrado por um setor) */}
        {!setorSel && (
        <div className="glass glass-spec" style={painel}>
          {tituloPainel("building-warehouse", `Por setor · ${periodoLabel}`)}
          {m.porSetor.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Sem conclusões no período.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {m.porSetor.map((x) => (
                // <button> em vez de <div onClick>: no toque a linha inteira vira
                // alvo (a fundação dá os 44px) e o teclado alcança o filtro.
                <button key={x.setor} onClick={() => setSetorSel(x.setor)} title={`Ver só ${x.setor}`}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: 0, border: "none", background: "none", color: "inherit", cursor: "pointer", font: "inherit" }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, marginBottom: 3 }}>
                    <strong>{x.setor}</strong>
                    <span style={{ color: "var(--text-dim)" }}>{x.feitas} atv · {x.pecas} pç{x.media != null ? ` · ${x.media}min` : ""}{x.efic != null ? ` · ${x.efic}%` : ""}</span>
                  </span>
                  <span style={{ display: "block", height: 7, background: "var(--surface-2)", borderRadius: 999 }}>
                    <span style={{ display: "block", width: `${Math.round((x.feitas / maxSetor) * 100)}%`, height: "100%", background: "var(--primary)", borderRadius: 999 }} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Quem mais fez */}
        <div className="glass glass-spec" style={painel}>
          {tituloPainel("crown", `Quem mais fez · ${periodoLabel}`)}
          {m.maisFez.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-dim)" }}>—</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {m.maisFez.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: i < 3 ? TINTA_MEDALHA : "var(--text-dim)", background: i < 3 ? medalha[i] : "var(--surface-2)" }}>{i + 1}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: i === 0 ? 800 : 600 }}>{p.nome}</span>
                  <strong>{p.feitas}</strong><span style={{ fontSize: 11, color: "var(--text-dim)" }}>atv · {p.pecas}pç</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mais rápido (média) */}
        <div className="glass glass-spec" style={painel}>
          {tituloPainel("bolt", `Mais rápido · média · ${periodoLabel}`)}
          {m.maisRapido.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Poucos dados (mín. 2 concluídas).</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {m.maisRapido.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: i < 3 ? TINTA_MEDALHA : "var(--text-dim)", background: i < 3 ? medalha[i] : "var(--surface-2)" }}>{i + 1}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: i === 0 ? 800 : 600 }}>{p.nome}</span>
                  <strong style={{ color: "var(--ok)" }}>{p.media}min</strong><span style={{ fontSize: 11, color: "var(--text-dim)" }}>/atv</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tarefas mais lentas (gargalo por tipo) + atrasadas agora */}
      <div style={{ display: "grid", gridTemplateColumns: m.atrasadas.length > 0 ? "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" : "1fr", gap: 12, marginTop: 12 }}>
        {m.lentas.length > 0 && (
          <div className="glass glass-spec" style={painel}>
            {tituloPainel("clock", `Tarefas mais lentas · média · ${periodoLabel}`)}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {m.lentas.map((t) => (
                <div key={t.tarefa} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.tarefa}</span>
                  <strong style={{ color: t.media >= 90 ? "var(--perigo)" : "var(--text)" }}>{t.media}min</strong>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", width: 30, textAlign: "right" }}>×{t.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {m.atrasadas.length > 0 && (
          <div style={{ borderRadius: 14, padding: 14, background: "color-mix(in srgb, var(--perigo) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--perigo) 35%, transparent)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13.5, fontWeight: 700, color: "var(--perigo)" }}><Icon name="alert-triangle" size={16} color="var(--perigo)" /> Passando da meta agora ({m.atrasadas.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {m.atrasadas.slice(0, 8).map((a) => {
                const over = Math.round((Date.now() - Date.parse(a.iniciada_at as string)) / 60000 - (a.tempo_estimado_min || 0));
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.tarefa} <span style={{ color: "var(--text-dim)" }}>· {a.para_nome}</span></span>
                    <strong style={{ color: "var(--perigo)" }}>+{over}min</strong>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Modelo editável de uma ordem (espelha lib/producao-modelos.ModeloOrdem no cliente).
interface ModeloRow {
  id?: string; produto: string; fase: number; categoria: string; tarefa: string;
  detalhe: string | null; por_meta: number; controla_qtd: boolean;
  produto_id: number | null; produto_nome: string | null; instrucoes: string | null; demo_url: string | null; urgente?: boolean; ordem: number;
}

async function uploadArquivo(file: File): Promise<string> {
  const fd = new FormData(); fd.append("file", file); fd.append("bucket", "photos");
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d.error || "falha no upload");
  return d.url as string;
}

// Seletor de pessoa com BUSCA + filtro por DEPARTAMENTO (produção só produção,
// logística só logística…). value = id do colaborador; "" = pool.
function PessoaPicker({ colaboradores, value, onChange, defaultDepto, botao }: { colaboradores: Colaborador[]; value: string; onChange: (id: string) => void; defaultDepto?: string; botao?: (label: string) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [depto, setDepto] = useState<string>(defaultDepto ?? "");
  const anchorRef = useRef<HTMLDivElement>(null);
  const celular = useIsMobile();
  const [rect, setRect] = useState<{ top: number; left: number; w: number } | null>(null);
  // Sem clamp o `innerWidth - 342` dava -22 em 320px e o painel nascia FORA da
  // tela. Agora largura e posição ficam presas dentro da viewport (8px de folga).
  const abrir = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) {
      const w = Math.min(330, window.innerWidth - 16);
      const alt = 340;   // altura típica do painel (busca + chips + lista)
      setRect({
        top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - alt - 8)),
        left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
        w,
      });
    }
    setOpen((v) => !v);
  };
  const nm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const deptos = useMemo(() => [...new Set(colaboradores.map((c) => c.departamento || "").filter(Boolean))].sort(), [colaboradores]);
  const filtered = useMemo(() => colaboradores.filter((c) => (!depto || (c.departamento || "") === depto) && (!q || nm(c.nome).includes(nm(q)))), [colaboradores, depto, q]);
  const cur = colaboradores.find((c) => c.id === value);
  const label = cur ? `Para ${cur.nome}` : "Pool";
  const chip = (txt: string, active: boolean, on: () => void) => (
    <button key={txt} onClick={on} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`, background: active ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: active ? "var(--primary-texto)" : "var(--text-dim)" }}>{txt}</button>
  );
  const row = (key: string, sel: boolean, txt: string, on: () => void) => (
    <button key={key} onClick={on} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: sel ? 800 : 600, color: sel ? "var(--primary-texto)" : "var(--text)", background: sel ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent" }}>{txt}</button>
  );
  return (
    <div ref={anchorRef} style={{ display: botao ? "inline-block" : "block" }}>
      {botao ? <div onClick={abrir} style={{ cursor: "pointer" }}>{botao(label)}</div>
        : <button onClick={abrir} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--surface)", border: `1px solid ${value ? "var(--primary)" : "var(--border)"}`, borderRadius: 8, padding: "4px 9px", fontSize: 11.5, fontWeight: 700, color: value ? "var(--primary-texto)" : "var(--text-dim)", cursor: "pointer", maxWidth: "100%" }}>
          <TrocaIcone ligado={!!value} a="device-mobile" b="user" size={13} corA="var(--text-dim)" corB="var(--primary-texto)" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value ? label : "Pool — quem está livre"}</span>
        </button>}
      {open && rect && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2000 }} />
          <div style={{ position: "fixed", zIndex: 2001, top: rect.top, left: rect.left, width: rect.w, maxWidth: "calc(100vw - 16px)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 14px 44px rgba(0,0,0,.45)", padding: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "6px 9px" }}>
              <Icon name="search" size={14} color="var(--text-dim)" />
              {/* Sem foco automático no celular: o teclado subiria por cima do
                  próprio painel antes de a pessoa ver a lista. */}
              <input autoFocus={!celular} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar pessoa…" style={{ border: "none", background: "transparent", outline: "none", color: "var(--text)", fontSize: 13, width: "100%", minWidth: 0 }} />
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "8px 0" }}>
              {chip("Todos", !depto, () => setDepto(""))}
              {deptos.map((d) => chip(d, depto === d, () => setDepto(d)))}
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {row("__pool", !value, "Pool — cai pro tablet de quem está livre", () => { onChange(""); setOpen(false); })}
              {filtered.map((c) => row(c.id, c.id === value, `${c.nome}${c.departamento ? ` · ${c.departamento}` : ""}`, () => { onChange(c.id); setOpen(false); }))}
              {filtered.length === 0 && <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-dim)" }}>Ninguém neste filtro.</div>}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ── Modal "Gerar produção" — meta → ordens no pool "Produção" ────────────────
function GerarProducaoModal({ produtosEstoque, colaboradores, tablets, onFechar, onGerado, podeEditar = true }: { produtosEstoque: string[]; colaboradores: Colaborador[]; tablets: string[]; onFechar: () => void; onGerado: (criadas: number) => void; podeEditar?: boolean }) {
  const [mesaAlvoGerar, setMesaAlvoGerar] = useState("");   // "" = qualquer tablet do setor
  const [sel, setSel] = useState<Set<ProdutoProducao>>(new Set<ProdutoProducao>(["chancela"]));
  const [meta, setMeta] = useState(String(META_PADRAO));
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [modelos, setModelos] = useState<ModeloRow[] | null>(null);
  const [editar, setEditar] = useState(false);
  const [destinos, setDestinos] = useState<Record<number, string>>({});   // índice da ordem → colaborador (vazio = pool)
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());     // ordens DESMARCADAS (não vão ser criadas)
  useEffect(() => { setExcluidas(new Set()); }, [sel]);                    // troca de produto → reseta seleção
  const incluir = (i: number) => setExcluidas((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { fetch("/api/producao/modelos").then((r) => r.json()).then((d) => setModelos(d.modelos ?? [])).catch(() => setModelos([])); }, []);

  const metaN = Math.max(0, Math.round(Number(meta) || 0));
  const produtos = useMemo(() => PRODUTOS.filter((p) => sel.has(p)), [sel]);
  const preview = useMemo(() => {
    if (produtos.length === 0 || metaN < 1) return [] as { fase: number; categoria: string; tarefa: string; detalhe: string; quantidade_alvo: number; controlaQtd: boolean; instrucoes: string | null; demo_url: string | null; produto_nome: string | null; urgente: boolean }[];
    const doModelo = (modelos ?? []).filter((m) => (produtos as string[]).includes(m.produto));
    if (doModelo.length > 0) {
      return [...doModelo].sort((a, b) => a.fase - b.fase || a.ordem - b.ordem).map((m) => ({ fase: m.fase, categoria: m.categoria, tarefa: m.tarefa, detalhe: m.detalhe ?? "", quantidade_alvo: Math.max(1, Math.round((Number(m.por_meta) || 1) * metaN)), controlaQtd: m.controla_qtd, instrucoes: m.instrucoes, demo_url: m.demo_url, produto_nome: m.produto_nome, urgente: m.urgente === true }));
    }
    return gerarOrdens(produtos, metaN).map((o) => ({ ...o, instrucoes: null, demo_url: null, produto_nome: null, urgente: false }));
  }, [modelos, produtos, metaN]);
  const toggle = (p: ProdutoProducao) => setSel((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const nIncluidas = preview.filter((_, i) => !excluidas.has(i)).length;
  async function gerar() {
    if (produtos.length === 0 || metaN < 1 || nIncluidas === 0) return;
    setBusy(true);
    try {
      // Manda só as ordens MARCADAS (com destino por ordem: pool ou pessoa).
      const ordens = preview
        .map((o, i) => ({ categoria: o.categoria, tarefa: o.tarefa, detalhe: o.detalhe, quantidade_alvo: o.quantidade_alvo, fase: o.fase, produto_nome: o.produto_nome, instrucoes: o.instrucoes, demo_url: o.demo_url, urgente: o.urgente, para_id: destinos[i] || null, _i: i }))
        .filter((o) => !excluidas.has(o._i))
        .map(({ _i, ...o }) => { void _i; return o; });
      const enviar = (confirmarFlag: boolean) => fetch("/api/atividades/producao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordens, confirmar: confirmarFlag, mesa_alvo: mesaAlvoGerar || null }) });
      let r = await enviar(false);
      let d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.error === "nao_presente") {
        const ok = await confirmar(`${d.nome} não bateu ponto (não está na empresa). Lançar mesmo assim?`, { detalhe: "Cai no tablet da pessoa como pedido pra aceitar. Você é avisado quando ela aceitar." });
        if (!ok) return;
        r = await enviar(true); d = await r.json().catch(() => ({}));
      }
      if (!r.ok) { toast.erro(d?.error === "fora_da_hierarquia" ? "Você não pode atribuir a essa pessoa." : d?.detail || "Falha ao gerar."); return; }
      onGerado(d.criadas ?? nIncluidas);
    } finally { setBusy(false); }
  }

  if (!mounted) return null;
  if (editar) return <ModelosProducaoEditor produtosEstoque={produtosEstoque} modelosIniciais={modelos ?? []} onFechar={() => setEditar(false)} onSalvo={(ms) => setModelos(ms)} />;
  return createPortal(
    // .sheet-host/.sheet: no celular este modal cru vira folha presa embaixo, com
    // rolagem interna (o "Gerar" ficava fora da tela). O antigo marginTop:24 do
    // cartão virou padding do véu — no desktop o espaçamento é o mesmo.
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, padding: "48px 24px 24px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, borderRadius: 18, padding: 22, background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(0,0,0,.55)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text)" }}>Gerar produção</h3>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 16px" }}>Cria as ordens do dia no pool <strong>Produção</strong>. O tablet de quem está livre pega — limpezas antes das montagens.</p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {PRODUTOS.map((p) => {
            const on = sel.has(p);
            return (
              <button key={p} onClick={() => toggle(p)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`, background: on ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: on ? "var(--primary-texto)" : "var(--text)" }}>
                <TrocaIcone ligado={on} a="circle" b="circle-check" size={16} corA="var(--text-dim)" corB="var(--primary-texto)" /> {LABEL_PRODUTO[p]}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14, alignItems: "flex-end" }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Meta (unidades)</span>
            <input type="number" min={1} max={999} value={meta} onChange={(e) => setMeta(e.target.value)}
              style={{ width: 140, display: "block", marginTop: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 15, fontWeight: 700 }} />
          </label>
          <label style={{ display: "block", flex: 1, minWidth: 180 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Cai em qual tablet</span>
            <div style={{ marginTop: 6 }}>
              <GlassSelect value={mesaAlvoGerar} onChange={setMesaAlvoGerar} placeholder="Qualquer tablet do setor"
                options={[{ value: "", label: "Qualquer tablet do setor" }, ...tablets.map((m) => ({ value: m, label: m }))]} />
            </div>
          </label>
        </div>

        {/* Preview das ordens + destino em lote + editar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Vai criar {nIncluidas} de {preview.length} ordem(ns):</div>
            {preview.length > 0 && (
              <Botao tamanho="sm" icone={nIncluidas === preview.length ? "circle-check" : "circle"} onClick={() => setExcluidas(nIncluidas === preview.length ? new Set(preview.map((_, i) => i)) : new Set())}>
                {nIncluidas === preview.length ? "Desmarcar todas" : "Marcar todas"}
              </Botao>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {preview.length > 0 && (() => {
              const ids = preview.map((_, i) => destinos[i] || "");
              const todos = ids.every((x) => x === ids[0]) ? ids[0] : "";
              return (
                <PessoaPicker colaboradores={colaboradores} value={todos} defaultDepto="Produção"
                  onChange={(id) => setDestinos(id ? Object.fromEntries(preview.map((_, i) => [i, id])) : {})}
                  botao={(label) => (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--surface)", border: `1px solid ${todos ? "var(--primary)" : "var(--border)"}`, borderRadius: 9, padding: "5px 9px", fontSize: 12, fontWeight: 700, color: todos ? "var(--primary-texto)" : "var(--text-dim)" }}>
                      <Icon name="users" size={13} color={todos ? "var(--primary-texto)" : "var(--text-dim)"} /> Destino de todas: {todos ? label.replace(/^Para /, "") : "Pool"}
                    </span>
                  )} />
              );
            })()}
            {/* Mexer nos modelos é Atividades › Configurar: o PUT recusaria. */}
            {podeEditar && (
              <Botao tamanho="sm" icone="edit" onClick={() => setEditar(true)}>Editar ordens</Botao>
            )}
          </div>
        </div>
        <div className="glass" style={{ borderRadius: 12, maxHeight: 260, overflowY: "auto" }}>
          {preview.length === 0
            ? <div style={{ padding: 16, fontSize: 13, color: "var(--text-dim)" }}>Escolha produto(s) e uma meta ≥ 1.</div>
            : preview.map((o, i) => {
              const off = excluidas.has(i);
              return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderTop: i > 0 ? "1px solid var(--border)" : "none", opacity: off ? 0.4 : 1 }}>
                <button onClick={() => incluir(i)} title={off ? "Incluir esta ordem" : "Não criar esta ordem"} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flex: "none", lineHeight: 0 }}>
                  <TrocaIcone ligado={off} a="circle-check" b="circle" size={20} corA="var(--primary-texto)" corB="var(--text-dim)" />
                </button>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--primary-texto, var(--primary))", background: "color-mix(in srgb, var(--primary) 14%, transparent)", borderRadius: 6, padding: "1px 7px", flex: "none" }}>F{o.fase}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{o.tarefa} <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>· {o.categoria}</span></div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{o.detalhe}</div>
                  {(o.produto_nome || o.instrucoes || o.demo_url || o.urgente) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                      {o.urgente && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: "var(--perigo)", borderRadius: 999, padding: "1px 7px", display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="bolt" size={11} color="#fff" />URGENTE</span>}
                      {o.produto_nome && <span style={{ fontSize: 10.5, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="box" size={12} color="var(--text-dim)" />{o.produto_nome}</span>}
                      {o.instrucoes && <span style={{ fontSize: 10.5, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="file-text" size={12} color="var(--text-dim)" />instruções</span>}
                      {o.demo_url && <span style={{ fontSize: 10.5, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="photo" size={12} color="var(--text-dim)" />demo</span>}
                    </div>
                  )}
                  {/* Destino: pool (livre pega no tablet) ou uma pessoa específica (busca + filtro por depto). */}
                  <div style={{ marginTop: 5 }}>
                    <PessoaPicker colaboradores={colaboradores} value={destinos[i] ?? ""} defaultDepto="Produção"
                      onChange={(id) => setDestinos((d) => ({ ...d, [i]: id }))} />
                  </div>
                </div>
                <strong style={{ fontSize: 13, color: "var(--text)", flex: "none" }}>{o.controlaQtd ? `${o.quantidade_alvo}x` : "—"}</strong>
              </div>
            ); })}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <Botao onClick={onFechar} disabled={busy}>Cancelar</Botao>
          <Botao variante="primario" onClick={gerar} disabled={busy || nIncluidas === 0}>
            {busy ? "Gerando…" : `Gerar ${nIncluidas} ordem(ns)`}
          </Botao>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Editor de MODELOS de produção — edita as ordens de cada produto (tarefa, qtd,
// item do estoque, instruções e gif). Substitui a receita fixa. ────────────────
function ModelosProducaoEditor({ produtosEstoque, modelosIniciais, onFechar, onSalvo }: { produtosEstoque: string[]; modelosIniciais: ModeloRow[]; onFechar: () => void; onSalvo: (m: ModeloRow[]) => void }) {
  const [aba, setAba] = useSticky<ProdutoProducao>("atividades.produto", "chancela");
  const [draft, setDraft] = useState<Record<string, ModeloRow[]>>(() => {
    const d: Record<string, ModeloRow[]> = {};
    for (const p of PRODUTOS) d[p] = modelosIniciais.filter((m) => m.produto === p).sort((a, b) => a.ordem - b.ordem);
    return d;
  });
  const [busy, setBusy] = useState(false);
  const [upIdx, setUpIdx] = useState<number | null>(null);

  const rows = draft[aba] ?? [];
  const setRows = (fn: (r: ModeloRow[]) => ModeloRow[]) => setDraft((d) => ({ ...d, [aba]: fn(d[aba] ?? []) }));
  const patch = (i: number, p: Partial<ModeloRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...p } : row)));
  const addRow = () => setRows((r) => [...r, { produto: aba, fase: 1, categoria: LABEL_PRODUTO[aba], tarefa: "", detalhe: "", por_meta: 1, controla_qtd: true, produto_id: null, produto_nome: null, instrucoes: null, demo_url: null, urgente: false, ordem: r.length }]);
  const restaurarPadrao = () => setRows(() => RECEITAS[aba].map((e, i) => ({ produto: aba, fase: e.fase, categoria: e.categoria, tarefa: e.tarefa, detalhe: e.detalhe(30), por_meta: e.porMeta, controla_qtd: e.controlaQtd !== false, produto_id: null, produto_nome: null, instrucoes: null, demo_url: null, urgente: false, ordem: i })));
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  async function onGif(i: number, file: File) {
    setUpIdx(i);
    try { patch(i, { demo_url: await uploadArquivo(file) }); } catch { toast.erro("Falha no upload do gif/foto."); } finally { setUpIdx(null); }
  }

  async function salvar() {
    setBusy(true);
    try {
      const r = await fetch("/api/producao/modelos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produto: aba, ordens: rows.map((x, i) => ({ ...x, ordem: i })) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(d?.detail || "Falha ao salvar."); return; }
      onSalvo((d.modelos ?? []) as ModeloRow[]);
      toast.ok(`Modelo de ${LABEL_PRODUTO[aba]} salvo.`);
      onFechar();
    } finally { setBusy(false); }
  }

  const inp: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 10px", color: "var(--text)", fontSize: 13, fontWeight: 600 };
  return createPortal(
    // Mesma folha do "Gerar produção": editor cru vira folha no celular.
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1001, padding: "48px 24px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 640, borderRadius: 18, padding: 22, background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(0,0,0,.55)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--text)" }}>Editar ordens de produção</h3>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 14px" }}>Estas ordens viram as atividades ao gerar produção. Vincular um item do estoque é o que faz a atividade cair na fila de conferência ao ser concluída — é a conferência que dá entrada nas peças. Escreva a instrução e suba um gif do que fazer.</p>

        {/* .tab-strip (fundação): com 8 pools a fileira não cabe mais — rola de
            lado em vez de espremer/cortar as últimas abas. */}
        <div className="tab-strip" style={{ gap: 8, marginBottom: 14 }}>
          {PRODUTOS.map((p) => (
            <button key={p} onClick={() => setAba(p)} style={{ flex: "none", whiteSpace: "nowrap", padding: "8px 16px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${aba === p ? "var(--primary)" : "var(--border)"}`, background: aba === p ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: aba === p ? "var(--primary-texto)" : "var(--text)" }}>{LABEL_PRODUTO[p]}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "8px 2px" }}>Sem ordens. Adicione a primeira abaixo.</div>}
          {rows.map((row, i) => (
            <div key={i} className="glass" style={{ borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>Fase</span>
                <input type="number" min={1} max={9} value={row.fase} onChange={(e) => patch(i, { fase: Math.max(1, Number(e.target.value) || 1) })} style={{ ...inp, width: 56 }} />
                <input value={row.tarefa} onChange={(e) => patch(i, { tarefa: e.target.value })} placeholder="Tarefa (ex.: Montar base)" style={{ ...inp, flex: 1 }} />
                <BotaoIcone icone="trash" titulo="Remover" variante="perigo" onClick={() => removeRow(i)} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input value={row.categoria} onChange={(e) => patch(i, { categoria: e.target.value })} placeholder="Categoria" style={{ ...inp, width: 130 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>Qtd por meta</span>
                <input type="number" min={0} step="0.1" value={row.por_meta} onChange={(e) => patch(i, { por_meta: Number(e.target.value) || 0 })} style={{ ...inp, width: 72 }} />
                <button onClick={() => patch(i, { controla_qtd: !row.controla_qtd })} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: row.controla_qtd ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)", color: row.controla_qtd ? "var(--primary-texto)" : "var(--text-dim)" }}>
                  <TrocaIcone ligado={row.controla_qtd} a="circle" b="circle-check" size={14} corA="var(--text-dim)" corB="var(--primary-texto)" /> conta quantidade
                </button>
                <button onClick={() => patch(i, { urgente: !row.urgente })} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${row.urgente ? "var(--perigo)" : "var(--border)"}`, background: row.urgente ? "color-mix(in srgb, var(--perigo) 14%, transparent)" : "var(--surface)", color: row.urgente ? "var(--perigo)" : "var(--text-dim)" }}>
                  <Icon name="bolt" size={14} color={row.urgente ? "var(--perigo)" : "var(--text-dim)"} /> urgente
                </button>
              </div>
              <GlassSelect value={row.produto_nome ?? ""} onChange={(v) => patch(i, { produto_nome: v || null })} placeholder="Vincular item do estoque (opcional)"
                options={[{ value: "", label: "— nenhum —" }, ...produtosEstoque.map((n) => ({ value: n, label: n }))]} />
              <textarea value={row.instrucoes ?? ""} onChange={(e) => patch(i, { instrucoes: e.target.value || null })} placeholder="Instruções: o que a pessoa tem que fazer…" rows={2} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {row.demo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={row.demo_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flex: "none" }} />
                  : <span style={{ width: 48, height: 48, borderRadius: 8, background: "var(--surface-2)", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="photo" size={18} color="var(--text-dim)" /></span>}
                <label style={{ fontSize: 12.5, fontWeight: 700, color: "var(--primary-texto, var(--primary))", cursor: "pointer" }}>
                  {upIdx === i ? "Enviando…" : (row.demo_url ? "Trocar gif/foto" : "Subir gif/foto do que fazer")}
                  <input type="file" accept="image/*,image/gif" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onGif(i, f); }} />
                </label>
                {row.demo_url && <Botao variante="sutil" tamanho="sm" onClick={() => patch(i, { demo_url: null })}>remover</Botao>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Botao icone="plus" onClick={addRow} style={{ flex: 1 }}>Adicionar ordem</Botao>
          <Botao variante="sutil" icone="refresh" onClick={restaurarPadrao} title="Volta as ordens deste produto pra receita original">Restaurar padrão</Botao>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <Botao onClick={onFechar} disabled={busy}>Voltar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={busy}>
            {busy ? "Salvando…" : `Salvar ${LABEL_PRODUTO[aba]}`}
          </Botao>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Lotes de produção gerados (agrupa por lote; cancelar o que sobrou no pool) ─
function LotesProducao({ lista, onCancelar }: { lista: Atividade[]; onCancelar: (lote: string) => void }) {
  const lotes = useMemo(() => {
    const m = new Map<string, Atividade[]>();
    for (const a of lista) if (a.lote) (m.get(a.lote) ?? m.set(a.lote, []).get(a.lote)!).push(a);
    return [...m.entries()].sort((a, b) => String(b[1][0].created_at || "").localeCompare(String(a[1][0].created_at || "")));
  }, [lista]);
  if (lotes.length === 0) return null;
  const fmt = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");

  /**
   * Lote que ainda tem ordem no POOL é o único que pede alguma coisa — é o
   * único com botão ("Cancelar N do pool"). O resto é histórico.
   *
   * Antes vinham todos numa grade só, sem limite: medido nesta tela, 37 lotes
   * ocupando 5501px — 65% de uma página de 8406px. E essa seção só cresce,
   * porque todo lote já gerado fica ali pra sempre; daqui a um ano seriam
   * centenas. O que exige ação vem primeiro, o histórico fica a um clique.
   */
  const pendentes = lotes.filter(([, o]) => o.some((a) => a.pool && a.status === "pendente" && !a.para_id));
  const fechados = lotes.filter((l) => !pendentes.includes(l));

  const Grade = ({ itens }: { itens: typeof lotes }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
      {itens.map(([lote, ords]) => {
          const noPool = ords.filter((a) => a.pool && a.status === "pendente" && !a.para_id).length;
          const andamento = ords.filter((a) => a.status === "em_andamento").length;
          const concl = ords.filter((a) => a.status === "concluida").length;
          const cats = [...new Set(ords.map((a) => a.categoria))].join(" + ");
          return (
            <div key={lote} className="glass glass-spec" style={{ padding: 14, borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon name="box" size={15} color="var(--primary-texto)" />
                <strong style={{ fontSize: 14 }}>{cats || "Produção"}</strong>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-dim)" }}>{ords.length} ordens</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>{ords[0].created_at ? fmt(ords[0].created_at) : ""}</div>
              <div style={{ display: "grid", gridTemplateColumns: grade(88, 3, 8), gap: 8, fontSize: 12.5, marginBottom: 10 }}>
                <Stat label="No pool" value={String(noPool)} cor={noPool > 0 ? "var(--atencao)" : undefined} />
                <Stat label="Em andamento" value={String(andamento)} />
                <Stat label="Concluídas" value={String(concl)} cor={concl > 0 ? "var(--ok)" : undefined} />
              </div>
              {noPool > 0 && (
                <Botao variante="perigo" tamanho="sm" bloco onClick={() => onCancelar(lote)}>Cancelar {noPool} do pool</Botao>
              )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ marginTop: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        Produção gerada
        {pendentes.length > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", marginLeft: 8 }}>· {pendentes.length} com ordem no pool</span>}
      </h2>
      {pendentes.length > 0 && <Grade itens={pendentes} />}
      {fechados.length > 0 && (
        <details style={{ marginTop: pendentes.length ? 14 : 0 }}>
          <summary style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", cursor: "pointer", minHeight: "var(--tap)", display: "flex", alignItems: "center" }}>
            {pendentes.length ? "Lotes já distribuídos" : "Lotes gerados"} · {fechados.length}
          </summary>
          <div style={{ marginTop: 8 }}><Grade itens={fechados} /></div>
        </details>
      )}
    </div>
  );
}

// Visualizador de foto em tela cheia (comprovação da atividade).
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  // Portado pro <body>: os cards são `.glass` (backdrop-filter), que vira bloco de
  // contenção do position:fixed — sem o portal a imagem saía do centro e ficava
  // minúscula flutuando no canto (o bug do print). O <body> não tem esse filtro.
  return createPortal(
    <div onClick={onClose} className="apple-backdrop sheet-host" style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.8)", display: "grid", placeItems: "center", padding: 24, cursor: "zoom-out" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Comprovação" style={{ maxWidth: "92vw", maxHeight: "88dvh", width: "auto", height: "auto", objectFit: "contain", borderRadius: 16, boxShadow: "0 20px 80px rgba(0,0,0,.6)" }} />
      {/* top/right com área segura: no celular com notch o botão nascia embaixo da barra. */}
      <button className="ui-toque" onClick={onClose} title="Fechar" style={{ position: "fixed", top: "max(20px, var(--safe-t))", right: "max(22px, var(--safe-r))", width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.15)", display: "grid", placeItems: "center", cursor: "pointer" }}><Icon name="x" size={20} color="#fff" /></button>
    </div>,
    document.body,
  );
}

// ── Histórico de atividades concluídas, agrupado por dia (quem fez, o quê). ──
function Historico({ colaboradores, onFoto }: { colaboradores: Colaborador[]; onFoto: (src: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Atividade[] | null>(null);
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [soComFoto, setSoComFoto] = useState(false);

  useEffect(() => {
    if (!aberto || itens) return;
    fetch("/api/atividades/historico", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItens(d.atividades ?? []))
      .catch(() => setItens([]));
  }, [aberto, itens]);

  async function remover(a: Atividade) {
    if (!(await confirmar(`Remover do histórico a atividade "${a.tarefa}" de ${a.para_nome}?`, { perigo: true }))) return;
    setItens((p) => (p ?? []).filter((x) => x.id !== a.id));
    const r = await fetch(`/api/atividades?id=${a.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      setItens((p) => (p ?? []).some((x) => x.id === a.id) ? p : [a, ...(p ?? [])]);
      toast.erro(`Não foi possível remover "${a.tarefa}" do histórico.`);
    }
  }

  const visiveis = useMemo(() => (itens ?? []).filter((a) =>
    (!filtroPessoa || a.para_id === filtroPessoa) && (!soComFoto || !!a.foto_url)
  ), [itens, filtroPessoa, soComFoto]);

  const porDia = useMemo(() => {
    const map = new Map<string, Atividade[]>();
    for (const a of visiveis) {
      const iso = a.concluida_at || a.created_at;
      const dia = new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      (map.get(dia) ?? map.set(dia, []).get(dia)!).push(a);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visiveis]);

  const fmtDia = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  const fmtHora = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(11, 16) : "";

  return (
    <div style={{ marginTop: 24 }}>
      <Botao icone="calendar" iconeFim={aberto ? "chevron-up" : "chevron-down"} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        Histórico de atividades
      </Botao>

      {aberto && (
        <div style={{ marginTop: 14 }}>
          {/* Filtros do histórico */}
          {itens && itens.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <GlassSelect value={filtroPessoa} onChange={setFiltroPessoa} style={{ width: 200 }}
                options={[{ value: "", label: "Todas as pessoas" }, ...colaboradores.map((c) => ({ value: c.id, label: c.nome }))]} />
              <button onClick={() => setSoComFoto((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", color: soComFoto ? "var(--on-primary, #fff)" : "var(--text-dim)", background: soComFoto ? "var(--primary-acao, var(--primary))" : "var(--surface)" }}>
                <Icon name="photo-question" size={15} color={soComFoto ? "#fff" : "var(--text-dim)"} /> Só com foto
              </button>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{visiveis.length} atividade(s)</span>
            </div>
          )}
          {itens === null ? (
            <div style={{ color: "var(--text-dim)", fontSize: 14 }}>Carregando…</div>
          ) : porDia.length === 0 ? (
            <div className="glass" style={{ padding: 18, borderRadius: 14, color: "var(--text-dim)", fontSize: 14 }}>Nenhuma atividade {itens && itens.length > 0 ? "nesse filtro" : "concluída ainda"}.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {porDia.map(([dia, lista]) => (
                <div key={dia}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <Icon name="circle-check" size={15} color="var(--ok)" />
                    <strong style={{ fontSize: 15 }}>{fmtDia(dia)}</strong>
                    <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>· {lista.length} concluída(s)</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
                    {lista.map((a) => (
                      <div key={a.id} className="glass glass-spec" style={{ padding: 12, borderRadius: 14, display: "flex", gap: 10 }}>
                        {a.foto_url ? (
                          <button onClick={() => onFoto(a.foto_url!)} title="Ver foto" style={{ padding: 0, border: "none", background: "none", borderRadius: 11, cursor: "zoom-in", flex: "none", lineHeight: 0 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.foto_url} alt="Comprovação" style={{ width: 60, height: 60, borderRadius: 11, objectFit: "cover", display: "block" }} />
                          </button>
                        ) : (
                          <span style={{ width: 60, height: 60, borderRadius: 11, background: "var(--surface-2)", flex: "none", display: "grid", placeItems: "center" }}><Icon name="circle-check" size={22} color="var(--ok)" /></span>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{a.categoria}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.tarefa}</div>
                          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                            <Icon name="user" size={12} /> {a.para_nome} · {fmtHora(a.concluida_at)}
                            {a.quantidade_feita > 0 && ` · ${a.quantidade_feita} feito`}
                          </div>
                        </div>
                        <BotaoIcone icone="trash" titulo="Remover" tamanho="sm" onClick={() => remover(a)} style={{ flex: "none", alignSelf: "flex-start" }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ a, onMove, onRemove, onFoto, sel, onToggleSel, consumo, onMaterial }: {
  a: Atividade; onMove: (id: string, s: AtividadeStatus) => void; onRemove: (a: Atividade) => void;
  onFoto?: (src: string) => void; sel?: boolean; onToggleSel?: (id: string) => void;
  /** O que já saiu do estoque por conta desta atividade (selo do card). */
  consumo?: ResumoConsumo;
  onMaterial?: (a: Atividade) => void;
}) {
  const ap = aparenciaDoEstagio(a);
  const noEstoque = jaEntrouNoEstoque(a);

  // Atividade conferida antes da conferência sair (11/09/2026): as peças dela
  // entraram no estoque e reabrir não desfaz isso. O botão continua existindo
  // (às vezes é mesmo o que se quer), mas avisa o que ele NÃO desfaz.
  async function mover(status: AtividadeStatus) {
    if (noEstoque && status !== "concluida") {
      const ok = await confirmar(`Reabrir "${a.tarefa}"?`, {
        detalhe: "Esta atividade foi conferida e as peças já entraram no estoque — reabrir não desfaz isso.",
        perigo: true,
      });
      if (!ok) return;
    }
    onMove(a.id, status);
  }

  return (
    <div className="glass glass-spec" style={{ padding: 14, borderRadius: 14, border: sel ? "1.5px solid var(--primary)" : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {onToggleSel && (
          // padding 12 + margem -12: o alvo de toque fica 44x44 mas a caixa
          // continua ocupando 20x20 no layout (desktop idêntico).
          <button onClick={() => onToggleSel(a.id)} title="Selecionar" style={{ background: "none", border: "none", cursor: "pointer", padding: 12, margin: "-10px -12px -12px", flex: "none", lineHeight: 0, display: "grid", placeItems: "center" }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", background: sel ? "var(--primary)" : "transparent", border: sel ? "none" : "1.5px solid var(--border)" }}>{sel && <Icon name="check" size={13} color="var(--on-primary)" />}</span>
          </button>
        )}
        {a.foto_url && (
          // Foto clicável precisa ser <button>: como <img> não abre no teclado.
          <button onClick={() => onFoto?.(a.foto_url!)} title="Ver foto" style={{ padding: 0, border: "none", background: "none", borderRadius: 10, cursor: "zoom-in", flex: "none", lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.foto_url} alt="Comprovação" style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", display: "block" }} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {/* Veio da varredura de reposição, não de uma pessoa. Selo, não
                texto: a procedência não pode ocupar o lugar da instrução. */}
            {nascidaDaAutomacao(a) && (
              <span title="Criada pela reposição automática do estoque" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--info)", background: "color-mix(in srgb, var(--info) 14%, transparent)", padding: "1px 6px", borderRadius: 999, letterSpacing: 0 }}>
                <Icon name="robot" size={11} color="var(--info)" /> reposição
              </span>
            )}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{a.categoria}{a.produto_nome ? ` · ${a.produto_nome}` : ""}</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, margin: "4px 0 8px" }}>{a.tarefa}</div>
        </div>
        <BotaoIcone icone="trash" titulo="Remover" tamanho="sm" onClick={() => onRemove(a)} style={{ flex: "none" }} />
      </div>
      {a.detalhe && <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>{a.detalhe}</div>}
      {a.impedida && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--perigo)", fontWeight: 600, marginBottom: 8, background: "color-mix(in srgb,var(--perigo) 10%,transparent)", padding: "5px 8px", borderRadius: 8 }}>
          <Icon name="alert-triangle" size={13} color="var(--perigo)" /> {a.motivo_impedimento || "Impedida"}
        </div>
      )}
      <QtyBar feita={a.quantidade_feita} alvo={a.quantidade_alvo} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)", marginTop: 6, flexWrap: "wrap" }}>
        <Icon name="user" size={13} /> {a.para_nome}
        {a.tempo_estimado_min != null && <><Icon name="hourglass-high" size={13} /> {a.tempo_estimado_min}min</>}
        {a.prazo && <><Icon name="calendar" size={13} /> {a.prazo.split("-").reverse().join("/")}</>}
      </div>
      {/* Tempo real: quanto levou (concluída) ou há quanto tempo rola (andamento).
          Era o que faltava — o card não dizia quanto tempo a pessoa gastou. */}
      {a.status === "concluida" && a.iniciada_at && a.concluida_at && (() => {
        const dur = Math.round((Date.parse(a.concluida_at) - Date.parse(a.iniciada_at)) / 60000);
        const est = a.tempo_estimado_min ?? null;
        const cor = est == null ? "var(--ok)" : dur <= est ? "var(--ok)" : "var(--atencao)";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 6, color: cor, fontWeight: 600, flexWrap: "wrap" }}>
            <Icon name="clock" size={13} color={cor} />
            Levou {fmtDur(dur)}{est != null ? (dur <= est ? " · dentro da meta" : ` · ${dur - est}min acima`) : ""}
            <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>· concluída às {horaSP(a.concluida_at)}</span>
          </div>
        );
      })()}
      {a.status === "em_andamento" && a.iniciada_at && (() => {
        const elapsed = Math.round((Date.now() - Date.parse(a.iniciada_at)) / 60000);
        const est = a.tempo_estimado_min ?? null;
        const estourou = est != null && elapsed > est;
        const cor = estourou ? "var(--perigo)" : "var(--text-dim)";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 6, color: cor, fontWeight: estourou ? 600 : 500, flexWrap: "wrap" }}>
            <Icon name="player-play" size={13} color={cor} />
            há {fmtDur(elapsed)} em andamento{estourou ? ` · ${elapsed - (est ?? 0)}min além da meta` : ""}
            <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>· começou {horaSP(a.iniciada_at)}</span>
          </div>
        );
      })()}
      {/* Conferida antes da conferência sair: diz que as peças entraram — é o
          que explica o aviso de reabrir. */}
      {noEstoque && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 6, color: ap.cor, fontWeight: 600, flexWrap: "wrap" }}>
          <Icon name={ap.icone} size={13} color={ap.cor} />
          {ap.label}
        </div>
      )}
      {/* O material que ESTA atividade consumiu. O ciclo do galpão começa
          bipando a caixa lacrada — quem confere depois precisa ver o que
          entrou, e quem está tocando a atividade precisa saber se já bipou. */}
      {consumo && consumo.etiquetas > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 6, color: "var(--primary-texto)", fontWeight: 600, flexWrap: "wrap" }}>
          <Icon name="package-import" size={13} color="var(--primary-texto)" />
          Material: {textoDoConsumo(consumo)}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {/* Aparece em qualquer estado: é a única porta pra lista do que já saiu,
            e esconder isso na concluída deixaria o gerente conferindo às cegas. */}
        {onMaterial && <Btn onClick={() => onMaterial(a)} icone="barcode">Material</Btn>}
        {a.status !== "pendente" && <Btn onClick={() => mover("pendente")} icone="chevron-left">Pendente</Btn>}
        {a.status !== "em_andamento" && <Btn onClick={() => mover("em_andamento")}>Andamento</Btn>}
        {a.status !== "concluida" && <Btn onClick={() => mover("concluida")} icone="check">Concluir</Btn>}
      </div>
    </div>
  );
}

// Duração legível a partir de minutos. Curta pra caber no card.
function fmtDur(min: number): string {
  if (min < 1) return "menos de 1min";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
const horaSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function Btn({ children, onClick, icone }: { children: React.ReactNode; onClick: () => void; icone?: string }) {
  // flex "1 1 92px": no desktop divide a linha igual como antes; num card estreito
  // as três ações quebram em duas linhas em vez de virarem alvos de 26px.
  return <Botao tamanho="sm" icone={icone} onClick={onClick} style={{ flex: "1 1 92px" }}>{children}</Botao>;
}

function QtyBar({ feita, alvo }: { feita: number; alvo: number }) {
  const pct = alvo > 0 ? Math.min(100, Math.round((feita / alvo) * 100)) : 0;
  const cor = pct >= 100 ? "var(--ok)" : pct >= 50 ? "var(--atencao)" : "var(--primary-texto)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-dim)", marginBottom: 3 }}>
        <span>Progresso</span><strong style={{ color: cor }}>{feita}/{alvo}</strong>
      </div>
      <div style={{ height: 6, background: "var(--surface)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: cor, borderRadius: 4, transition: "width .3s ease" }} />
      </div>
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: string; cor?: string }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 9, padding: "7px 9px" }}>
      <div className="stat" style={{ fontSize: 16, color: cor || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{label}</div>
    </div>
  );
}

function Field({ label, dica, children }: { label: string; dica?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{label}</span>
      <div style={{ marginTop: 5 }}>{children}</div>
      {/* Texto de apoio, não `title`: o que só existe no hover não existe no
          celular — e é no celular que a explicação faz mais falta. */}
      {dica && <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.35 }}>{dica}</span>}
    </label>
  );
}

const sel: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 11px", color: "var(--text)", fontSize: 13.5 };
