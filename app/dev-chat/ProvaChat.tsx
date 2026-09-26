"use client";

// Banco de provas do layout do chat, com dados fixos e SEM store nem sessão.
//
// Os componentes de apresentação (sidebar, cabeçalho, lista, composer, painel)
// recebem tudo por prop, então dá para montar a tela inteira aqui e medir
// estouro de largura, alvo de toque e os dois temas — que é exatamente o que a
// verificação de celular precisa e o que não dá para fazer atrás do login.

import { useEffect, useMemo, useState } from "react";
import "../(plataforma)/central/mensagens/ui/chat.css";
import { Sidebar } from "../(plataforma)/central/mensagens/ui/Sidebar";
import { CabecalhoCanal } from "../(plataforma)/central/mensagens/ui/CabecalhoCanal";
import { ListaMensagens } from "../(plataforma)/central/mensagens/ui/ListaMensagens";
import { Composer } from "../(plataforma)/central/mensagens/ui/Composer";
import { PainelContexto, type AbaPainel } from "../(plataforma)/central/mensagens/ui/PainelContexto";
import type { AcoesMensagem } from "../(plataforma)/central/mensagens/ui/LinhaMensagem";
import { MenuContexto, ReagirRapido, type ItemMenu } from "../(plataforma)/central/mensagens/ui/MenuContexto";
import { EMOJIS_REACAO } from "../(plataforma)/central/mensagens/ui/emojis";
import { ModalNovoCanal, ModalPessoas } from "../(plataforma)/central/mensagens/ui/Modais";
import { registrarPaletaLocal } from "../(plataforma)/ui/paletaLocal";
import type { Canal, Categoria, Mensagem, Pessoa, Reacao } from "@/lib/chat/tipos";

const MEU = "u1";

// Fotos locais para o pior caso do recorte: uma bem larga e uma bem alta.
// Avatar com imagem não quadrada é onde o `object-fit` e o corte aparecem.
const FOTO_LARGA = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iI2Y1OWUwYiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2VmNDQ0NCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiBmaWxsPSJ1cmwoI2cpIi8+PHRleHQgeD0iNTAlIiB5PSI1NSUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjYwIiBmaWxsPSIjZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5XPC90ZXh0Pjwvc3ZnPg==";
const FOTO_ALTA = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMjIwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzIyYzU1ZSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzBlYTVlOSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMjIwIiBmaWxsPSJ1cmwoI2cpIi8+PHRleHQgeD0iNTAlIiB5PSI1NSUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjYwIiBmaWxsPSIjZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5IPC90ZXh0Pjwvc3ZnPg==";


const CANAIS: Canal[] = [
  canal("c0", "Geral", { geral: true, naoLidas: 12, membros: 140, descricao: "Todo mundo da empresa." }),
  canal("c8", "Douglas, Letícia e Davi", { tipo: "grupo", membros: 4, naoLidas: 2 }),
  canal("c1", "marketing", { cor: "var(--primary-texto)", naoLidas: 3, membros: 54, descricao: "Alinhamentos e ideias do time." }),
  canal("c2", "desenvolvimento", { cor: "var(--azul)", mencoes: 2, membros: 12 }),
  canal("c3", "rh", { cor: "var(--ok)", membros: 8 }),
  canal("c4", "producao-linha-3-noturno", { cor: "var(--atencao)", membros: 31, favorita: true }),
  canal("c5", "Mariana Sousa", { tipo: "direta", parceiro: "u2", naoLidas: 1, avatar: FOTO_LARGA }),
  canal("c7", "João Victor", { tipo: "direta", parceiro: "u3", avatar: FOTO_ALTA }),
  canal("c6", "avisos", { somenteLeitura: true, privado: true, membros: 120 }),
];

const CATEGORIAS: Categoria[] = [{ id: "k1", nome: "Projetos", ordem: 1 }];

const PESSOAS: Pessoa[] = [
  { id: "u2", name: "Mariana Sousa", setor: "Marketing", avatar: FOTO_LARGA },
  { id: "u3", name: "João Victor", setor: "Desenvolvimento", avatar: FOTO_ALTA },
  { id: "u4", name: "Camila Rocha", setor: "Marketing", avatar: null },
  { id: "u5", name: "Rafael Almeida", setor: "Produção", avatar: null },
  { id: "u8", name: "Ana Carolina Nascimento de Oliveira", setor: "Marketing e Comunicação Digital", avatar: null },
  { id: "u9", name: "Pedro", setor: null, avatar: FOTO_ALTA },
];

// Com quem ainda não há conversa: nome comprido e setor comprido, para medir o corte.
const SUGESTOES: Pessoa[] = [
  { id: "u8", name: "Ana Carolina Nascimento de Oliveira", setor: "Marketing e Comunicação Digital", avatar: null },
  { id: "u9", name: "Pedro", setor: null, avatar: FOTO_ALTA },
];

