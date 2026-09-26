"use client";

// Peças do painel de candidatos — o cartão compacto do Kanban, as etiquetas,
// e as AÇÕES RÁPIDAS (mover, etiqueta, observação, currículo, arquivar) que
// funcionam igual no Kanban, na lista e no perfil. Ação simples não abre tela:
// mover é escolher no menu; etiqueta e observação abrem uma folha pequena.

import { useState } from "react";
import { ARQUIVADO, DIAS_PARADO, papelDe, seloDaEtapa, type EtapaProcesso } from "@/lib/rh/curriculos/etapas";
import { TETO_OBSERVACAO, iniciaisDe, type CandidatoResumo } from "@/lib/rh/curriculos/tipos";
import type { PoderesRh } from "@/lib/rh/gate";
import { Icon } from "../../Icon";
import { Acoes, Botao, Campo, Chips, PainelLateral, useAcao } from "../../ui/controles";
import { Dropdown, type SecaoDropdown } from "../../ui/Dropdown";
import { toast } from "../../Toast";

// ── Tempo ────────────────────────────────────────────────────────────────────

/** "há 2 horas", "ontem", "há 5 dias", "12/08". */
export function tempoRelativo(iso: string, agora = Date.now()): string {
  const s = Math.max(0, (agora - Date.parse(iso)) / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

export function dataHoraBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " ·");
}

export const diasDesde = (iso: string | null, agora: number) => (iso ? Math.floor((agora - Date.parse(iso)) / 86_400_000) : 0);

// ── Avatar e etiquetas ───────────────────────────────────────────────────────

/** Avatar: foto quando houver; senão, iniciais. O ponto azul é "ninguém abriu ainda". */
export function Iniciais({ nome, novo, tamanho = 36, foto }: { nome: string; novo?: boolean; tamanho?: number; foto?: string | null }) {
  return (
    <span style={{ position: "relative", flex: "none", width: tamanho, height: tamanho }}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" style={{ width: tamanho, height: tamanho, borderRadius: "var(--r-sm)", objectFit: "cover" }} />
      ) : (
        <span aria-hidden style={{
          width: tamanho, height: tamanho, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center",
          background: "color-mix(in srgb, var(--primary-texto) 14%, transparent)", color: "var(--primary-texto)",
          fontWeight: 800, fontSize: tamanho * 0.36, letterSpacing: "-.02em",
        }}>{iniciaisDe(nome)}</span>
      )}
      {novo && <span title="Ainda não aberto" style={{ position: "absolute", top: -3, right: -3, width: 10, height: 10, borderRadius: "50%", background: "var(--azul)", boxShadow: "0 0 0 2px var(--surface)" }} />}
    </span>
  );
}

/** Cor da etiqueta pelo SIGNIFICADO — a paleta semântica, igual nos dois temas. */
function corDaTag(t: string, manual: boolean): string {
  if (manual) return "var(--primary-texto)";
  if (/^sem experi/i.test(t)) return "var(--neutro)";
  if (/experi|superior/i.test(t)) return "var(--ok)";
  if (/imediat|dispon/i.test(t)) return "var(--azul)";
  return "var(--text-dim)";
}

/** Etiquetas: as manuais (do RH) primeiro, com contorno; as da triagem depois. */
export function Etiquetas({ tags, manuais = [], max = 4 }: { tags: string[]; manuais?: string[]; max?: number }) {
  const todas = [...manuais.map((t) => ({ t, m: true })), ...tags.filter((t) => !manuais.includes(t)).map((t) => ({ t, m: false }))];
  if (!todas.length) return null;
  const vis = todas.slice(0, max);
  const resto = todas.length - vis.length;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 5, minWidth: 0 }}>
      {vis.map(({ t, m }) => {
        const cor = corDaTag(t, m);
        return (
          <span key={t} title={m ? "Etiqueta do RH" : "Da triagem automática"} style={{
            fontSize: 11, fontWeight: 700, lineHeight: 1, padding: "4px 7px", borderRadius: "var(--r-pill)", whiteSpace: "nowrap",
            color: cor, background: `color-mix(in srgb, ${cor} 11%, transparent)`,
            boxShadow: m ? `inset 0 0 0 1px color-mix(in srgb, ${cor} 40%, transparent)` : undefined,
          }}>{t}</span>
        );
      })}
      {resto > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", padding: "4px 2px" }}>+{resto}</span>}
    </span>
  );
}

/** Selo de etapa no desenho do `Selo` do sistema, mas sem depender do mapa fixo. */
export function SeloEtapa({ etapas, id }: { etapas: EtapaProcesso[]; id: string }) {
  const s = seloDaEtapa(etapas, id);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: s.cor, whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: s.cor, flex: "none" }} />
      {s.label}
    </span>
  );
}

