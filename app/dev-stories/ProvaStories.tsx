"use client";

// O quadro de Stories com uma `StoriesApi` em memória. As regras são as MESMAS
// da produção (métricas, ranking, repetição e busca saem de lib/marketing-
// stories/*); só a persistência é de mentira. Upload vira `blob:` local, com
// progresso simulado — dá pra arrastar prints de verdade e ver o fluxo inteiro.

import { useMemo, useState } from "react";
import { ToastHost } from "../(plataforma)/Toast";
import { Interruptor } from "../(plataforma)/ui/controles";
import { StoriesClient } from "../(plataforma)/marketing/stories/StoriesClient";
import type { BuscaStories, StoriesApi } from "../(plataforma)/marketing/stories/api";
import type { ProdutoCriativo } from "@/lib/marketing-criativos-const";
import { andarMes, diasNoMes, hojeSP, isoDeDataHoraSP, janelaDeDias, janelaUTC, mesAtualSP } from "@/lib/marketing-stories/calendario";
import { ordenar, porTipo, resumir } from "@/lib/marketing-stories/metricas";
import { casaBusca, mesmoFormato, normalizar, parecidos } from "@/lib/marketing-stories/semelhanca";
import { rotuloDoTipo, type ParecidoStory, type Story, type TipoStory } from "@/lib/marketing-stories/tipos";

const PRODUTOS: ProdutoCriativo[] = [
  { id: "prova-carimbo", nome: "Carimbo", tag: "CRB" },
  { id: "prova-chancela", nome: "Chancela", tag: "CH" },
  { id: "prova-kit", nome: "Kit Carimbo", tag: "KIT" },
];