const MENSAGENS: Mensagem[] = [
  msg("m1", "u2", "Mariana Sousa", "Pessoal, tudo certo com a nova campanha?", -180),
  msg("m2", "u3", "João Victor", "Está indo muito bem! Seguem os resultados parciais:", -170, {
    anexos: [{ url: "#", nome: "resultados-parciais-do-trimestre-inteiro.xlsx", mime: "application/vnd.ms-excel", tamanho: 25088 }],
  }),
  msg("m3", "u4", "Camila Rocha", "Perfeito! 👏", -160, { respostas: 1 }),
  msg("m4", "u5", "Rafael Almeida",
    "Fiz um ajuste no script de importação:\n\n```ts\nconst total = itens.reduce((s, i) => s + i.valor, 0);\n// arredonda só no fim, senão o centavo some\nreturn Math.round(total * 100) / 100;\n```\n\nVeja em https://exemplo.com.br/relatorio e me diga.", -120),
  msg("m5", MEU, "Você", "Boa, **@Rafael Almeida**. Vou revisar hoje ainda.", -60, { editada: true }),
  msg("m6", "u2", "Mariana Sousa", "@todos lembrete: reunião às 15h.", -30, { mencaoTodos: true }),
  msg("m7", "u3", "João Victor", "🔥", -20),
  msg("m8", "u4", "Camila Rocha", "Palavra-que-nao-quebra-em-lugar-nenhum-e-testa-o-overflow-do-container-inteiro", -10),
];

const REACOES: Reacao[] = [
  { mensagem_id: "m2", user_id: "u2", emoji: "👏" },
  { mensagem_id: "m2", user_id: MEU, emoji: "👏" },
  { mensagem_id: "m4", user_id: "u2", emoji: "🔥" },
];

export function ProvaChat() {
  const [ativo, setAtivo] = useState("c1");
  const [painel, setPainel] = useState<AbaPainel | null>(null);
  const [vista, setVista] = useState<"lateral" | "conversa" | "painel">("conversa");
  // Menu e barra de reação ligados de verdade: são eles que precisam ser
  // provados perto das bordas da tela.
  const [menu, setMenu] = useState<null | { x: number; y: number; itens: ItemMenu[] }>(null);
  const [reagirEm, setReagirEm] = useState<null | { x: number; y: number }>(null);
  const [modal, setModal] = useState<null | "novo" | "pessoas">(null);
  const ITENS: ItemMenu[] = [
    { chave: "a", label: "Responder", icone: "corner-up-left", aoEscolher: () => {} },
    { chave: "b", label: "Responder na thread", icone: "message", aoEscolher: () => {} },
    { chave: "c", label: "Copiar texto", icone: "copy", atalho: "⌘C", aoEscolher: () => {} },
    { chave: "d", label: "Salvar para depois", icone: "bookmark", separadorAntes: true, aoEscolher: () => {} },
    { chave: "e", label: "Apagar", icone: "trash", perigo: true, aoEscolher: () => {} },
  ];

  // Igual ao Chat real: enquanto a tela de mensagens está montada, o ⌘K é DELA.
  useEffect(() => registrarPaletaLocal(), []);

  const canal = CANAIS.find((c) => c.id === ativo)!;
  const vazio = useMemo(() => new Set<string>(), []);
  const autores = useMemo(() => Object.fromEntries(
    MENSAGENS.map((m, i) => [m.autor_id, { nome: m.autor_nome ?? "", avatar: i % 2 ? FOTO_LARGA : FOTO_ALTA }]),
  ), []);

  const acoes = useMemo<AcoesMensagem>(() => ({
    responder: () => {}, abrirThread: () => {}, reagir: () => {},
    menu: (_m, x, y) => setMenu({ x, y, itens: ITENS }),
    itensMenu: () => ITENS,
    abrirReacoes: (_id, r) => setReagirEm({ x: r.left + r.width / 2, y: r.bottom }),
    abrirAnexo: () => {}, irPara: () => {}, alternarAcoes: () => {},
    editar: () => {}, selecionar: () => {},
  }), []);

  return (
    <div className="ch ch--cheia" data-painel={painel ? "1" : undefined} data-vista={vista}>
      <Sidebar
        canais={CANAIS} categorias={CATEGORIAS} ativo={ativo} salvos={4} conexao="ligado"
        online={new Set(["u2"])}
        aoAbrir={(id) => { setAtivo(id); setVista("conversa"); }}
        aoFavoritar={() => {}} aoNovo={() => setModal("novo")} aoBuscar={() => {}} aoAbrirSalvos={() => {}} aoProximaNaoLida={() => {}} aoMenu={() => {}}
        sugestoes={SUGESTOES} aoFalarCom={() => {}} aoVerPessoas={() => setModal("pessoas")}
        aoRedimensionar={() => {}} redimensionando={false}
      />

      <main className="ch-conversa">
        <CabecalhoCanal
          canal={canal} painelAberto={!!painel} emCelular online={false}
          aoVoltar={() => setVista("lateral")}
          aoAlternarPainel={() => { setPainel((p) => (p ? null : "info")); setVista(painel ? "conversa" : "painel"); }}
          aoBuscarNoCanal={() => {}} aoAbrirInfo={() => { setPainel("info"); setVista("painel"); }}
          aoAbrirMembros={() => { setPainel("membros"); setVista("painel"); }}
          itensMenu={() => ITENS}
        />
        <ListaMensagens
          mensagens={MENSAGENS} reacoes={REACOES} autores={autores}
          meuId={MEU} meuNome="Caio Oliveira"
          carregando={false} carregandoAntigas={false} temMais={false}
          erro={null} marcaNova="m6" aoTentarDeNovo={() => {}}
          toque selecionadas={vazio} modoSelecao={false}
          acoesAbertas="m4" destacada={null} acoes={acoes} aoPedirAntigas={() => {}}
        />
        <div className="ch-digitando"><i /><i /><i /> Mariana está digitando</div>
        <Composer
          canalNome={canal.nome} desabilitado={null} rascunhoChave={ativo} respondendo={MENSAGENS[0]} editando={null}
          pessoas={[]} aoEnviar={() => {}} aoCancelarResposta={() => {}} aoCancelarEdicao={() => {}}
          aoDigitar={() => {}} aoSubir={async () => ({ url: "#", nome: "x", mime: "text/plain" })}
        />
      </main>

      {menu && <MenuContexto x={menu.x} y={menu.y} itens={menu.itens} aoFechar={() => setMenu(null)} />}
      {modal === "novo" && (
        <ModalNovoCanal pessoas={PESSOAS} categorias={CATEGORIAS} meuId={MEU} modoInicial="grupo"
          aoFechar={() => setModal(null)} aoCriado={() => setModal(null)} />
      )}
      {modal === "pessoas" && (
        <ModalPessoas pessoas={PESSOAS} canais={CANAIS} aoFechar={() => setModal(null)} aoFalarCom={() => setModal(null)} />
      )}
      {reagirEm && <ReagirRapido x={reagirEm.x} y={reagirEm.y} emojis={EMOJIS_REACAO}
        aoEscolher={() => {}} aoFechar={() => setReagirEm(null)} />}

      {painel && (
        <PainelContexto
          canal={canal} aba={painel} meuId={MEU} meuNome="Caio Oliveira" thread={null} emCelular
          aoTrocarAba={setPainel} aoFechar={() => { setPainel(null); setVista("conversa"); }}
          aoAbrirAnexo={() => {}} aoIrPara={() => {}} aoEditarCanal={() => {}} aoAdicionarMembros={() => {}}
          renderThread={() => null}
        />
      )}
    </div>
  );
}

