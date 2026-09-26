"use client";

// Painel direito: thread, informações, membros, arquivos, links, fixadas e as
// atividades do ERP compartilhadas no canal.
//
// Cada aba busca o seu conteúdo só quando é aberta — abrir o painel não pode
// disparar seis requisições de uma vez.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../../Icon";
import { Botao } from "../../../ui/controles";
import { Avatar } from "./Avatar";
import { CardEntidade } from "./CardEntidade";
import { Conteudo } from "./Conteudo";
import { api } from "../data/api";
import { familiaArquivo, hhmm, previa, rotuloDia, tamanhoLegivel } from "@/lib/chat/regras";
import type { Anexo, Canal, CardContexto, Membro, Mensagem } from "@/lib/chat/tipos";

export type AbaPainel = "thread" | "info" | "membros" | "arquivos" | "links" | "fixadas" | "atividades";

const ABAS: { chave: AbaPainel; label: string }[] = [
  { chave: "info", label: "Informações" },
  { chave: "membros", label: "Membros" },
  { chave: "arquivos", label: "Arquivos" },
  { chave: "links", label: "Links" },
  { chave: "fixadas", label: "Fixadas" },
  { chave: "atividades", label: "Atividades" },
];

interface Props {
  canal: Canal;
  aba: AbaPainel;
  meuId: string;
  meuNome: string;
  thread: Mensagem | null;
  emCelular: boolean;
  aoTrocarAba: (a: AbaPainel) => void;
  aoFechar: () => void;
  aoAbrirAnexo: (a: Anexo) => void;
  aoIrPara: (id: string) => void;
  aoEditarCanal: () => void;
  aoAdicionarMembros: () => void;
  renderThread: () => React.ReactNode;
}

export function PainelContexto(p: Props) {
  const abas = p.thread ? [{ chave: "thread" as const, label: "Thread" }, ...ABAS] : ABAS;

  return (
    <aside className="ch-painel" aria-label="Painel do canal">
      <div className="ch-painel__topo">
        {p.emCelular && (
          <button type="button" className="ch-icone" onClick={p.aoFechar} aria-label="Voltar">
            <Icon name="chevron-left" size={20} />
          </button>
        )}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {abas.find((a) => a.chave === p.aba)?.label ?? "Painel"}
        </span>
        {!p.emCelular && (
          <button type="button" className="ch-icone" onClick={p.aoFechar} aria-label="Fechar painel">
            <Icon name="x" size={18} />
          </button>
        )}
      </div>

      <div className="ch-abas" role="tablist">
        {abas.map((a) => (
          <button key={a.chave} type="button" role="tab" className="ch-aba"
            aria-selected={p.aba === a.chave} onClick={() => p.aoTrocarAba(a.chave)}>
            {a.label}
          </button>
        ))}
      </div>

      {p.aba === "thread"
        ? p.renderThread()
        : <div className="ch-painel__corpo">{corpo(p)}</div>}
    </aside>
  );
}

function corpo(p: Props) {
  switch (p.aba) {
    case "info": return <AbaInfo canal={p.canal} aoEditar={p.aoEditarCanal} />;
    case "membros": return <AbaMembros canal={p.canal} meuId={p.meuId} aoAdicionar={p.aoAdicionarMembros} />;
    case "arquivos": return <AbaArquivos canal={p.canal} aoAbrir={p.aoAbrirAnexo} />;
    case "links": return <AbaLinks canal={p.canal} />;
    case "fixadas": return <AbaFixadas canal={p.canal} meuNome={p.meuNome} aoIrPara={p.aoIrPara} />;
    case "atividades": return <AbaAtividades canal={p.canal} />;
    default: return null;
  }
}

// ── Genéricos ───────────────────────────────────────────────────────────────

/** Carrega uma vez ao montar a aba; guarda erro e vazio sem duplicar código. */
function useCarga<T>(carregar: () => Promise<T>, chave: string) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregar()
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setDados(null); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return { dados, carregando };
}

function Esqueletos({ n = 5 }: { n?: number }) {
  return (
    <div style={{ display: "grid", gap: 8, padding: 6 }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="ch-esqueleto" style={{ height: 36 }} />
      ))}
    </div>
  );
}

