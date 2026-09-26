"use client";

// ── Editar a partir da Visão Geral ───────────────────────────────────────────
// Todo número da Visão Geral é uma porta: clicar nele abre, num pop-up, os
// campos de verdade que produzem aquele número. Não existe "editar o 12" —
// o 12 é contado do cadastro; o que se edita é o chip, o celular, o proxy, o
// limite. Cada mudança grava na hora (mesmas rotas da Configuração e do
// Aquecimento) e o painel recarrega, então o número do card muda junto.

import { useState, type ReactNode } from "react";
import { Modal } from "../../ui/Modal";
import { Botao, BotaoIcone, Acoes } from "../../ui/controles";
import { Selo } from "../../ui/primitives";
import { Limites, Pendencias, Proxies, Custos, Celulares } from "./Configuracoes";
import type { Chamar } from "./ContingenciaClient";
import { STATUS, SAUDE, type Painel, type StatusAtivo, type Ativo } from "@/lib/contingencia-const";
import type { TipoAtivo } from "@/lib/marketing-aquecimento-const";

export type AlvoEdicao =
  | { tipo: "chips"; titulo: string; status?: StatusAtivo[] }
  | { tipo: "meta"; titulo: string; ativo: "bm" | "conta"; status?: StatusAtivo[] }
  | { tipo: "celulares" }
  | { tipo: "proxies" }
  | { tipo: "custos" }
  | { tipo: "atendentes" }
  | { tipo: "pendencias" };

