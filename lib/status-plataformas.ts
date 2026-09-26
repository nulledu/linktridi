// Página de status (Gatus na VPS do gedux): de "lista de verificações" pra
// "plataformas". O Gatus devolve 27 itens soltos; quem olha quer saber se o
// gedux, a Meta ou o Supabase estão de pé — e só depois, abrindo, qual funil.
//
// Puro (sem React, sem rede): é daqui que a tela /status e o selo do Shell
// tiram a mesma leitura. Trava: lib/__tests__/status-plataformas.test.ts.

export const SLOTS = 30;

export interface Resultado {
  success: boolean;
  status?: number;
  hostname?: string;
  duration?: number; // nanossegundos
  timestamp?: string;
  errors?: string[];
  conditionResults?: { condition: string; success: boolean }[];
}
export interface ItemStatus { key: string; name: string; group?: string; results?: Resultado[] }

export interface Plataforma { id: string; nome: string; desc: string }

// Ordem = ordem na tela quando está tudo bem (quem cai sobe pro topo).
export const PLATAFORMAS: Plataforma[] = [
  { id: "gedux", nome: "gedux.com.br", desc: "Funis dos anúncios e o chat deles" },
  { id: "gaius", nome: "Gaius", desc: "O sistema" },
  { id: "sistematridi", nome: "sistematridi.com.br", desc: "Site" },
  { id: "tutoriais", nome: "Tutoriais", desc: "O site do QR das caixas e cada guia publicado" },
  { id: "dominios", nome: "Domínios", desc: "Endereços da Tridi ligados ao Gaius" },
  { id: "meta", nome: "Meta", desc: "Anúncios, WhatsApp e Instagram" },
  { id: "supabase", nome: "Supabase", desc: "Banco de dados" },
  { id: "vercel", nome: "Vercel", desc: "Hospedagem do Gaius" },
  { id: "cloudflare", nome: "Cloudflare", desc: "DNS e rede" },
  { id: "yampi", nome: "Yampi", desc: "Loja e checkout" },
  { id: "aws", nome: "AWS", desc: "Nuvem da Vercel e do Supabase" },
  { id: "hostinger", nome: "Hostinger", desc: "Servidor do gedux (VPS)" },
  { id: "chatgpt", nome: "ChatGPT", desc: "OpenAI" },
];

const NOME_ITEM: Record<string, string> = {
  "tridi_gaius": "Sistema no ar",
  "tridi_gedux-com-br": "Página inicial (leva ao funil principal)",
  "tridi_typebot-(chat-dos-funis)": "Chat dos funis (Typebot)",
  "tridi_sistematridi-com-br": "Página inicial",
  "terceiros_supabase": "Página oficial de status",
  "terceiros_vercel": "Página oficial de status",
  "terceiros_cloudflare": "Página oficial de status",
  "terceiros_yampi": "Página oficial de status",
  "terceiros_aws": "Incidentes nas regiões usadas",
  "terceiros_hostinger": "Página oficial de status",
  "terceiros_chatgpt": "Página oficial de status",
};

const ordenar = (rs: Resultado[] = []) =>
  [...rs].sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
const ultimo = (e: ItemStatus) => { const rs = ordenar(e.results); return rs[rs.length - 1]; };

export function plataformaDe(e: ItemStatus): string {
  const host = ultimo(e)?.hostname ?? "";
  // Funil sem domínio mora no gedux desde 14/09/2026 (o Gaius redireciona /f/).
  if (e.group === "Funis") return host && !host.includes("gedux") ? "gaius" : "gedux";
  // Um item por domínio ATIVO no Acessos & Infra (config/dominios.yaml, escrito
  // pelo coletor a partir de `status_dominios_ativos()`). Grupo sem acento: o
  // Gatus usa grupo+nome como chave e não decodifica %C3%AD.
  if (e.group === "Dominios") return "dominios";
  // Site de tutoriais: cartão próprio (config/tutoriais.yaml, escrito pelo
  // coletor a partir de `status_tutoriais_publicos()`). Não é "mais um
  // domínio" porque o link dele está impresso em caixa e etiqueta — e porque
  // o endereço pode responder com a PÁGINA do guia caída.
  if (e.group === "Tutoriais") return "tutoriais";
  if (e.group === "Meta") return "meta";
  if (e.group === "Tridi") {
    if (e.name === "Gaius") return "gaius";
    if (e.name.includes("sistematridi")) return "sistematridi";
    return "gedux";
  }
  const id = e.name.toLowerCase();
  return PLATAFORMAS.some((p) => p.id === id) ? id : "outros";
}