/** A nota do questionário: "2/2 acertos". Cor pelo aproveitamento. */
export function Nota({ acertos, pontuaveis, compacta }: { acertos?: number; pontuaveis?: number; compacta?: boolean }) {
  if (!pontuaveis) return null;
  const a = acertos ?? 0;
  const cor = a === pontuaveis ? "var(--ok)" : a === 0 ? "var(--perigo)" : "var(--atencao)";
  return (
    <span title={`${a} de ${pontuaveis} respostas certas nas perguntas com gabarito`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: cor, whiteSpace: "nowrap" }}>
      <Icon name="circle-check" size={13} /> {a}/{pontuaveis}{compacta ? "" : " acertos"}
    </span>
  );
}

/** "Parado há 9 dias" — só pra quem está em andamento. */
export function aviso(c: CandidatoResumo, etapas: EtapaProcesso[], agora: number): string | null {
  if (papelDe(etapas, c.status) !== "andamento") return null;
  const d = diasDesde(c.etapa_em ?? c.recebido_em, agora);
  return d > DIAS_PARADO ? `Parado há ${d} dias` : null;
}

// ── O cartão compacto do Kanban ──────────────────────────────────────────────

/**
 * Só o que decide o próximo passo: quem é, pra qual vaga, quando chegou, e
 * no máximo duas etiquetas. O resto está a um toque (o perfil) ou no menu.
 * Arrastável quando a pessoa pode mover; no celular, mover é pelo menu "⋯".
 */
export function CartaoKanban({ c, etapas, agora, podeMover, acoes, aoAbrir, arrastando, aoArrastar }: {
  c: CandidatoResumo;
  etapas: EtapaProcesso[];
  agora: number;
  podeMover: boolean;
  acoes: React.ReactNode;
  aoAbrir: () => void;
  arrastando?: boolean;
  aoArrastar?: (id: string | null) => void;
}) {
  const parado = aviso(c, etapas, agora);
  const tagsTriagem = c.perfil?.tags.filter((t) => t !== "Currículo enviado") ?? [];
  return (
    <article
      className="cv-kcard"
      data-arrastando={arrastando ? "1" : undefined}
      draggable={podeMover}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; aoArrastar?.(c.id); }}
      onDragEnd={() => aoArrastar?.(null)}
      // O cartão inteiro abre o perfil; segurar e arrastar é drag nativo, que
      // não dispara click. O botão de dentro fica pra teclado/leitor de tela.
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) aoAbrir(); }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <button type="button" onClick={aoAbrir} className="cv-kcard-abrir">
          <Iniciais nome={c.nome} novo={c.status === "novo" && !c.visto_em} tamanho={32} />
          <span style={{ minWidth: 0, display: "grid", gap: 1 }}>
            <strong>{c.nome}</strong>
            <small>{c.vaga ?? "Sem vaga"}</small>
          </span>
        </button>
        <span onClick={(e) => e.stopPropagation()} style={{ flex: "none", marginTop: -4, marginRight: -6 }}>{acoes}</span>
      </div>
      {(c.tags.length > 0 || tagsTriagem.length > 0) && <Etiquetas tags={tagsTriagem} manuais={c.tags} max={2} />}
      <div className="cv-kcard-pe">
        <span title={dataHoraBR(c.recebido_em)}><Icon name="clock" size={13} /> {tempoRelativo(c.recebido_em, agora)}</span>
        {c.entrevista_em && <span title="Entrevista"><Icon name="calendar-event" size={13} /> {new Date(c.entrevista_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}</span>}
        {c.perfil?.pontuaveis ? <Nota acertos={c.perfil.acertos} pontuaveis={c.perfil.pontuaveis} compacta /> : null}
        {c.tem_curriculo && <span title="Currículo anexado"><Icon name="file-text" size={13} /></span>}
        {parado && <span className="cv-parado" title={parado}><Icon name="clock-hour-4" size={13} /> {parado.replace("Parado há ", "")}</span>}
      </div>
    </article>
  );
}

// ── Ações rápidas ────────────────────────────────────────────────────────────

export type AcaoRapida =
  | { tipo: "mover"; para: string }
  | { tipo: "tag" }
  | { tipo: "observacao" };

/**
 * O menu "⋯" do candidato — o Dropdown do sistema. Cada item só aparece pra
 * quem tem a chave dele; sem nenhuma ação, o menu nem aparece.
 */
