"use client";

import { useEffect, useState } from "react";
import { AtividadesShell } from "../(plataforma)/atividades/AtividadesShell";
import { LABEL_PRODUTO, PRODUTOS } from "@/lib/producao-receita";
import { hojeSP, somaDias, type ItemDaVisao, type LinhaDeModelo } from "@/lib/atividades-visao";
import type { Atividade, Colaborador, Prioridade } from "@/lib/atividades-catalog";

const PESSOAS: Colaborador[] = [
  { id: "p1", nome: "Ana Souza", setor: "Produção", departamento: "Produção", especialidade: "Carimbo" },
  { id: "p2", nome: "Bruno Lima", setor: "Produção", departamento: "Almoxarifado", especialidade: "Máquinas" },
  { id: "p3", nome: "Carlos Mendes", setor: "Produção", departamento: "Máquinas", especialidade: "Máquinas" },
  { id: "p7", nome: "João Pedro", setor: "Produção", departamento: "Preparo", especialidade: "Preparo" },
  { id: "p4", nome: "Juliana Costa", setor: "Administrativo", departamento: "Financeiro" },
  { id: "p5", nome: "Rafael Oliveira", setor: "Logística", departamento: "Logística" },
  { id: "p6", nome: "Larissa Alves", setor: "Marketing", departamento: "Marketing" },
];

// Etapas por produto do modelo, ligadas pelo começo do RÓTULO (a ordem de
// PRODUTOS não é a desta lista).
const TAREFAS_POR_PRODUTO: [string, [number, string][]][] = [
  ["chancela", [[1, "Limpar folhas de alavanca"], [1, "Cortar borracha da chancela"], [2, "Montar alavancas"], [3, "Gravar placa a laser"], [4, "Embalar chancela"]]],
  ["clich", [[1, "Gravar clichê a laser"], [2, "Limpar clichê"], [3, "Conferir clichê"]]],
  ["carimbo", [[1, "Cortar borracha"], [2, "Montar carimbo"], [3, "Conferir impressão"], [4, "Embalar carimbos"], [4, "Separar pedidos do dia"]]],
  ["almofada", [[1, "Pintar almofada"], [2, "Embalar almofadas"]]],
];
const AVULSAS: [string, string, string][] = [
  ["Revisar estoque de insumos", "Verificar itens com baixo estoque.", "Estoque"],
  ["Manutenção das máquinas", "Realizar limpeza e verificação geral.", "Máquinas"],
  ["Atualizar planilha de vendas", "Conferir dados do mês atual.", "Financeiro"],
  ["Separar embalagens", "Organizar embalagens para envio.", "Logística"],
  ["Postar nas redes sociais", "Divulgar novos produtos.", "Marketing"],
];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const it_ = (n: number, p: Partial<ItemDaVisao>): ItemDaVisao => ({
  id: uuid(n), nome: "?", categoria: null, hierarquia: "mp_processada", imagem_url: null,
  quantidade: 10, qtd_minima: 5, unidade: "un", setor_responsavel: null, ...p,
});
const P_CARIMBO = PRODUTOS.find((k) => LABEL_PRODUTO[k].toLowerCase().startsWith("carimbo")) ?? PRODUTOS[0];
const P_CHANCELA = PRODUTOS.find((k) => LABEL_PRODUTO[k].toLowerCase().startsWith("chancela")) ?? PRODUTOS[0];
const ITENS: ItemDaVisao[] = [
  it_(1, { nome: "Carimbo", categoria: LABEL_PRODUTO[P_CARIMBO], hierarquia: "produto", quantidade: 14, qtd_minima: 10 }),
  it_(2, { nome: "Chancela", categoria: LABEL_PRODUTO[P_CHANCELA], hierarquia: "produto", quantidade: 4, qtd_minima: 6 }),
  it_(3, { nome: "Puxador", categoria: "Puxadores", hierarquia: "componente", quantidade: 0, qtd_minima: 20, setor_responsavel: "Produção" }),
  it_(4, { nome: "Base de MDF", categoria: "Máquinas", hierarquia: "componente", quantidade: 40, qtd_minima: 20 }),
  it_(5, { nome: "Chapa EVA com Feltro", categoria: "Chapas", quantidade: 0, qtd_minima: 2 }),
  it_(6, { nome: "MDF 3mm pintado", categoria: "MDF", quantidade: 20, qtd_minima: 20 }),
  it_(7, { nome: "Tinta preparada azul", categoria: "Tintas", quantidade: 12, qtd_minima: 4, unidade: "fr" }),
  it_(8, { nome: "Almofada 11", categoria: "Almofadas", hierarquia: "produto", quantidade: 141, qtd_minima: 30 }),
  it_(9, { nome: "Almofada 16", categoria: "Almofadas", hierarquia: "produto", quantidade: 63, qtd_minima: 20 }),
  it_(10, { nome: "Almofada 22x22", categoria: "Almofadas", hierarquia: "produto", quantidade: 0, qtd_minima: 5 }),
  it_(11, { nome: "Almofada Econômica Básica", categoria: "Almofadas", hierarquia: "produto", quantidade: 0, qtd_minima: 0 }),
];
// Uma categoria criada à mão, como o dono pediu: as almofadas num cartão só.
const GRUPOS = [{ id: "g-almofada", nome: "Almofada", itens: [uuid(8), uuid(9), uuid(10), uuid(11)] }];
// O que a rota /api/atividades/visao?item= devolveria: a ficha e as opções salvas.
const DETALHE: Record<string, { componentes: ItemDaVisao[]; opcoes: { id: string; item_id: string; nome: string; setor: string; ordem: number }[] }> = {
  [uuid(1)]: { componentes: [ITENS[2], ITENS[3]], opcoes: [] },
  [uuid(3)]: {
    componentes: [
      it_(31, { nome: "Puxador Macho", hierarquia: "peca", categoria: "Máquinas", quantidade: 40, qtd_minima: 176 }),
      it_(32, { nome: "Puxador Fêmea", hierarquia: "peca", categoria: "Máquinas", quantidade: 12, qtd_minima: 176 }),
    ],
    opcoes: [
      { id: "o1", item_id: uuid(3), nome: "Cortar peças do puxador", setor: "Máquinas", ordem: 0 },
      { id: "o2", item_id: uuid(3), nome: "Montar puxador", setor: "Produção", ordem: 1 },
    ],
  },
};

