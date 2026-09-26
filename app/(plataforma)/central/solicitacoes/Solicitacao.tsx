"use client";

// ── Solicitação · peças ──────────────────────────────────────────────────────
// A solicitação deixou de ter tela própria: ela vive na lista única da Central
// (`/central`), ao lado das tarefas. O que sobrou aqui são as peças que a
// solicitação tem e a tarefa não — o cartão completo com imagens e botões de
// aprovação, o formulário de abertura, a recusa com motivo e o visualizador.
// Quem monta a fila agora é a Central; quem sabe o que é um pedido é este
// arquivo.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../Icon";
import { GlassSelect } from "../../GlassPicker";
import { Acoes, Botao, BotaoIcone, Campo, Campos, PainelLateral } from "../../ui/controles";
import { TextoComCodigo } from "../../ui/TextoComCodigo";
import { Alerta } from "../../ui/Alerta";
import {
  TIPOS_SOLICITACAO, SETORES_DESTINO, PRIORIDADES, MAX_IMAGENS_SOLICITACAO,
  setorDoTipoSolicitacao,
} from "@/lib/central";

export interface Solic {
  id: string; autor_id: string; autor_nome: string | null;
  tipo: string; setor_destino: string; titulo: string; descricao: string | null;
  prioridade: string; status: string; motivo_recusa: string | null; created_at: string;
  // Chegam pelo SQL de `supabase/central-solicitacoes-destino-imagens.sql`.
  // Antes de rodá-lo a API devolve o formato antigo — daí o opcional.
  imagens?: string[] | null;
  destino_tipo?: string | null;
  destinatario_id?: string | null;
  destinatario_nome?: string | null;
}

interface Pessoa { id: string; name: string; setor: string | null; avatar: string | null }

const STATUS_INFO: Record<string, { label: string; cor: string }> = {
  pendente: { label: "Pendente", cor: "var(--atencao)" },
  aprovada: { label: "Aprovada", cor: "var(--azul)" },
  recusada: { label: "Recusada", cor: "var(--perigo)" },
  concluida: { label: "Concluída", cor: "var(--ok)" },
  cancelada: { label: "Cancelada", cor: "var(--neutro)" },
};
const PRIO_COR: Record<string, string> = { baixa: "var(--neutro)", normal: "var(--azul)", alta: "var(--atencao)", urgente: "var(--perigo)" };

// "há 3 min" / "há 2 h" / "ontem". Data absoluta num pedido em aberto obriga a
// pessoa a fazer conta de cabeça pra saber se aquilo já está parado tempo demais.
function quando(iso: string | null | undefined): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const m = Math.round(d / 30);
  return m === 1 ? "há 1 mês" : `há ${m} meses`;
}

/** Quem pode responder ESTE pedido: o papel de gestão resolve qualquer um; a
 *  pessoa nomeada resolve o dela. Mesma regra do servidor (PODE_RESOLVER). */
export const podeResolverEsta = (s: Solic, meuId: string, papelResolve: boolean) =>
  papelResolve || s.destinatario_id === meuId;

// ── Cartão ───────────────────────────────────────────────────────────────────
// É o painel de detalhe da solicitação dentro da Central: tudo o que uma tarefa
// não tem — autor, destino, imagens, motivo da recusa — e os botões de decisão.