export function EditorVisao({ alvo, painel, chamar, onFechar, onStatus, onAbrirAtivo, onNovo, verAtendente }: {
  alvo: AlvoEdicao; painel: Painel; chamar: Chamar; onFechar: () => void;
  /** Troca de status passa pelo Aquecimento (congela prazo, grava evento). */
  onStatus: (id: string, status: StatusAtivo) => Promise<boolean>;
  /** Abre a gaveta completa do ativo — fecha este pop-up antes (nada de pop-up dentro de pop-up). */
  onAbrirAtivo: (id: string) => void;
  onNovo: (o: { tipo?: TipoAtivo }) => void;
  verAtendente: (chave: string) => void;
}) {
  const cab = CABECALHO(alvo);
  return (
    <Modal titulo={cab.titulo} subtitulo={cab.sub} icone={cab.icone} tamanho="lg" largura={880} onFechar={onFechar}
      rodape={<Acoes><Botao variante="primario" icone="check" onClick={onFechar}>Pronto</Botao></Acoes>}>
      <div className="ct-scope ct-tel cv-editor">
        {alvo.tipo === "chips" ? (
          <ListaAtivos painel={painel} chamar={chamar} ativos={filtrar(painel.ativos, "numero", alvo.status)}
            comProxy onStatus={onStatus} onAbrir={onAbrirAtivo}
            vazio="Nenhum chip nesta etapa."
            novo={<Botao variante="secundario" icone="plus" onClick={() => onNovo({ tipo: "numero" })}>Novo número</Botao>} />
        ) : alvo.tipo === "meta" ? (
          <ListaAtivos painel={painel} chamar={chamar} ativos={filtrar(painel.ativos, alvo.ativo, alvo.status)}
            onStatus={onStatus} onAbrir={onAbrirAtivo}
            vazio={alvo.ativo === "bm" ? "Nenhuma BM cadastrada." : "Nenhuma conta nesta situação."}
            novo={<Botao variante="secundario" icone="plus" onClick={() => onNovo({ tipo: alvo.ativo })}>{alvo.ativo === "bm" ? "Nova BM" : "Nova conta"}</Botao>} />
        ) : alvo.tipo === "celulares" ? (
          <Celulares painel={painel} chamar={chamar} />
        ) : alvo.tipo === "proxies" ? (
          <Proxies painel={painel} chamar={chamar} />
        ) : alvo.tipo === "custos" ? (
          <Custos painel={painel} chamar={chamar} />
        ) : alvo.tipo === "pendencias" ? (
          <Pendencias painel={painel} chamar={chamar} />
        ) : (
          <div className="ct-secoes">
            <Limites painel={painel} chamar={chamar} />
            <div className="og-lista cv-atalhos">
              {painel.consolidado.atendentes.map((a) => (
                <button key={a.chave} type="button" className="og-alerta cv-atalho" onClick={() => verAtendente(a.chave)}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="og-linha-tit">{a.nome}</span>
                    <span className="og-linha-sub">{a.motivo}</span>
                  </span>
                  <Selo tom={a.saude === "saudavel" ? "ok" : a.saude === "atencao" ? "atencao" : "perigo"}>{SAUDE[a.saude].label}</Selo>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CABECALHO(a: AlvoEdicao): { titulo: string; sub: string; icone: string } {
  switch (a.tipo) {
    case "chips": return { titulo: a.titulo, icone: "hash", sub: "Troque o status e o proxy de cada chip. Grava na hora e o número do card acompanha." };
    case "meta": return { titulo: a.titulo, icone: "brand-meta", sub: "Situação de cada BM e conta de anúncio da Estrutura Meta." };
    case "celulares": return { titulo: "Celulares", icone: "device-mobile", sub: "Situação, modelo, lugar e responsável de cada aparelho." };
    case "proxies": return { titulo: "Proxies", icone: "shield", sub: "Quem cada proxy protege, status e custo mensal." };
    case "custos": return { titulo: "Gastos", icone: "credit-card", sub: "Planos de chip e outros gastos da contingência." };
    case "atendentes": return { titulo: "Saúde dos atendentes", icone: "shield-check", sub: "Os limites que decidem atenção e crítico, e cada pessoa." };
    case "pendencias": return { titulo: "Pendências", icone: "checklist", sub: "Crie, conclua ou apague as próximas ações." };
  }
}

const filtrar = (ativos: Ativo[], tipo: "numero" | "bm" | "conta", status?: StatusAtivo[]) =>
  ativos.filter((a) => a.tipo === tipo && (status ? status.includes(a.status) : a.status !== "aposentado"));

/** Lista de ativos com os campos que mudam no dia a dia: status e (chip) proxy. */
function ListaAtivos({ painel, chamar, ativos, comProxy = false, onStatus, onAbrir, vazio, novo }: {
  painel: Painel; chamar: Chamar; ativos: Ativo[]; comProxy?: boolean;
  onStatus: (id: string, status: StatusAtivo) => Promise<boolean>; onAbrir: (id: string) => void;
  vazio: string; novo: ReactNode;
}) {
  // Quem acabou de mudar de status sai do filtro no recarregamento — a linha
  // fica enquanto o pop-up está aberto pra pessoa ver o que fez.
  const [fixos] = useState(() => new Set(ativos.map((a) => a.id)));
  const [salvando, setSalvando] = useState<string | null>(null);
  const lista = painel.ativos.filter((a) => fixos.has(a.id));
  const livres = painel.proxies.filter((p) => p.status === "ativo" && !p.numeroId && !p.aparelhoNome);
  const proxyDe = (id: string) => painel.proxies.find((p) => p.numeroId === id) ?? null;

  const trocarProxy = async (n: Ativo, proxyId: string) => {
    setSalvando(n.id);
    const antes = proxyDe(n.id);
    if (antes && antes.id !== proxyId) await chamar("/api/marketing/contingencia/proxy", "PATCH", { id: antes.id, numeroId: null });
    if (proxyId) await chamar("/api/marketing/contingencia/proxy", "PATCH", { id: proxyId, numeroId: n.id, aparelhoNome: null });
    setSalvando(null);
  };

  return (
    <div className="ct-secoes" style={{ gap: 12 }}>
      {lista.length ? (
        <div className="cv-ed-lista">
          {lista.map((n) => {
            const px = proxyDe(n.id);
            return (
              <div key={n.id} className="cv-ed-linha" data-com-proxy={comProxy ? "1" : undefined} aria-busy={salvando === n.id || undefined}>
                <div style={{ minWidth: 0 }}>
                  <div className="og-linha-tit">{n.nome}</div>
                  <div className="og-linha-sub">{[n.responsavelNome, n.operadora, n.aparelho, n.identificador].filter(Boolean).join(" · ") || "sem detalhes"}</div>
                </div>
                <select className="ct-sel" value={n.status} aria-label={`Status de ${n.nome}`} disabled={salvando === n.id}
                  onChange={async (e) => { setSalvando(n.id); await onStatus(n.id, e.target.value as StatusAtivo); setSalvando(null); }}>
                  {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                {comProxy && (
                  <select className="ct-sel" value={px?.id ?? ""} aria-label={`Proxy de ${n.nome}`} disabled={salvando === n.id}
                    onChange={(e) => void trocarProxy(n, e.target.value)}>
                    <option value="">{!px && n.aparelho && painel.proxies.some((p) => p.status === "ativo" && p.aparelhoNome === n.aparelho) ? "Proxy do aparelho" : "Sem proxy"}</option>
                    {px && <option value={px.id}>{px.identificacao}</option>}
                    {livres.map((p) => <option key={p.id} value={p.id}>{p.identificacao}</option>)}
                  </select>
                )}
                <BotaoIcone icone="edit" titulo={`Editar tudo de ${n.nome}`} variante="sutil" onClick={() => onAbrir(n.id)} />
              </div>
            );
          })}
        </div>
      ) : <p className="og-limpo">{vazio}</p>}
      <Acoes>{novo}</Acoes>
    </div>
  );
}
