"use client";

// TEMPORÁRIO — as sete abas do Estoque nos ESTADOS-LIMITE.
//
// A prova feliz (`/dev-mobile?ws=estoque`) mede zero e o defeito continua na
// tela do dono. O que ela não desenha:
//
//  · lista VAZIA e lista de UMA linha (o layout muda de forma nos dois);
//  · ERRO de rede e CARREGANDO que não termina;
//  · nome REAL do galpão ("SACO ECOMMERCE P (23x13,5) - PCT 500UN", 38 letras)
//    e o pior caso dele: um token de 60 letras SEM espaço, que não quebra
//    sozinho e é o que empurra card, célula e chip pra fora;
//  · número de CINCO dígitos (99999 peças, R$ 199.999,90) — a coluna de
//    número foi dimensionada com 2 dígitos;
//  · árvore de lugares com SEIS níveis, onde o recuo come a linha.
//
// Cada caso é uma URL: `?caso=monstro|vazio|um|erro|carregando`.
//
// A rede falsa é local (e não a `RedeFalsa` do /dev-mobile) porque aqui ela
// precisa RECUSAR e PENDURAR, não só responder — e é justamente isso que os
// dois estados que faltavam exigem.

import { useState } from "react";
import { EstoqueTabs } from "../../(plataforma)/estoque/EstoqueTabs";

/** 38 letras, com espaço — o nome real mais comprido do catálogo de 231. */
const NOME_REAL = "SACO ECOMMERCE P (23x13,5) - PCT 500UN";
/** 61 letras SEM espaço nenhum: nada quebra sozinho, é o pior caso de largura. */
const NOME_SEM_ESPACO = "ETIQUETAPLASTICOVERMELHOAUTOCOLANTEIDENTIFICACAOGALPAOSETOR12";
/** Código de rastreio longo — chega assim do fornecedor, e não tem hífen. */
const RASTREIO_LONGO = "BR1234567890123456789012345678901234SEDEX";

const iso = (d: number, h: number) => new Date(2026, 7, d, h, 0).toISOString();

const HIERS = ["materia_prima", "insumo_direto", "insumo_indireto", "embalagem", "mp_processada", "componente", "peca", "produto"] as const;
const CATS = ["Descartáveis", "Embalagens", "Tintas e solventes", "Etiquetas", "Ferramentas", null];

/** 231 itens, como o catálogo de verdade desde hoje. */
function catalogoMonstro() {
  const itens = [];
  for (let i = 0; i < 231; i++) {
    const h = HIERS[i % HIERS.length];
    // Um de cada dez é o caso difícil: nome sem espaço nenhum.
    const nome = i % 10 === 3 ? NOME_SEM_ESPACO
      : i % 3 === 0 ? `${NOME_REAL} · lote ${i}`
      : `ETIQUETA PLÁSTICO VERMELHO (50 ml) ${i}`;
    itens.push({
      id: `m${i}`, nome, hierarquia: h,
      categoria: CATS[i % CATS.length],
      produzido: i % 4 === 0, serializado: i % 5 === 0,
      imagem_url: null, unidade: i % 7 === 0 ? "PCT 500UN" : "un",
      // Cinco dígitos: a coluna de número nasceu para dois.
      quantidade: i % 9 === 0 ? 99999 : i % 13,
      qtd_minima: i % 6 === 0 ? 0 : 12,
      ativo: true,
      custo: i % 8 === 0 ? 199999.9 : 12.5,
      sku: i % 2 === 0 ? `SKUMUITOLONGOSEMESPACO${String(i).padStart(6, "0")}` : null,
      estoque_ideal: 100, fornecedor_id: "f1", local_id: `l${(i % 6) + 1}`, cor: null,
    });
  }
  return itens;
}

const UM_ITEM = [{
  id: "u1", nome: NOME_SEM_ESPACO, hierarquia: "materia_prima", categoria: null,
  produzido: false, serializado: true, imagem_url: null, unidade: "un",
  quantidade: 99999, qtd_minima: 12, ativo: true, custo: 199999.9,
  sku: "SKUMUITOLONGOSEMESPACO000001", estoque_ideal: 100,
  fornecedor_id: "f1", local_id: "l1", cor: null,
}];