// Um "print" de story em SVG: gradiente, título, CTA. Sem rede, sem bucket.
const arte = (de: string, ate: string, grande: string, pequeno: string) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${ate}"/></linearGradient></defs>` +
  `<rect width="540" height="960" fill="url(#g)"/>` +
  `<rect x="36" y="40" width="468" height="5" rx="2.5" fill="#fff" opacity=".55"/>` +
  `<circle cx="66" cy="92" r="22" fill="#fff" opacity=".9"/>` +
  `<text x="270" y="430" fill="#fff" font-family="system-ui,-apple-system,sans-serif" font-size="64" font-weight="800" text-anchor="middle">${grande}</text>` +
  `<text x="270" y="490" fill="#fff" opacity=".88" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="600" text-anchor="middle">${pequeno}</text>` +
  `<rect x="140" y="800" width="260" height="66" rx="33" fill="#fff"/>` +
  `<text x="270" y="843" fill="${de}" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="800" text-anchor="middle">Comprar agora</text></svg>`,
)}`;

// Quatro temas por modelo: o ciclo só fecha depois de 32 stories, então a
// prova tem as repetições que a gente PÔS (a "mesma arte" lá embaixo) e não
// um quadro inteiro marcado de repetido por preguiça de dado.
const MODELOS: { temas: [string, string, string, string]; tipo: TipoStory; produtoId: string; campanha: string | null; grande: string; pequeno: string; cores: [string, string] }[] = [
  { temas: ["Desconto de 20% no kit", "Leve 3 carimbos e pague 2", "Cupom de primeira compra", "Kit escolar com brinde"], tipo: "oferta", produtoId: "prova-kit", campanha: "Semana do Carimbo", grande: "20% OFF", pequeno: "no kit completo", cores: ["#5b46f0", "#b14bf4"] },
  { temas: ["Depoimento da Ana, da escola", "Cartório elogiando a entrega", "Vídeo da Júlia usando o carimbo", "Avaliação cinco estrelas do Pedro"], tipo: "depoimento", produtoId: "prova-carimbo", campanha: null, grande: "“Amei!”", pequeno: "Ana, professora", cores: ["#c2185b", "#f06292"] },
  { temas: ["Bastidores da gravação a laser", "Montagem dos pedidos do dia", "Teste de tinta na produção", "Equipe embalando a Black Week"], tipo: "bastidores", produtoId: "prova-carimbo", campanha: null, grande: "Bastidores", pequeno: "gravação a laser", cores: ["#111827", "#6b7280"] },
  { temas: ["Chancela para cartório: como funciona", "Diferença entre chancela e carimbo", "Como limpar a chancela", "Quanto tempo dura a gravação"], tipo: "educativo", produtoId: "prova-chancela", campanha: null, grande: "Chancela", pequeno: "como funciona", cores: ["#1a73e8", "#58c4f6"] },
  { temas: ["Frete grátis só hoje", "Relâmpago até meia-noite", "Segunda unidade pela metade", "Aniversário da loja"], tipo: "promocao", produtoId: "prova-carimbo", campanha: "Semana do Carimbo", grande: "Frete grátis", pequeno: "só hoje", cores: ["#0f9d58", "#34c3a0"] },
  { temas: ["Clientes que voltaram a comprar", "Mais de 300 cartórios atendidos", "Prints de avaliações no WhatsApp", "Selo de loja recomendada"], tipo: "prova_social", produtoId: "prova-chancela", campanha: null, grande: "+300", pequeno: "clientes voltaram", cores: ["#00897b", "#9ccc65"] },
  { temas: ["Novo carimbo automático", "Carimbo de bolso em 5 cores", "Refil que dura 10 mil marcas", "Carimbo datador"], tipo: "produto", produtoId: "prova-carimbo", campanha: null, grande: "Novo", pequeno: "carimbo automático", cores: ["#d93025", "#f29b38"] },
  { temas: ["Monte o seu no WhatsApp", "Responda a enquete e ganhe cupom", "Toque no link e personalize", "Fale com a vendedora"], tipo: "cta", produtoId: "prova-kit", campanha: null, grande: "Monte o seu", pequeno: "chame no WhatsApp", cores: ["#6d4c41", "#d7a86e"] },
];
const NUMEROS: [number, number][] = [
  [124, 18], [310, 12], [86, 9], [45, 2], [212, 21], [18, 3], [160, 11], [0, 0], [95, 7], [402, 16], [60, 1], [230, 19],
];
const hashDe = (i: number) =>
  (Math.imul(i + 1, 0x9e3779b1) >>> 0).toString(16).padStart(8, "0") + (Math.imul(i + 7, 0x85ebca6b) >>> 0).toString(16).padStart(8, "0");

function gerar(): Story[] {
  const mes = mesAtualSP();
  const ant = andarMes(mes, -1);
  const hojeDia = Number(hojeSP().slice(8, 10));
  const out: Story[] = [];
  let k = 0;
  const novo = (m: string, dia: number, hora: string, modelo: number, extra: Partial<Story> = {}) => {
    const md = MODELOS[modelo % MODELOS.length];
    const [cliques, vendas] = NUMEROS[k % NUMEROS.length];
    const iso = isoDeDataHoraSP(`${m}-${String(dia).padStart(2, "0")}`, hora) as string;
    out.push({
      id: `prova-${k}`, publicadoEm: iso, status: "publicado",
      midiaUrl: arte(md.cores[0], md.cores[1], md.grande, md.pequeno), midiaTipo: "imagem", capaUrl: null,
      largura: 540, altura: 960, duracao: null, hashVisual: hashDe(k),
      produtoId: md.produtoId, tipo: md.tipo, campanha: md.campanha, cta: "Comprar agora", linkUrl: null,
      tema: md.temas[Math.floor(k / MODELOS.length) % md.temas.length],
      cliques, vendas, observacoes: null, criadorNome: "Equipe (prova)", createdAt: iso, updatedAt: iso,
      ...extra,
    });
    k++;
  };
  // Mês passado: o "histórico" da busca e da repetição.
  for (let d = 2, i = 0; d <= diasNoMes(ant); d += 2, i++) novo(ant, d, i % 2 ? "19:40" : "11:15", i);
  // Este mês até hoje: um ou dois por dia, com dias sem story (o buraco do calendário).
  for (let d = 1, i = 3; d <= hojeDia; d++, i++) {
    if (d % 5 === 3) continue;
    novo(mes, d, "10:30", i);
    if (d % 3 === 0) novo(mes, d, "18:45", i + 2);
  }
  // A MESMA arte de um story do mês passado, postada de novo → "Mesma arte".
  const original = out[1];
  novo(mes, Math.max(1, hojeDia - 1), "21:10", 1, {
    hashVisual: original.hashVisual, midiaUrl: original.midiaUrl, tema: "Depoimento da Ana (de novo)",
  });
  // Vídeo cujo arquivo não carrega: prova o degrau final da miniatura.
  novo(mes, hojeDia, "08:05", 6, { midiaTipo: "video", midiaUrl: "/dev-stories/sem-video.mp4", cliques: 0, vendas: 0, tema: "Vídeo sem arquivo" });
  // Planejado pra depois de amanhã, se ainda cabe no mês.
  if (hojeDia + 2 <= diasNoMes(mes)) {
    novo(mes, hojeDia + 2, "12:00", 0, { status: "planejado", cliques: 0, vendas: 0, tema: "Lançamento do kit escolar" });
  }
  return out;
}

function apiDeMemoria(inicial: Story[]): StoriesApi {
  let banco = inicial.map((s) => ({ ...s }));
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const leve = (p: { item: Story; nota: number; mesmaArte: boolean }): ParecidoStory => ({ story: p.item, nota: p.nota, mesmaArte: p.mesmaArte });
  const marcar = (s: Story): Story => {
    const p = parecidos(s, banco, { antes: true, limite: 1 })[0];
    return {
      ...s,
      repete: p ? {
        id: p.item.id, publicadoEm: p.item.publicadoEm, mesmaArte: p.mesmaArte, nota: p.nota,
        capaUrl: p.item.capaUrl ?? (p.item.midiaTipo === "imagem" ? p.item.midiaUrl : null),
      } : null,
    };
  };
  const campanhas = () => [...new Set(banco.map((s) => s.campanha).filter((c): c is string => !!c))];
  const nomes = new Map(PRODUTOS.map((p) => [p.id as string, p.nome]));

  return {
    async listarMes(mes) {
      await espera(280);
      const { de, ate } = janelaUTC(mes);
      const lista = banco.filter((s) => s.publicadoEm >= de && s.publicadoEm < ate)
        .sort((a, b) => (a.publicadoEm < b.publicadoEm ? -1 : 1));
      return { stories: lista.map(marcar), campanhas: campanhas(), sqlPendente: false };
    },
    async buscar(f): Promise<BuscaStories> {
      await espera(200);
      const janela = f.de && f.ate ? janelaDeDias(f.de, f.ate) : null;
      const casam = banco.filter((s) => {
        if (janela && (s.publicadoEm < janela.de || s.publicadoEm >= janela.ate)) return false;
        if (f.produtoId && s.produtoId !== f.produtoId) return false;
        if (f.tipo && s.tipo !== f.tipo) return false;
        if (f.campanha && normalizar(s.campanha) !== normalizar(f.campanha)) return false;
        if (f.q) {
          const t = [s.tema, s.campanha, s.cta, s.observacoes, rotuloDoTipo(s.tipo), s.produtoId ? nomes.get(s.produtoId) : null]
            .filter(Boolean).join(" ");
          if (!casaBusca(t, f.q)) return false;
        }
        return true;
      });
      const ordem = f.ordem ?? "recentes";
      const lista = ordem === "recentes" ? [...casam].sort((a, b) => (a.publicadoEm < b.publicadoEm ? 1 : -1)) : ordenar(casam, ordem);
      return {
        stories: lista.slice(0, f.limite ?? 48).map(marcar), total: lista.length,
        resumo: resumir(casam), porTipo: porTipo(casam), sqlPendente: false,
      };
    },
    async detalhe(id) {
      await espera(150);
      const s = banco.find((x) => x.id === id);
      return s ? { story: marcar(s), parecidos: parecidos(s, banco, { limite: 6 }).map(leve) } : null;
    },
    async semelhantes(c) {
      await espera(120);
      const alvo = { ...c, id: c.excluirId };
      return { parecidos: parecidos(alvo, banco, { limite: 4 }).map(leve), mesmoFormato: mesmoFormato(alvo, banco) };
    },
    async criar(d) {
      await espera(450);
      const agora = new Date().toISOString();
      const s: Story = {
        id: `prova-novo-${Date.now()}`, status: "publicado", midiaUrl: null, midiaTipo: null, capaUrl: null,
        largura: null, altura: null, duracao: null, hashVisual: null, produtoId: null, tipo: null, campanha: null,
        tema: null, cta: null, linkUrl: null, cliques: 0, vendas: 0, observacoes: null,
        criadorNome: "Você (prova)", createdAt: agora, updatedAt: agora, ...d,
      };
      banco.push(s);
      return { ok: true, story: marcar(s) };
    },
    atualizar(id, patch) {
      banco = banco.map((s) => (s.id === id ? { ...s, ...patch } : s));
    },
    async excluir(id) {
      await espera(300);
      banco = banco.filter((s) => s.id !== id);
      return true;
    },
    async enviarMidia(m, aoProgredir) {
      for (let i = 1; i <= 8; i++) { await espera(110); aoProgredir?.(i / 8); }
      return { midiaUrl: URL.createObjectURL(m.arquivo), capaUrl: m.capa ? URL.createObjectURL(m.capa) : null };
    },
    descartarMidia() {},
  };
}

export function ProvaStories() {
  const [podeCriar, setPodeCriar] = useState(true);
  const [vazio, setVazio] = useState(false);
  const [produtos, setProdutos] = useState(PRODUTOS);
  const api = useMemo(() => apiDeMemoria(vazio ? [] : gerar()), [vazio]);

  return (
    <main style={{ padding: "16px 16px 96px", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Marketing · Stories — banco de provas</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.45, maxWidth: "68ch" }}>
            O quadro real com dados em memória: nada vai pro banco nem pro B2. Arraste imagens, cadastre, lance números,
            compare, busque no histórico.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <Interruptor ligado={podeCriar} onChange={setPodeCriar} rotulo="Pode registrar" />
          <Interruptor ligado={vazio} onChange={setVazio} rotulo="Sem stories" />
        </div>
      </header>
      <StoriesClient key={`${podeCriar}-${vazio}`} podeCriar={podeCriar} produtos={produtos}
        onProdutoCriado={(p) => setProdutos((l) => [...l, p])} api={api} />
      <ToastHost />
    </main>
  );
}