export function nomeDoItem(e: ItemStatus): string {
  if (NOME_ITEM[e.key]) return NOME_ITEM[e.key];
  if (e.group === "Funis") return "/f/" + e.name;
  // Tutoriais: o endereço vem como host ("www.carimbostridii.com.br") e a
  // página como caminho sem a barra ("p/tutoriais/chancela"), porque a chave do
  // Gatus troca "/" por "-". A barra volta só na tela.
  if (e.group === "Tutoriais") return e.name.includes("/") ? "/" + e.name : e.name;
  return e.name;
}

/**
 * Erro cru do Gatus (Go) → frase que diz o que houve com o ENDEREÇO.
 *
 * Domínio guardado na gaveta é o caso comum: está registrado, ninguém apontou
 * o DNS, e o erro que chega é `dial tcp: lookup x: no such host`. Sem tradução
 * a página mostraria isso do jeito que veio e ninguém saberia que a correção é
 * apontar o DNS (ou desmarcar "ativo" na ficha do domínio).
 */
export function motivoDoErro(erro: string): string {
  const e = erro.toLowerCase();
  if (e.includes("no such host") || e.includes("server misbehaving") || e.includes("name resolution"))
    return "O endereço não leva a lugar nenhum: falta apontar o DNS";
  if (e.includes("connection refused")) return "O servidor recusou a conexão";
  if (e.includes("certificate has expired")) return "O certificado HTTPS venceu";
  if (e.includes("x509") || e.includes("tls:")) return "O certificado HTTPS não confere com o endereço";
  if (e.includes("timeout") || e.includes("deadline exceeded")) return "Demorou demais pra responder";
  return erro.slice(0, 160);
}

/** Traduz a falha do Gatus pra uma frase que diz O QUE aconteceu. */
export function motivoDaQueda(r?: Resultado): string {
  if (!r) return "Sem verificação ainda";
  // Erro de rede ou o texto que o coletor empurrou (Meta/AWS).
  if (r.errors?.length) return motivoDoErro(r.errors[0]);
  const falhou = (r.conditionResults ?? []).filter((c) => !c.success).map((c) => c.condition);
  if (falhou.some((c) => c.includes("CERTIFICATE_EXPIRATION"))) return "O certificado HTTPS vence em menos de 14 dias";
  if (falhou.some((c) => c.includes("DOMAIN_EXPIRATION"))) return "O registro do domínio vence em menos de 30 dias";
  if (falhou.some((c) => c.includes("Este link"))) return "O funil abriu dizendo que o link não está disponível";
  if (falhou.some((c) => c.includes("indicator"))) return "A página oficial marca instabilidade grave";
  if (falhou.some((c) => c.startsWith("[STATUS]"))) return r.status ? `Respondeu com erro ${r.status}` : "Não respondeu";
  return "Falhou na última verificação";
}

// ── Ocorrências dos funis (flags.json, gravado pelo `coletor.py funis`) ──────
// A lógica do changedetection.io moldada pro funil: tudo que não é o funil
// vira ocorrência com tipo. `queda` derruba (e avisa); o resto é aviso.
export const OCORRENCIA: Record<string, { rotulo: string; queda: boolean }> = {
  fora_do_ar: { rotulo: "Fora do ar", queda: true },
  nao_encontrado: { rotulo: "404", queda: true },
  erro_servidor: { rotulo: "Erro no servidor", queda: true },
  erro_http: { rotulo: "Erro HTTP", queda: true },
  redirecionou: { rotulo: "Redirecionou", queda: true },
  indisponivel: { rotulo: "Link indisponível", queda: true },
  pagina_de_erro: { rotulo: "Página de erro", queda: true },
  nao_e_o_funil: { rotulo: "Não é o funil", queda: true },
  // O caminho depois da porta (coletor.py caminho, 1x por hora).
  chat_fora: { rotulo: "Chat fora", queda: true },
  link_quebrado: { rotulo: "Link quebrado", queda: true },
  lento: { rotulo: "Lento", queda: false },
  mudou: { rotulo: "Conteúdo mudou", queda: false },
};
export const rotuloOcorrencia = (tipo: string) => OCORRENCIA[tipo]?.rotulo ?? tipo;

export interface FlagsFunil {
  atual: string | null;
  ocorrencias7d: number;
  porTipo: Record<string, number>;
  ultimas: { em: string; tipo: string; detalhe: string }[];
}
export interface Flags { atualizado?: string; funis: Record<string, FlagsFunil> }