// Pseudoaleatório com semente: a mesma tela a cada recarga.
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function montar() {
  const agora = Date.now();
  const hoje = hojeSP(agora);
  const r = gerador(7);
  const modelos: LinhaDeModelo[] = TAREFAS_POR_PRODUTO.flatMap(([prefixo, tarefas]) => {
    const p = PRODUTOS.find((k) => LABEL_PRODUTO[k].toLowerCase().startsWith(prefixo));
    return p ? tarefas.map(([fase, tarefa], ordem) => ({ produto: p, fase, tarefa, ordem })) : [];
  });
  const nomes = [
    ...modelos.map((m) => ({ tarefa: m.tarefa, categoria: String(m.produto), detalhe: null as string | null })),
    ...AVULSAS.map(([tarefa, detalhe, categoria]) => ({ tarefa, detalhe, categoria })),
  ];
  const prioridades: Prioridade[] = ["alta", "media", "media", "baixa"];
  const lista: Atividade[] = [];
  for (let i = 0; i < 52; i++) {
    const n = nomes[Math.floor(r() * nomes.length)];
    const pessoa = r() < 0.15 ? null : PESSOAS[Math.floor(r() * PESSOAS.length)];
    const criada = agora - r() * 13 * 86_400_000;
    const sorte = r();
    const status: Atividade["status"] = sorte < 0.55 ? "concluida" : sorte < 0.78 ? "em_andamento" : "pendente";
    const iniciada = status !== "pendente" ? criada + r() * 5 * 3_600_000 : null;
    const concluida = status === "concluida" ? Math.min(agora - 60_000, (iniciada ?? criada) + r() * 2 * 86_400_000) : null;
    lista.push({
      id: `a${i}`, categoria: n.categoria, tarefa: n.tarefa, detalhe: n.detalhe,
      para_id: pessoa?.id ?? null, para_nome: pessoa?.nome ?? null, por_id: "adm", por_nome: "Caio",
      status, setor: pessoa?.setor ?? "Produção", pool: !pessoa,
      prazo: r() < 0.75 ? somaDias(hoje, Math.floor(r() * 12) - 4) : null,
      quantidade_alvo: 1 + Math.floor(r() * 20), quantidade_feita: 0, tempo_estimado_min: 40,
      iniciada_at: iniciada ? new Date(iniciada).toISOString() : null,
      produto_id: null, produto_nome: null, estoque_lancado: false,
      created_at: new Date(criada).toISOString(), concluida_at: concluida ? new Date(concluida).toISOString() : null,
      foto_url: null, prioridade: prioridades[Math.floor(r() * prioridades.length)],
      // Tempo pra aceitar: sem sorteio (não desloca o `r()` das outras provas).
      // Dirigida conta da criação; pool, de quem pegou.
      ...(status !== "pendente" ? (pessoa
        ? { aceita_at: new Date(criada + (((i * 7) % 25) + 0.5) * 60_000).toISOString() }
        : {}) : { aceita_at: null }),
    });
  }
  lista.push({ ...lista[0], id: "mp1", tarefa: "Montar puxador", detalhe: null, status: "pendente", categoria: "Puxador",
    produto_nome: null, iniciada_at: null, concluida_at: null, created_at: new Date(agora - 3_600_000).toISOString() });
  // A coluna Cancelada do Histórico tem DUAS procedências, e as duas precisam
  // aparecer no banco de provas: a cancelada pelo gestor (status `cancelada`,
  // que vem numa lista à parte) e a recusada por quem ia fazer (`impedida`,
  // que continua pendente no banco).
  lista.push({ ...lista[0], id: "imp1", tarefa: "Gravar placa a laser", status: "pendente", impedida: true,
    motivo_impedimento: "Máquina parada — fita do bico acabou", iniciada_at: null, concluida_at: null,
    created_at: new Date(agora - 7_200_000).toISOString() });
  const canceladas: Atividade[] = [
    { ...lista[0], id: "can1", tarefa: "Embalar chancela", status: "cancelada", impedida: false,
      motivo_impedimento: "Pedido cancelado pelo cliente", iniciada_at: null, concluida_at: null,
      created_at: new Date(agora - 2 * 86_400_000).toISOString() },
  ];
  return { lista, canceladas, modelos };
}