function Vazio({ icone, texto }: { icone: string; texto: string }) {
  return (
    <div className="ch-vazio" style={{ minHeight: 160 }}>
      <span className="ch-vazio__icone"><Icon name={icone} size={22} color="var(--text-dim)" /></span>
      <p>{texto}</p>
    </div>
  );
}

// ── Abas ────────────────────────────────────────────────────────────────────

function AbaInfo({ canal, aoEditar }: { canal: Canal; aoEditar: () => void }) {
  const podeEditar = canal.papel !== "membro";
  return (
    <>
      <div className="ch-painel__secao">Sobre</div>
      <p style={{ margin: "0 6px 12px", fontSize: 13.5, lineHeight: 1.55, color: canal.descricao ? "var(--text)" : "var(--text-dim)" }}>
        {canal.descricao || "Sem descrição."}
      </p>

      {canal.topico && (
        <>
          <div className="ch-painel__secao">Tópico</div>
          <p style={{ margin: "0 6px 12px", fontSize: 13.5, lineHeight: 1.55 }}>{canal.topico}</p>
        </>
      )}

      <div className="ch-painel__secao">Detalhes</div>
      <Detalhe icone={canal.privado ? "lock" : "lock-open"} texto={canal.privado ? "Canal privado" : "Canal aberto"} />
      <Detalhe icone="users" texto={`${canal.membros} ${canal.membros === 1 ? "membro" : "membros"}`} />
      {canal.somente_leitura && <Detalhe icone="eye" texto="Somente leitura — só quem administra escreve" />}
      {canal.arquivado && <Detalhe icone="archive" texto="Arquivado" />}
      {canal.contexto_tipo && <Detalhe icone="link" texto={`Ligado a ${canal.contexto_tipo}`} />}
      <Detalhe icone="bell" texto={
        canal.mudo_ate ? "Silenciado" :
        canal.notificar === "mencoes" ? "Notifica só menções" :
        canal.notificar === "nenhuma" ? "Sem notificações" : "Notifica tudo"
      } />

      {podeEditar && (
        <Botao bloco style={{ marginTop: 16 }} onClick={aoEditar}>
          Editar canal
        </Botao>
      )}
    </>
  );
}

function Detalhe({ icone, texto }: { icone: string; texto: string }) {
  return (
    <div className="ch-linha-lista" style={{ cursor: "default" }}>
      <Icon name={icone} size={16} color="var(--text-dim)" />
      <span className="ch-linha-lista__corpo">{texto}</span>
    </div>
  );
}

function AbaMembros({ canal, meuId, aoAdicionar }: { canal: Canal; meuId: string; aoAdicionar: () => void }) {
  const { dados, carregando } = useCarga<{ membros: Membro[] }>(() => api.membros(canal.id), canal.id);
  if (carregando) return <Esqueletos />;
  const membros = dados?.membros ?? [];
  return (
    <>
      {canal.papel !== "membro" && (
        <button type="button" className="ch-linha-lista" onClick={aoAdicionar}>
          <Icon name="users-plus" size={18} color="var(--primary-texto)" />
          <span className="ch-linha-lista__corpo" style={{ color: "var(--primary-texto, var(--primary))", fontWeight: 600 }}>Adicionar pessoas</span>
        </button>
      )}
      {membros.map((m) => (
        <div key={m.id} className="ch-linha-lista" style={{ cursor: "default" }}>
          <Avatar nome={m.name} src={m.avatar} size={30} />
          <span className="ch-linha-lista__corpo">
            <span style={{ display: "block" }}>{m.name}{m.id === meuId ? " (você)" : ""}</span>
            <span className="ch-linha-lista__sub" style={{ display: "block" }}>
              {[m.papel !== "membro" ? (m.papel === "dono" ? "Dono" : "Admin") : null, m.setor].filter(Boolean).join(" · ") || "Membro"}
            </span>
          </span>
        </div>
      ))}
      {!membros.length && <Vazio icone="users" texto="Ninguém aqui ainda." />}
    </>
  );
}