/** Seis níveis: o recuo de 20px por nível come a linha no celular. */
const LOCAIS_FUNDOS = [
  { id: "l1", nome: "Galpão principal da unidade de Avaré (matriz)", codigo: "GP", pai_id: null, ativo: true, ordem: 0 },
  { id: "l2", nome: "Corredor A — embalagens e descartáveis", codigo: "GP-A", pai_id: "l1", ativo: true, ordem: 1 },
  { id: "l3", nome: "Estante 3 do corredor A", codigo: "GP-A-E3", pai_id: "l2", ativo: true, ordem: 2 },
  { id: "l4", nome: "Prateleira do meio, lado direito", codigo: "GP-A-E3-P2", pai_id: "l3", ativo: true, ordem: 3 },
  { id: "l5", nome: "Caixa organizadora azul", codigo: "GP-A-E3-P2-C1", pai_id: "l4", ativo: false, ordem: 4 },
  { id: "l6", nome: NOME_SEM_ESPACO, codigo: "GPAE3P2C1DIVISORIASEISNIVEIS", pai_id: "l5", ativo: true, ordem: 5 },
];

const compra = (id: string, extra: Record<string, unknown> = {}) => ({
  id, item_nome: NOME_REAL, categoria: "Descartáveis", unidade: "PCT 500UN",
  estoque_item_id: "m1", hierarquia: "embalagem",
  quantidade_comprada: 99999, quantidade_recebida: 0, quantidade_guardada: 0,
  fornecedor: "DISTRIBUIDORA DE EMBALAGENS E DESCARTÁVEIS DO VALE DO PARANAPANEMA LTDA ME",
  fornecedor_id: "f1", local_id: "l1", estoque_erro: null, preco_unit: 199999.9,
  codigo_rastreio: RASTREIO_LONGO, codigo_recebimento: "REC-0042",
  nota_fiscal: "000000000000123456789", pedido_ref: "PEDIDOSEMESPACO000000000123456",
  palavra_chave: NOME_SEM_ESPACO, prioridade: "critica", previsao_entrega: iso(20, 12),
  status: "aguardando_entrega", solicitante: "Gustavo Lima", criado_por: "Teste",
  observacoes: null, comprado_em: iso(8, 10), created_at: iso(8, 10), updated_at: iso(8, 10),
  ...extra,
});

const pendente = (id: string, extra: Record<string, unknown> = {}) => ({
  id, produtoNome: NOME_SEM_ESPACO, tarefa: NOME_REAL, itemId: "m1", itemSerializado: true,
  categoria: "Descartáveis", quantidadeAlvo: 99999, quantidadeFeita: 12345,
  executorId: "c1", executorNome: "Maria Aparecida de Souza Nascimento Albuquerque",
  executorFotoUrl: null, fotoUrl: null, concluidaEm: iso(12, 9), souEuQuemFez: false,
  consumo: { pecas: 99999 }, ...extra,
});

const conferencia = (id: string, extra: Record<string, unknown> = {}) => ({
  id, atividadeId: "a1", itemId: "m1", itemNome: NOME_SEM_ESPACO,
  executorId: "c1", executorNome: "Maria Aparecida de Souza Nascimento Albuquerque",
  conferidoPorId: "adm", conferidoPorNome: "Beatriz Souza Nascimento de Albuquerque Filha",
  resultado: "certo", quantidade: 99999, unidadeCodigo: "SKUMUITOLONGOSEMESPACO000001-099999",
  defeitos: [], obs: null, conferidoEm: iso(12, 11), tentativa: 1, tentativas: 1, ...extra,
});