/** `parcial` só existe na trilha da PLATAFORMA: parte dos itens caiu naquela
 *  fatia. Pintar isso de vermelho deixava a trilha inteira vermelha com 98% no
 *  ar — bastava um funil de 15 estar quebrado. */
export type Slot = "ok" | "falha" | "parcial" | "vazio";

export interface ItemView {
  key: string;
  nome: string;
  caiu: boolean;
  motivo: string;
  ms: number | null;
  quando: string | null;
  trilha: Slot[];
  uptime: number | null;
  /** Só funil: ocorrências dos últimos 7 dias (flags.json). */
  flags?: FlagsFunil;
}

export interface Grupo extends Plataforma {
  itens: ItemView[];
  caidos: ItemView[];
  trilha: Slot[];
  uptime: number | null;
  msMedio: number | null;
  quando: string | null;
  /** Soma das ocorrências dos funis da plataforma em 7 dias. */
  ocorrencias7d: number;
  /** As mais recentes primeiro, com o nome do item. */
  ultimas: { em: string; tipo: string; detalhe: string; nome: string }[];
}

function trilhaDe(rs: Resultado[]): Slot[] {
  const ultimos = rs.slice(-SLOTS);
  return [...Array<Slot>(SLOTS - ultimos.length).fill("vazio"), ...ultimos.map((r): Slot => (r.success ? "ok" : "falha"))];
}

function verItem(e: ItemStatus, flags?: Flags | null): ItemView {
  const rs = ordenar(e.results);
  const r = rs[rs.length - 1];
  const caiu = !!r && !r.success;
  return {
    flags: e.group === "Funis" ? flags?.funis?.[e.name] : undefined,
    key: e.key,
    nome: nomeDoItem(e),
    caiu,
    motivo: caiu ? motivoDaQueda(r) : "",
    ms: r?.duration ? Math.round(r.duration / 1e6) : null,
    quando: r?.timestamp ?? null,
    trilha: trilhaDe(rs),
    uptime: rs.length ? rs.filter((x) => x.success).length / rs.length : null,
  };
}

/** Plataformas com seus itens, a que caiu primeiro. Plataforma sem item some. */
export function agrupar(lista: ItemStatus[], flags?: Flags | null): Grupo[] {
  const extras: Plataforma[] = [];
  const porId = new Map<string, ItemStatus[]>();
  for (const e of lista) {
    const id = plataformaDe(e);
    if (!PLATAFORMAS.some((p) => p.id === id) && !extras.some((p) => p.id === id)) extras.push({ id, nome: "Outros", desc: "" });
    porId.set(id, [...(porId.get(id) ?? []), e]);
  }
  const grupos: Grupo[] = [];
  for (const p of [...PLATAFORMAS, ...extras]) {
    const brutos = porId.get(p.id);
    if (!brutos?.length) continue;
    const itens = brutos.map((e) => verItem(e, flags)).sort((a, b) => Number(b.caiu) - Number(a.caiu) || a.nome.localeCompare(b.nome));
    const trilha = Array.from({ length: SLOTS }, (_, i): Slot => {
      const s = itens.map((it) => it.trilha[i]);
      const falha = s.includes("falha"), ok = s.includes("ok");
      return falha ? (ok ? "parcial" : "falha") : ok ? "ok" : "vazio";
    });
    const todos = brutos.flatMap((e) => e.results ?? []);
    const comMs = itens.filter((it) => it.ms != null);
    grupos.push({
      ...p,
      itens,
      caidos: itens.filter((it) => it.caiu),
      trilha,
      uptime: todos.length ? todos.filter((r) => r.success).length / todos.length : null,
      msMedio: comMs.length ? Math.round(comMs.reduce((s, it) => s + (it.ms ?? 0), 0) / comMs.length) : null,
      quando: itens.map((it) => it.quando).filter(Boolean).sort().pop() ?? null,
      ocorrencias7d: itens.reduce((s, it) => s + (it.flags?.ocorrencias7d ?? 0), 0),
      ultimas: itens
        .flatMap((it) => (it.flags?.ultimas ?? []).map((o) => ({ ...o, nome: it.nome })))
        .sort((a, b) => b.em.localeCompare(a.em))
        .slice(0, 8),
    });
  }
  // `sort` é estável: entre as que estão bem, vale a ordem de PLATAFORMAS.
  return grupos.sort((a, b) => Number(b.caidos.length > 0) - Number(a.caidos.length > 0));
}