export function Card({ s, meuId, podeResolver, destacado, onResolver, onRecusar, onVerImagem }: {
  s: Solic; podeResolver: boolean; meuId: string; destacado?: boolean;
  onResolver: (id: string, status: string, motivo?: string) => void;
  onRecusar: () => void;
  onVerImagem: (imagens: string[], i: number) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const st = STATUS_INFO[s.status] ?? { label: s.status, cor: "var(--neutro)" };
  const pendente = s.status === "pendente";
  const imagens = (s.imagens ?? []).filter(Boolean);
  const paraPessoa = !!s.destinatario_nome;
  const prioCor = PRIO_COR[s.prioridade] ?? "var(--neutro)";
  // A faixa de urgência só vale enquanto o pedido está vivo: um "urgente"
  // já concluído continuaria gritando na lista de histórico sem motivo.
  const gritante = (s.prioridade === "urgente" || s.prioridade === "alta")
    && (s.status === "pendente" || s.status === "aprovada");
  const minha = s.autor_id === meuId;
  const praMim = !!s.destinatario_id && s.destinatario_id === meuId;
  // Descrição longa vira resumo de 3 linhas. Numa fila de 20 pedidos, um texto
  // de 15 linhas empurra todo o resto pra fora da tela.
  const longa = (s.descricao ?? "").length > 220;

  return (
    <article
      className="glass"
      style={{
        // A urgência é uma faixa na lateral, não mais um carimbo perdido no meio
        // do texto: dá pra varrer a coluna e achar o que pega fogo.
        padding: 16, paddingLeft: 16 - 4, borderRadius: "var(--r-md)",
        borderLeft: `4px solid ${gritante ? prioCor : "transparent"}`,
        outline: destacado ? `2px solid ${st.cor}` : undefined,
        outlineOffset: 2,
        transition: "outline-color .3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Inicial nome={s.autor_nome} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, lineHeight: 1.3, overflowWrap: "anywhere" }}>{s.titulo}</h3>
          {/* Um texto só, não dois spans: com dois, o "·" caía sozinho no
              começo da linha seguinte quando o nome quebrava no celular. */}
          <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-dim)" }}>
            {`${minha ? "você" : s.autor_nome || "alguém"} · ${quando(s.created_at)}`}
          </div>
        </div>
        <span style={{
          fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: "var(--r-xs)", whiteSpace: "nowrap", flex: "none",
          color: st.cor, background: `color-mix(in srgb, ${st.cor} 16%, transparent)`,
        }}>{st.label}</span>
      </div>

      {s.descricao && (
        <div style={{ marginTop: 10 }}>
          {/* Antes um <p> cru; agora TextoComCodigo, que troca ```blocos``` pelo
              BlocoDeCodigo e deixa o resto igual. O recolher de texto longo virou
              max-height (o -webkit-line-clamp só conta linhas de texto e cortaria
              torto quando há um bloco de código no meio). */}
          <TextoComCodigo texto={s.descricao} style={{
            color: "var(--text-dim)", fontSize: 14, lineHeight: 1.45,
            ...(longa && !aberto ? { maxHeight: "4.4em", overflow: "hidden" } : null),
          }} />
          {longa && (
            <button onClick={() => setAberto(!aberto)} style={{
              marginTop: 4, padding: "4px 0", border: "none", background: "none", boxShadow: "none",
              color: "var(--primary-texto, var(--primary))", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{aberto ? "ver menos" : "ver mais"}</button>
          )}
        </div>
      )}

      {imagens.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {imagens.map((url, i) => (
            <button
              key={url}
              onClick={() => onVerImagem(imagens, i)}
              title="Ver imagem"
              style={{
                padding: 0, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", overflow: "hidden",
                width: 76, height: 76, cursor: "zoom-in", background: "var(--surface)", flex: "none",
              }}
            >
              {/* Miniatura do storage do próprio projeto; `next/image` aqui só
                  acrescentaria uma volta pelo otimizador para 76px. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Imagem ${i + 1} da solicitação`} loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}

      {/* Etiquetas embaixo, todas com a mesma forma: tipo, destino, prioridade.
          Antes era texto solto separado por espaço — nada tinha peso visual. */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <Etiqueta icone="tag">{s.tipo}</Etiqueta>
        {/* "para" explícito: sem a palavra, o ícone de pessoa e o de setor eram
            a única diferença entre "pedido do João" e "pedido PARA o João". */}
        <Etiqueta icone={paraPessoa ? "user" : "users"} destaque={praMim}>
          {paraPessoa ? `para ${praMim ? "você" : s.destinatario_nome}` : s.setor_destino}
        </Etiqueta>
        {s.prioridade !== "normal" && (
          <Etiqueta cor={prioCor}>{s.prioridade}</Etiqueta>
        )}
      </div>

      {s.status === "recusada" && s.motivo_recusa && (
        <Alerta tom="perigo" style={{ marginTop: 12 }}>
          <strong>Recusada:</strong> {s.motivo_recusa}
        </Alerta>
      )}

      {((podeResolver && (pendente || s.status === "aprovada")) || (minha && pendente)) && (
        <Acoes style={{ marginTop: 14 }}>
          {podeResolver && pendente && (
            <>
              <Botao variante="primario" icone="check" onClick={() => onResolver(s.id, "aprovada")}>Aprovar</Botao>
              <Botao variante="perigo" icone="x" onClick={onRecusar}>Recusar</Botao>
            </>
          )}
          {podeResolver && s.status === "aprovada" && (
            <Botao variante="primario" icone="checks" onClick={() => onResolver(s.id, "concluida")}>Concluir</Botao>
          )}
          {/* Desistir do próprio pedido não é "recusar": recusa é decisão de
              quem aprova e fica no histórico como tal. Enquanto ninguém
              respondeu, o autor tira o dele da fila sozinho. */}
          {minha && pendente && (
            <Botao icone="trash" onClick={() => onResolver(s.id, "cancelada")}>Cancelar pedido</Botao>
          )}
        </Acoes>
      )}
    </article>
  );
}

/** Etiqueta de metadado — mesma forma para tipo, destino e prioridade. */
function Etiqueta({ icone, cor, destaque, children }: {
  icone?: string; cor?: string; destaque?: boolean; children: React.ReactNode;
}) {
  const c = cor ?? (destaque ? "var(--primary-texto)" : "var(--text-dim)");
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: "var(--r-xs)",
      fontSize: 12, fontWeight: 600, color: c, maxWidth: "100%", minWidth: 0,
      background: cor || destaque ? `color-mix(in srgb, ${c} 14%, transparent)` : "var(--surface-2)",
      border: `1px solid ${cor || destaque ? `color-mix(in srgb, ${c} 30%, transparent)` : "transparent"}`,
    }}>
      {icone && <Icon name={icone} size={13} color={c} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </span>
  );
}

/** Inicial do autor. Dá rosto à fila sem custar mais uma consulta por foto. */
function Inicial({ nome }: { nome: string | null }) {
  const letra = (nome ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden style={{
      flex: "none", width: 32, height: 32, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center",
      fontSize: 13.5, fontWeight: 800, color: "var(--text-dim)", background: "var(--surface-2)",
    }}>{letra}</span>
  );
}

// ── Nova solicitação ─────────────────────────────────────────────────────────

interface Anexo { id: string; url?: string; previa: string; erro?: boolean }

export function NovaSolicitacao({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<string>(TIPOS_SOLICITACAO[0]);
  const [destino, setDestino] = useState<"setor" | "pessoa">("setor");
  const [setor, setSetor] = useState<string>(setorDoTipoSolicitacao(TIPOS_SOLICITACAO[0]));
  const [setorTocado, setSetorTocado] = useState(false);
  const [pessoaId, setPessoaId] = useState("");
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [pessoasProntas, setPessoasProntas] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviando, setEnviando] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  // Carrega uma vez, quando o painel abre. Não há poll aqui: a lista de gente
  // não muda no meio de um formulário.
  useEffect(() => {
    let vivo = true;
    fetch("/api/central/pessoas")
      .then((r) => r.json())
      .then((d) => { if (vivo) setPessoas(d.pessoas ?? []); })
      .catch(() => {})
      .finally(() => { if (vivo) setPessoasProntas(true); });
    return () => { vivo = false; };
  }, []);

  // As prévias são object URLs; sem revogar, cada foto escolhida fica presa na
  // memória da aba até recarregar a página.
  useEffect(() => () => {
    anexos.forEach((a) => { if (a.previa.startsWith("blob:")) URL.revokeObjectURL(a.previa); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function escolherTipo(t: string) {
    setTipo(t);
    if (!setorTocado) setSetor(setorDoTipoSolicitacao(t));
  }

  async function anexar(files: FileList | null) {
    if (!files?.length) return;
    const restante = MAX_IMAGENS_SOLICITACAO - anexos.length;
    const lote = [...files].filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, restante));
    for (const f of lote) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previa = URL.createObjectURL(f);
      setAnexos((a) => [...a, { id, previa }]);
      setEnviando((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("bucket", "photos");
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        const d = await r.json();
        setAnexos((a) => a.map((x) => x.id === id
          ? (d?.url ? { ...x, url: d.url } : { ...x, erro: true })
          : x));
      } catch {
        setAnexos((a) => a.map((x) => (x.id === id ? { ...x, erro: true } : x)));
      }
      setEnviando((n) => n - 1);
    }
    if (arquivo.current) arquivo.current.value = "";
  }

  function remover(id: string) {
    setAnexos((a) => {
      const alvo = a.find((x) => x.id === id);
      if (alvo?.previa.startsWith("blob:")) URL.revokeObjectURL(alvo.previa);
      return a.filter((x) => x.id !== id);
    });
  }

  // O botão NÃO desliga por falta de destinatário: botão apagado sem explicação
  // é o tipo de coisa que faz a pessoa achar que a tela travou. Ele deixa clicar
  // e o próprio campo diz o que falta.
  const [tentou, setTentou] = useState(false);
  const faltaPessoa = destino === "pessoa" && !pessoaId;
  const podeSalvar = !!titulo.trim() && !enviando && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    if (faltaPessoa) { setTentou(true); return; }
    setSalvando(true);
    try {
      await fetch("/api/central/solicitacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo, setor_destino: setor, titulo, descricao, prioridade,
          destino_tipo: destino,
          destinatario_id: destino === "pessoa" ? pessoaId : null,
          imagens: anexos.map((a) => a.url).filter(Boolean),
        }),
      });
      onSaved();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <PainelLateral
      titulo="Nova solicitação"
      subtitulo="Descreva o pedido e diga para quem ele vai"
      onFechar={onClose}
      largura={520}
      rodape={
        <Acoes>
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={!podeSalvar} carregando={salvando}>
            {enviando ? "Enviando imagens…" : "Enviar"}
          </Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Título" largo>
          {(id) => (
            <input id={id} value={titulo} onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Preciso de 100 guias alavanca" autoFocus />
          )}
        </Campo>

        <Campo label="Tipo">
          {(id) => (
            <GlassSelect id={id} value={tipo} onChange={escolherTipo}
              options={TIPOS_SOLICITACAO.map((t) => ({ value: t, label: t }))} />
          )}
        </Campo>
        <Campo label="Prioridade">
          {(id) => (
            <GlassSelect id={id} value={prioridade} onChange={setPrioridade}
              options={PRIORIDADES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
          )}
        </Campo>

        {/* Destino: setor OU pessoa. O setor continua sendo gravado mesmo no
            modo pessoa — é ele que classifica o pedido nos relatórios. */}
        <Campo
          label="Enviar para"
          largo
          dica={destino === "pessoa"
            ? "A pessoa recebe a notificação e pode aprovar ou recusar."
            : "Todo mundo que aprova neste setor é avisado."}
          erro={tentou && faltaPessoa ? "Escolha para quem enviar." : undefined}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {(["setor", "pessoa"] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDestino(d)} aria-pressed={destino === d}
                  style={{
                    flex: 1, minHeight: "var(--tap)", display: "inline-flex", alignItems: "center",
                    justifyContent: "center", gap: 7, borderRadius: "var(--r-sm)", fontSize: 13.5, fontWeight: 600,
                    cursor: "pointer", border: "1px solid var(--border)", boxShadow: "none",
                    color: destino === d ? "#fff" : "var(--text-dim)",
                    background: destino === d ? "var(--primary)" : "var(--surface)",
                  }}>
                  <Icon name={d === "setor" ? "users" : "user"} size={16} color={destino === d ? "#fff" : "var(--text-dim)"} />
                  {d === "setor" ? "Um setor" : "Uma pessoa"}
                </button>
              ))}
            </div>
            {destino === "setor" ? (
              <GlassSelect value={setor} onChange={(v) => { setSetor(v); setSetorTocado(true); }}
                options={SETORES_DESTINO.map((s) => ({ value: s, label: s }))} />
            ) : (
              <GlassSelect
                value={pessoaId}
                onChange={(v) => { setPessoaId(v); if (v) setTentou(false); }}
                options={[
                  // "Carregando…" eterno quando a busca falha é pior que dizer
                  // que não há ninguém: a pessoa fica esperando um select que
                  // nunca vai encher.
                  { value: "", label: pessoas.length ? "Escolha a pessoa…" : pessoasProntas ? "Ninguém disponível" : "Carregando…" },
                  ...pessoas.map((p) => ({ value: p.id, label: p.setor ? `${p.name} · ${p.setor}` : p.name })),
                ]}
              />
            )}
          </div>
        </Campo>

        <Campo label="Descrição (opcional)" largo>
          {(id) => (
            <textarea id={id} value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3}
              placeholder="Detalhe o que precisa, prazo, quantidade…" />
          )}
        </Campo>

        <Campo
          label="Imagens (opcional)"
          largo
          dica={`Foto explica melhor que texto. Até ${MAX_IMAGENS_SOLICITACAO}.`}
        >
          <div>
            <input
              ref={arquivo} type="file" accept="image/*" multiple hidden
              onChange={(e) => anexar(e.target.files)}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {anexos.map((a) => (
                <div key={a.id} style={{
                  position: "relative", width: 84, height: 84, borderRadius: "var(--r-sm)", overflow: "hidden",
                  border: `1px solid ${a.erro ? "var(--tf-neg, var(--perigo))" : "var(--border)"}`, flex: "none",
                  background: "var(--surface)",
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.previa} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: a.url ? 1 : .5 }} />
                  {!a.url && !a.erro && (
                    <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                      <Icon name="loader" size={20} className="spin" />
                    </span>
                  )}
                  {a.erro && (
                    <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)" }}>
                      <Icon name="alert-triangle" size={20} color="#fff" />
                    </span>
                  )}
                  <span style={{ position: "absolute", top: 2, right: 2 }}>
                    {/* `secundario` e não `sutil`: sobre a foto, um botão
                        transparente some justamente onde a imagem é clara. */}
                    <BotaoIcone icone="x" titulo="Remover imagem" variante="secundario" tamanho="sm" onClick={() => remover(a.id)} />
                  </span>
                </div>
              ))}
              {anexos.length < MAX_IMAGENS_SOLICITACAO && (
                <Botao icone="photo" onClick={() => arquivo.current?.click()}>Adicionar</Botao>
              )}
            </div>
          </div>
        </Campo>
      </Campos>
    </PainelLateral>
  );
}

// ── Recusa ───────────────────────────────────────────────────────────────────
// Era `prompt()`: no celular vira um alerta cinza sem contexto e, em WebView,
// simplesmente não aparece — a recusa ficava impossível.

export function RecusarPainel({ s, onClose, onConfirmar }: {
  s: Solic; onClose: () => void; onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <PainelLateral
      titulo="Recusar solicitação"
      subtitulo={s.titulo}
      onFechar={onClose}
      largura={440}
      rodape={
        <Acoes>
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="perigo" icone="x" onClick={() => onConfirmar(motivo.trim())}>Recusar</Botao>
        </Acoes>
      }
    >
      <Campo label="Motivo" dica="Quem pediu vê este texto no cartão.">
        {(id) => (
          <textarea id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} autoFocus
            placeholder="Ex: já temos em estoque, retire com a produção." />
        )}
      </Campo>
    </PainelLateral>
  );
}

// ── Visualizador de imagem ───────────────────────────────────────────────────

export function Lightbox({ imagens, inicial, onClose }: { imagens: string[]; inicial: number; onClose: () => void }) {
  const [i, setI] = useState(inicial);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => (n + 1) % imagens.length);
      if (e.key === "ArrowLeft") setI((n) => (n - 1 + imagens.length) % imagens.length);
    };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [imagens.length, onClose]);

  if (!montado) return null;

  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label="Imagem da solicitação"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.86)",
        display: "grid", gridTemplateRows: "auto 1fr", gap: 8,
        paddingTop: "calc(10px + var(--safe-t))", paddingBottom: "calc(10px + var(--safe-b))",
        paddingLeft: "calc(10px + var(--safe-l))", paddingRight: "calc(10px + var(--safe-r))",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
        <span style={{ fontSize: 13, opacity: .8 }}>{i + 1} / {imagens.length}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {imagens.length > 1 && (
            <>
              <BotaoIcone icone="chevron-left" titulo="Anterior" variante="secundario" onClick={() => setI((n) => (n - 1 + imagens.length) % imagens.length)} />
              <BotaoIcone icone="chevron-right" titulo="Próxima" variante="secundario" onClick={() => setI((n) => (n + 1) % imagens.length)} />
            </>
          )}
          {/* Sobre o véu preto o `sutil` fica invisível no tema claro. */}
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} />
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imagens[i]} alt={`Imagem ${i + 1}`} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", height: "100%", objectFit: "contain", minHeight: 0 }}
      />
    </div>,
    document.body,
  );
}