function AbaArquivos({ canal, aoAbrir }: { canal: Canal; aoAbrir: (a: Anexo) => void }) {
  const { dados, carregando } = useCarga<{ arquivos: (Anexo & { created_at: string })[] }>(
    () => api.arquivos(canal.id) as Promise<{ arquivos: (Anexo & { created_at: string })[] }>, canal.id);
  if (carregando) return <Esqueletos />;
  const arquivos = dados?.arquivos ?? [];
  if (!arquivos.length) return <Vazio icone="folder" texto="Nenhum arquivo compartilhado neste canal." />;

  const imagens = arquivos.filter((a) => familiaArquivo(a.mime ?? "", a.nome ?? "") === "imagem");
  const outros = arquivos.filter((a) => familiaArquivo(a.mime ?? "", a.nome ?? "") !== "imagem");

  return (
    <>
      {imagens.length > 0 && (
        <>
          <div className="ch-painel__secao">Mídia</div>
          <div className="ch-grade-midia">
            {imagens.map((a, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.url + i} src={a.url} alt={a.nome || ""} data-nozoom
                loading="lazy" decoding="async" onClick={() => aoAbrir(a)} />
            ))}
          </div>
        </>
      )}
      {outros.length > 0 && (
        <>
          <div className="ch-painel__secao">Arquivos</div>
          {outros.map((a, i) => (
            <button key={a.url + i} type="button" className="ch-linha-lista" onClick={() => aoAbrir(a)}>
              <Icon name="file" size={18} color="var(--primary-texto)" />
              <span className="ch-linha-lista__corpo">
                <span style={{ display: "block" }}>{a.nome}</span>
                <span className="ch-linha-lista__sub" style={{ display: "block" }}>
                  {[tamanhoLegivel(a.tamanho), rotuloDia(a.created_at)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </>
      )}
    </>
  );
}

function AbaLinks({ canal }: { canal: Canal }) {
  const { dados, carregando } = useCarga(() => api.links(canal.id), canal.id);
  if (carregando) return <Esqueletos />;
  const links = dados?.links ?? [];
  if (!links.length) return <Vazio icone="link" texto="Nenhum link compartilhado ainda." />;
  return (
    <>
      {links.map((l, i) => (
        <a key={l.url + i} href={l.url} target="_blank" rel="noopener noreferrer" className="ch-linha-lista">
          <Icon name="link" size={17} color="var(--primary-texto)" />
          <span className="ch-linha-lista__corpo">
            <span style={{ display: "block" }}>{l.titulo || hostname(l.url)}</span>
            <span className="ch-linha-lista__sub" style={{ display: "block" }}>{l.url}</span>
          </span>
          <Icon name="external-link" size={14} color="var(--text-dim)" />
        </a>
      ))}
    </>
  );
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function AbaFixadas({ canal, meuNome, aoIrPara }: { canal: Canal; meuNome: string; aoIrPara: (id: string) => void }) {
  const { dados, carregando } = useCarga(() => api.fixadas(canal.id), canal.id);
  if (carregando) return <Esqueletos n={3} />;
  const msgs = dados?.mensagens ?? [];
  if (!msgs.length) return <Vazio icone="pin" texto="Nada fixado. Fixe uma mensagem para deixá-la sempre à mão." />;
  return (
    <>
      {msgs.map((m: Mensagem) => (
        <button key={m.id} type="button" className="ch-linha-lista" style={{ alignItems: "flex-start" }}
          onClick={() => aoIrPara(m.id)}>
          <Icon name="pin" size={16} color="var(--atencao)" />
          <span className="ch-linha-lista__corpo" style={{ whiteSpace: "normal" }}>
            <span className="ch-linha-lista__sub" style={{ display: "block" }}>
              {m.autor_nome} · {hhmm(m.created_at)}
            </span>
            <span style={{ display: "block", whiteSpace: "normal", fontSize: 13 }}>
              {m.texto ? <Conteudo texto={m.texto} meuNome={meuNome} /> : previa(m)}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}

function AbaAtividades({ canal }: { canal: Canal }) {
  const { dados, carregando } = useCarga(() => api.cards(canal.id), canal.id);
  if (carregando) return <Esqueletos n={3} />;
  const cards = dados?.cards ?? [];
  if (!cards.length) {
    return <Vazio icone="checklist" texto="Nenhuma atividade compartilhada aqui. Compartilhe uma e ela vira um card nesta lista." />;
  }
  return (
    <div style={{ display: "grid", gap: 8, padding: "4px 2px" }}>
      {cards.map((c: { mensagem_id: string; card: CardContexto }) => (
        <CardEntidade key={c.mensagem_id} card={c.card} />
      ))}
    </div>
  );
}

export const useCargaPainel = useCarga;
