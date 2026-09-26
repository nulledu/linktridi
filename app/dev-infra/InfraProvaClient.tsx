"use client";

// O hub de Acessos & Infra montado fora do login, com dado de mentira.
//
// Em vez de remontar peça por peça, o bench intercepta o `fetch` das rotas do
// módulo e devolve JSON parecido com o real — assim o que se mede aqui é a
// TELA de verdade (abas, tabelas, KPIs, pop-ups), no caminho de código real.
// Nenhuma senha de verdade: até o revelar devolve um valor de prova.

import { useEffect, useState } from "react";
import { InfraHub } from "../(plataforma)/infraestrutura/InfraHub";
import type { DadosDaEquipe } from "../(plataforma)/colaboradores/GestaoDeEquipe";
import type { ColabRow } from "../(plataforma)/colaboradores/ColaboradoresClient";

const PESSOAS = [
  { id: "00000000-0000-4000-8000-000000000001", nome: "Ana Prova" },
  { id: "00000000-0000-4000-8000-000000000002", nome: "Bruno Teste" },
  { id: "00000000-0000-4000-8000-000000000003", nome: "Carla Exemplo" },
];

const colaboradores = PESSOAS.map((p, i) => ({
  id: p.id, username: `prova${i}`, name: p.nome, email: null, role: "colaborador",
  active: true, password_set: true, created_at: "2026-01-01T00:00:00Z",
  employees: { photo_url: null, cargo: i === 0 ? "TI" : "Operação" },
})) as unknown as ColabRow[];

const hoje = new Date();
const emDias = (n: number) => {
  const d = new Date(hoje); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CREDENCIAIS = [
  { id: "c1", colaboradorId: PESSOAS[0].id, tipo: "aplicativo", servico: "Hostinger Principal", categoria: "Infraestrutura", url: "https://hpanel.hostinger.com", login: "ti@empresa.com.br", notas: "2FA no celular da TI", criadoEm: "2026-09-01", atualizadoEm: "2026-09-01" },
  { id: "c2", colaboradorId: PESSOAS[0].id, tipo: "aplicativo", servico: "Cloudflare", categoria: "Infraestrutura", url: "https://dash.cloudflare.com", login: "ti@empresa.com.br", notas: null, criadoEm: "2026-09-01", atualizadoEm: "2026-09-01" },
  { id: "c3", colaboradorId: PESSOAS[1].id, tipo: "funcionario", servico: "GitHub", categoria: "Ferramentas internas", url: "https://github.com", login: "bruno-teste", notas: null, criadoEm: "2026-09-01", atualizadoEm: "2026-09-01" },
  { id: "c4", colaboradorId: PESSOAS[2].id, tipo: "email", servico: "Aprovação de arte", categoria: "Ferramentas internas", url: null, login: "aprovacao-arte@empresa.com.br", notas: "recebe as provas dos clientes", criadoEm: "2026-09-01", atualizadoEm: "2026-09-01" },
  { id: "c5", colaboradorId: PESSOAS[0].id, tipo: "email", servico: "Conta Google reserva", categoria: "Infraestrutura", url: null, login: "reserva2@empresa.com.br", notas: null, criadoEm: "2026-09-01", atualizadoEm: "2026-09-01" },
];

const DOMINIOS = [
  { id: "d1", dominio: "empresa.com.br", registrador: "Registro.br", vencimento: emDias(12), valorRenovacao: 40, renovacaoAutomatica: true, decisao: "renovar", ativo: true, responsavelId: PESSOAS[0].id, observacao: null, hospedagemId: "h1", credencialId: "c1" },
  { id: "d2", dominio: "promo-antiga.com", registrador: "Hostinger", vencimento: emDias(-5), valorRenovacao: 55.9, renovacaoAutomatica: false, decisao: "nao_renovar", ativo: false, responsavelId: PESSOAS[1].id, observacao: "campanha encerrada", hospedagemId: null, credencialId: null },
  { id: "d3", dominio: "novo-produto.com.br", registrador: "Registro.br", vencimento: emDias(200), valorRenovacao: 40, renovacaoAutomatica: false, decisao: "avaliar", ativo: true, responsavelId: null, observacao: null, hospedagemId: null, credencialId: null },
];

const HOSPEDAGENS = [
  { id: "h1", nome: "Hostinger Principal", provedor: "Hostinger", urlPainel: "https://hpanel.hostinger.com", valor: 27.9, periodicidade: "mensal", proximaCobranca: emDias(3), responsavelId: PESSOAS[0].id, observacao: null, credencialId: "c1" },
  { id: "h2", nome: "Vercel (Gaius)", provedor: "Vercel", urlPainel: "https://vercel.com", valor: 20, periodicidade: "mensal", proximaCobranca: emDias(20), responsavelId: PESSOAS[2].id, observacao: null, credencialId: null },
];

const VPS = [
  { id: "v1", nome: "VPS Produção", provedor: "Hostinger", ip: "203.0.113.10", portaSsh: 22, urlPainel: "https://hpanel.hostinger.com", valor: 89.9, periodicidade: "mensal", proximaCobranca: emDias(5), responsavelId: PESSOAS[0].id, observacao: "Traefik + chats", credencialId: "c1" },
  { id: "v2", nome: "Servidor de chats", provedor: "Contabo", ip: "198.51.100.7", portaSsh: 2222, urlPainel: null, valor: 39.9, periodicidade: "mensal", proximaCobranca: emDias(25), responsavelId: PESSOAS[1].id, observacao: null, credencialId: null },
];

/** Intercepta SÓ as rotas do módulo; o resto segue pro fetch real. */
function armarFetchDeProva() {
  const original = window.fetch.bind(window);
  const json = (corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" } });
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.startsWith("/api/acessos/revelar")) return json({ senha: "senha-de-prova" });
    if (url.startsWith("/api/acessos/log")) return json({ log: [] });
    if (url.startsWith("/api/acessos")) {
      if (init?.method === "POST") return json({ credencial: CREDENCIAIS[0] });
      return json({ credenciais: CREDENCIAIS, configurado: true });
    }
    if (url.startsWith("/api/infraestrutura/dominios")) return json({ dominios: DOMINIOS, dominio: DOMINIOS[0], ok: true });
    if (url.startsWith("/api/infraestrutura/hospedagens")) return json({ hospedagens: HOSPEDAGENS, hospedagem: HOSPEDAGENS[0], ok: true });
    if (url.startsWith("/api/infraestrutura/vps")) return json({ vps: init?.method ? VPS[0] : VPS, ok: true });
    return original(entrada as RequestInfo, init);
  };
  return () => { window.fetch = original; };
}

export function InfraProvaClient() {
  // O fetch de prova precisa estar armado ANTES do primeiro render das abas
  // (elas buscam no mount) — por isso o hub só monta depois do efeito.
  const [pronto, setPronto] = useState(false);
  useEffect(() => { const soltar = armarFetchDeProva(); setPronto(true); return soltar; }, []);

  const equipe: Promise<DadosDaEquipe> = Promise.resolve({
    colaboradores, empresasFinanceiro: [], restricoesFinanceiro: {},
  });

  return (
    <main style={{ padding: "20px clamp(12px, 4vw, 32px)", maxWidth: 1100, margin: "0 auto" }}>
      <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 14px" }}>
        Banco de provas — dado de mentira, fetch interceptado. A tela real é /infraestrutura.
      </p>
      {pronto && <InfraHub podeCofre equipe={equipe} />}
    </main>
  );
}