function corpos(caso: string): Record<string, unknown> {
  const vazio = caso === "vazio";
  const um = caso === "um";
  const itens = vazio ? [] : um ? UM_ITEM : catalogoMonstro();
  const locais = vazio ? [] : um ? [LOCAIS_FUNDOS[0]] : LOCAIS_FUNDOS;
  const fornecedores = vazio ? [] : [{
    id: "f1",
    nome: um ? "REVAL" : "DISTRIBUIDORA DE EMBALAGENS E DESCARTÁVEIS DO VALE DO PARANAPANEMA LTDA ME",
    cnpj: "12.345.678/0001-90",
    contato: um ? null : "Marcos Vinícius de Albuquerque Nascimento Júnior",
    telefone: um ? null : "(14) 99999-0000", email: null,
    obs: null, ativo: true,
  }];
  const compras = vazio ? [] : um ? [compra("c1")] : [
    compra("c1"),
    compra("c2", { status: "chegou", quantidade_recebida: 99999, chegou_em: iso(12, 9), chegou_por: "Recepção" }),
    compra("c3", { status: "divergencia", quantidade_recebida: 12345, estoque_erro: NOME_SEM_ESPACO }),
  ];
  const pendentes = vazio ? [] : um ? [pendente("a1")] : [
    pendente("a1"), pendente("a2", { souEuQuemFez: true }), pendente("a3", { itemId: null }),
  ];
  const conferencias = vazio ? [] : um ? [conferencia("cf1")] : [
    conferencia("cf1"),
    conferencia("cf2", { resultado: "errado", quantidade: 0, unidadeCodigo: null, defeitos: ["acabamento_ruim", "medida_errada"], obs: NOME_SEM_ESPACO, tentativa: 1, tentativas: 2 }),
  ];
  // No caso "um" tudo vale UM — é ele que prova a concordância no singular
  // ("1 peça já está pronta e espera", nunca "1 peça … elas contam").
  const linhas = vazio ? [] : (um ? [0] : [0, 1, 2]).map((i) => ({
    itemId: `m${i}`, nome: i === 1 ? NOME_SEM_ESPACO : NOME_REAL, hierarquia: HIERS[i % HIERS.length],
    categoria: "Descartáveis", quantidade: 0, minima: um ? 1 : 99999, ideal: um ? 1 : 99999,
    falta: um ? 1 : 99999, emAndamento: um ? 1 : 12345, aguardando: um ? 1 : 4321,
    aProduzir: i === 0 ? 0 : 99999,
  }));

  return {
    "/api/estoque/conferencias/pendentes": {
      qcDesligado: false, travadas: vazio ? 0 : 99999, proximoCursor: null,
      atividades: pendentes, anteriores: vazio ? 0 : 83, dias: 7, acervo: false,
    },
    "/api/estoque/conferencias": { qcDesligado: false, proximoCursor: null, conferencias },
    "/api/estoque/producao-dia": {
      automacao: { ativa: true, ultimaVarredura: "2026-08-12" }, bipeParaIniciar: true,
      linhas, totais: { itens: linhas.length, aProduzir: um ? 1 : 99999, aguardando: vazio ? 0 : um ? 1 : 4321 },
    },
    "/api/estoque/fornecedores": { podeGerir: true, fornecedores },
    "/api/estoque/locais": { podeGerir: true, locais },
    "/api/estoque/unidades": { etiquetas: [], contagem: {}, unidades: [] },
    "/api/estoque-itens": { podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: true, itens },
    "/api/recebimento/compras": {
      dashboard: { aguardando: 99999, recebidosHoje: 12345, divergencias: 4321, parciais: 999, criticos: 99, abaixoMinimo: 99999, comprasPendentes: 99999, aGuardar: 99999 },
      compras,
    },
    "/api/ficha-tecnica": { ficha: [] },
    "/api/tridi/estoque": {
      podeVerCusto: true,
      fornecedores: vazio ? [] : [{ id: 1, nome: NOME_SEM_ESPACO, materiais: 99999, valorTotal: 199999.9 }],
      materiais: vazio ? [] : [{ id: 1, nome: NOME_SEM_ESPACO, unidade: "PCT500UN", valor: 199999.9, fornecedor: "DISTRIBUIDORA DE EMBALAGENS E DESCARTÁVEIS DO VALE DO PARANAPANEMA", categoria: "Descartáveis", cor: null }],
    },
  };
}

function instalar(caso: string) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __limite?: boolean };
  if (w.__limite) return;
  w.__limite = true;
  const original = window.fetch.bind(window);
  const mapa = corpos(caso);
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (!url.startsWith("/api/")) return original(entrada as RequestInfo, init);
    // "Carregando…" que não termina: é um estado real (rede lenta do galpão) e
    // nenhuma prova o desenhava.
    if (caso === "carregando") return new Promise<Response>(() => {});
    if (caso === "erro") return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: { "content-type": "application/json" } });
    const chave = Object.keys(mapa).find((k) => url.startsWith(k));
    const corpo = chave ? mapa[chave] : {};
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  };
}

export function ProvaLimite({ caso }: { caso: string }) {
  // Durante o render, como a `RedeFalsa` do /dev-mobile: efeito de filho roda
  // antes do efeito do pai, então um `useEffect` aqui chegaria depois da
  // primeira busca.
  useState(() => { instalar(caso); return null; });
  return (
    <div style={{ padding: "18px max(14px, var(--safe-r)) 40px max(14px, var(--safe-l))" }}>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        Prova de estados-limite · caso <strong>{caso}</strong> — troque em <code>?caso=monstro|vazio|um|erro|carregando</code>
      </p>
      <EstoqueTabs perms={{ itens: true, precos: true, compras: true, fornecedores: true, locais: true, bipar: true }} />
    </div>
  );
}