const CATALOGO: { id: string; setor: string; categoria: string; nome: string }[] = [
  { id: "c1", setor: "Produção", categoria: "Do zero", nome: "Limpar a máquina de corte" },
  { id: "c2", setor: "Logística", categoria: "Do zero", nome: "Ajudar a embalar os pedidos do dia" },
  { id: "c3", setor: "Produção", categoria: "Do zero", nome: "Organizar o estoque de MDF da prateleira de cima perto da janela" },
];

// Banco de provas sem sessão: as rotas do pop-up e do "Personalizar"
// respondem daqui, pra dar pra clicar o fluxo inteiro (Carimbo › Puxador ›
// atividade › pessoas). O resto segue pra rede de verdade.
function simularRotas() {
  const original = window.fetch.bind(window);
  const resp = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const u = String(entrada instanceof Request ? entrada.url : entrada);
    const m = u.match(/\/api\/atividades\/visao\?item=([^&]+)/);
    if (m) return resp(DETALHE[decodeURIComponent(m[1])] ?? { componentes: [], opcoes: [] });
    if (u.includes("/api/atividades/visao?catalogo=1")) return resp({ itens: ITENS, selecionados: [], grupos: GRUPOS });
    if (u.endsWith("/api/atividades/visao") && init?.method === "PUT") return resp({ ok: true, ...JSON.parse(String(init.body)) });
    if (u.includes("/api/devices/mesas")) return resp({ devices: [{ nome_mesa: "Mesa 1", ativo: true }] });
    if (u.endsWith("/api/atividades/opcoes") && init?.method === "POST") {
      const b = JSON.parse(String(init.body));
      return resp({ opcao: { id: `n${Date.now()}`, ordem: 99, ...b } });
    }
    if (u.endsWith("/api/atividades") && init?.method === "POST") return resp({ atividade: { id: `x${Date.now()}` } });
    // Atividades criadas do zero ficam salvas (categoria "Do zero").
    if (u.includes("/api/atividades-catalogo")) {
      if (init?.method === "POST") {
        const b = JSON.parse(String(init.body));
        const item = { id: `c${Date.now()}`, ...b };
        CATALOGO.push(item);
        return resp({ item });
      }
      if (init?.method === "DELETE") {
        const id = new URL(u, location.origin).searchParams.get("id");
        CATALOGO.splice(CATALOGO.findIndex((c) => c.id === id) >>> 0, 1);
        return resp({ ok: true });
      }
      return resp({ itens: CATALOGO });
    }
    return original(entrada, init);
  };
  return () => { window.fetch = original; };
}

export function ProvaAtividades() {
  // Montado só no navegador: as datas saem de `Date.now()`, e servidor e
  // navegador discordariam no último segundo (hidratação).
  const [dados, setDados] = useState<ReturnType<typeof montar> | null>(null);
  useEffect(() => {
    const desfazer = simularRotas();
    setDados(montar());
    return desfazer;
  }, []);
  if (!dados) return null;
  return (
    <div style={{ padding: "24px clamp(12px, 3vw, 32px)", maxWidth: 1400, margin: "0 auto" }}>
      <AtividadesShell
        pode={{ ver: true, atribuir: true, configurar: true, autorizar: true }} colaboradores={PESSOAS} initial={dados.lista} canceladas={dados.canceladas}
        modelos={dados.modelos} itensVisao={ITENS} grupos={GRUPOS}
        // Ponto de exemplo: Juliana, Larissa e João não estão na empresa.
        presenca={{ registrados: PESSOAS.map((p) => p.id), presentes: ["p1", "p2", "p3", "p5"] }}
        // Fila de recusadas no tablet (só supervisor): motivo curto, longo e sem nome.
        recusadas={[
          { id: "rec1", tarefa: "Montar chancela", categoria: "Chancela", produto_nome: "Chancela 40mm", motivo: "Falta material: Base de chancela",
            em: new Date(Date.now() - 12 * 60_000).toISOString(), recusadaPor: "Luiz Henrique", liberadaPor: "Matheus" },
          { id: "rec2", tarefa: "Gravar placa a laser", categoria: "Carimbos", produto_nome: null,
            motivo: "Máquina parada — a lente do laser está suja e ninguém do turno sabe limpar sem estragar",
            em: new Date(Date.now() - 95 * 60_000).toISOString(), recusadaPor: null, liberadaPor: null },
        ]}
      />
    </div>
  );
}