export function MenuAcoes({ c, etapas, poderes, aoAgir }: {
  c: CandidatoResumo; etapas: EtapaProcesso[]; poderes: PoderesRh; aoAgir: (a: AcaoRapida) => void;
}) {
  const secoes: SecaoDropdown[] = [];
  if (poderes.curriculosStatus) {
    secoes.push({
      titulo: "Mover para",
      selecao: "unica",
      indicador: "ponto",
      selecionados: [c.status],
      itens: etapas.filter((e) => e.ativa || e.id === c.status).map((e) => ({ id: e.id, rotulo: e.label, icone: e.icone, cor: e.cor })),
      onSelecao: (ids) => { const para = ids[0]; if (para && para !== c.status) aoAgir({ tipo: "mover", para }); },
    });
  }
  const itens: SecaoDropdown["itens"] = [];
  if (poderes.curriculosEditar) {
    itens.push({ id: "tag", rotulo: "Etiqueta", icone: "tag", onSelect: () => aoAgir({ tipo: "tag" }) });
    itens.push({ id: "obs", rotulo: "Observação", icone: "notes", onSelect: () => aoAgir({ tipo: "observacao" }) });
  }
  if (c.curriculo_url) {
    itens.push({ id: "ver", rotulo: "Ver currículo", icone: "eye", href: c.curriculo_url, novaAba: true });
    itens.push({ id: "baixar", rotulo: "Baixar currículo", icone: "download", href: `${c.curriculo_url}?download=1&nome=${encodeURIComponent(c.curriculo_nome ?? "curriculo")}`, novaAba: true });
  }
  itens.push({ id: "abrir", rotulo: "Abrir perfil", icone: "arrow-right", href: `/rh/curriculos/${c.id}` });
  secoes.push({ itens });
  if (poderes.curriculosStatus) {
    secoes.push({
      itens: [c.status === ARQUIVADO
        ? { id: "desarq", rotulo: "Voltar pro quadro", icone: "arrow-back-up", onSelect: () => aoAgir({ tipo: "mover", para: "novo" }) }
        : { id: "arq", rotulo: "Arquivar", icone: "archive", perigo: true, onSelect: () => aoAgir({ tipo: "mover", para: ARQUIVADO }) }],
    });
  }
  return <Dropdown titulo={`Ações de ${c.nome}`} secoes={secoes} alinhar="fim" largura={230} />;
}

// ── As duas folhas pequenas: etiqueta e observação ───────────────────────────

async function chamar(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error((j.erro as string) || "Não foi possível salvar.");
  return j;
}

export function FolhaEtiquetas({ c, sugestoes, aoFechar, aoSalvar }: {
  c: CandidatoResumo; sugestoes: string[]; aoFechar: () => void; aoSalvar: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(c.tags);
  const [nova, setNova] = useState("");
  const adicionar = () => {
    const t = nova.trim().slice(0, 32);
    if (t && !tags.includes(t) && tags.length < 12) setTags([...tags, t]);
    setNova("");
  };
  const salvar = useAcao(async () => {
    await chamar(`/api/rh/curriculos/${c.id}`, { method: "PATCH", body: JSON.stringify({ tags }) });
    aoSalvar(tags);
    toast("Etiquetas salvas.");
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });
  const opcoes = [...new Set([...tags, ...sugestoes])].slice(0, 16);
  return (
    <PainelLateral centrado soFechaNoX icone="tag" titulo="Etiquetas" subtitulo={c.nome} onFechar={aoFechar} largura={460}
      rodape={<Acoes><Botao variante="sutil" onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" icone="check" estado={salvar.estado} onClick={() => void salvar.rodar()}>Salvar</Botao></Acoes>}>
      <div style={{ display: "grid", gap: 14 }}>
        <Campo label="Nova etiqueta" dica="Enter adiciona. Ex.: Excel, Boa comunicação, Retornar em outubro.">
          {(id) => (
            <div style={{ display: "flex", gap: 8 }}>
              <input id={id} value={nova} maxLength={32} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }} style={{ flex: 1, minWidth: 0 }} autoFocus />
              <Botao icone="plus" onClick={adicionar} disabled={!nova.trim()}>Adicionar</Botao>
            </div>
          )}
        </Campo>
        {opcoes.length > 0 && (
          <Chips<string> rotulo="Etiquetas do candidato" valor={tags} onMuda={setTags} opcoes={opcoes.map((t) => ({ valor: t, rotulo: t }))} />
        )}
      </div>
    </PainelLateral>
  );
}

export function FolhaObservacao({ c, aoFechar, aoSalvar }: { c: CandidatoResumo; aoFechar: () => void; aoSalvar?: () => void }) {
  const [texto, setTexto] = useState("");
  const salvar = useAcao(async () => {
    if (!texto.trim()) { toast("Escreva a observação.", "erro"); return false; }
    await chamar(`/api/rh/curriculos/${c.id}/observacoes`, { method: "POST", body: JSON.stringify({ texto: texto.trim() }) });
    toast("Observação registrada.");
    aoSalvar?.();
    aoFechar();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });
  return (
    <PainelLateral centrado soFechaNoX icone="notes" titulo="Observação interna" subtitulo={`${c.nome} · o candidato nunca vê`} onFechar={aoFechar} largura={520}
      rodape={<Acoes><Botao variante="sutil" onClick={aoFechar}>Cancelar</Botao><Botao variante="primario" icone="check" estado={salvar.estado} onClick={() => void salvar.rodar()} disabled={!texto.trim()}>Registrar</Botao></Acoes>}>
      <Campo label="Observação" dica={`${texto.length}/${TETO_OBSERVACAO}`}>
        {(id) => <textarea id={id} rows={5} value={texto} autoFocus onChange={(e) => setTexto(e.target.value.slice(0, TETO_OBSERVACAO))} placeholder="Ex.: boa comunicação na ligação; pedir referência da última empresa." />}
      </Campo>
    </PainelLateral>
  );
}