// ── Fábricas ────────────────────────────────────────────────────────────────
function canal(id: string, nome: string, extra: Partial<{
  tipo: Canal["tipo"]; cor: string; naoLidas: number; mencoes: number; membros: number;
  favorita: boolean; privado: boolean; somenteLeitura: boolean; descricao: string; parceiro: string; avatar: string;
  geral: boolean;
}> = {}): Canal {
  return {
    id, nome, tipo: extra.tipo ?? "canal",
    descricao: extra.descricao ?? null, topico: null, slug: null, avatar: extra.avatar ?? null,
    cor: extra.cor ?? null, categoria_id: null,
    contexto_tipo: extra.geral ? "sistema" : null, contexto_ref: extra.geral ? "geral" : null,
    privado: !!extra.privado, somente_leitura: !!extra.somenteLeitura, arquivado: false,
    membros: extra.membros ?? 3, favorita: !!extra.favorita, papel: "dono",
    notificar: "todas", mudo_ate: null, atualizado_em: new Date().toISOString(),
    ultima: { texto: "Última mensagem do canal para testar o corte do texto", autor: "Mariana", created_at: new Date().toISOString() },
    nao_lidas: extra.naoLidas ?? 0, mencoes: extra.mencoes ?? 0, parceiro_id: extra.parceiro ?? null,
  };
}

function msg(id: string, autor: string, nome: string, texto: string, minutosAtras: number, extra: Partial<{
  anexos: Mensagem["anexos"]; respostas: number; editada: boolean; mencaoTodos: boolean;
}> = {}): Mensagem {
  return {
    id, conversa_id: "c1", autor_id: autor, autor_nome: nome, texto,
    tipo: "texto", anexos: extra.anexos ?? [], card: null,
    responde_a: null, thread_id: null, respostas: extra.respostas ?? 0, ultima_resposta_em: null,
    fixada: false, editada_em: extra.editada ? new Date().toISOString() : null, excluida_em: null,
    mencoes: [], mencao_todos: !!extra.mencaoTodos,
    created_at: new Date(Date.now() + minutosAtras * 60_000).toISOString(),
  };
}
