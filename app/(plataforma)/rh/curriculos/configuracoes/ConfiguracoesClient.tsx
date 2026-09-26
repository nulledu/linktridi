"use client";

// Configurações → Currículos.
//
// Quatro abas, cada uma com um assunto só:
//   Formulário — textos de apresentação e final, logo e personagens
//   Etapas     — liga/desliga e ordem das etapas; título e personagem de cada
//   Perguntas  — o gerenciador: tipo, obrigatória, ordem e condição
//   Vagas      — perguntas específicas de cada vaga (entram na etapa marcada)
//
// O formulário inteiro é um rascunho local até "Salvar": trocar de aba não
// perde nada, e o servidor normaliza o que chega (não dá pra apagar o nome,
// o contato nem o currículo). As perguntas de VAGA salvam por vaga, na hora.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TIPOS_PERGUNTA, perguntasPorEtapa,
  type ConfigFormulario, type EtapaFormulario, type Pergunta,
} from "@/lib/rh/curriculos/formulario";
import { POSES, srcDaPose, type Pose } from "@/lib/rh/curriculos/personagens";
import type { VagaRh } from "@/lib/rh/curriculos/tipos";
import { CORES_ETAPA, PAPEIS, type EtapaProcesso, type PapelEtapa } from "@/lib/rh/curriculos/etapas";
import { Icon } from "../../../Icon";
import { Abas } from "../../../ui/Abas";
import { Botao, BotaoIcone, Campo, Interruptor, useAcao } from "../../../ui/controles";
import { GlassSelect } from "../../../GlassPicker";
import { toast, confirmar } from "../../../Toast";
import { AvisoSchema, Cabecalho, Cartao, NotaRodape, TituloCartao, Vazio } from "../../../financeiro/ui";
import { EditorPergunta, PerguntaNova } from "./EditorPergunta";

type Aba = "processo" | "formulario" | "etapas" | "perguntas" | "vagas";

async function chamar(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error((j.erro as string) || "Não foi possível salvar.");
  return j;
}

const OPCOES_POSE = [{ value: "", label: "Sem personagem" }, ...POSES.map((p) => ({ value: p.id, label: `${p.nome} — ${p.uso}` }))];

function mover<T>(lista: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= lista.length) return lista;
  const n = [...lista];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

export function ConfiguracoesClient({ inicial, personalizado, vagas: vagasIniciais, schemaPendente, podeEditarVagas = true, etapasProcesso }: {
  inicial: ConfigFormulario; personalizado: boolean; vagas: VagaRh[]; schemaPendente: boolean;
  /** As colunas do Kanban. */
  etapasProcesso: EtapaProcesso[];
  /** Pergunta de vaga grava na vaga — é `rh:curriculos_editar`, como o resto do cadastro da vaga. */
  podeEditarVagas?: boolean;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("formulario");
  const [cfg, setCfg] = useState<ConfigFormulario>(inicial);
  const [salvo, setSalvo] = useState(() => JSON.stringify(inicial));
  const sujo = JSON.stringify(cfg) !== salvo;

  const salvar = useAcao(async () => {
    const j = await chamar("/api/rh/curriculos/formulario", { method: "PUT", body: JSON.stringify({ config: cfg }) });
    const novo = j.config as ConfigFormulario;
    setCfg(novo); setSalvo(JSON.stringify(novo));
    toast("Formulário salvo. Já vale pra quem abrir o link.");
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  const restaurar = async () => {
    const ok = await confirmar("Voltar ao formulário padrão?", { detalhe: "Etapas, perguntas, textos e personagens voltam ao original. Candidatos já recebidos não mudam.", perigo: true });
    if (!ok) return;
    try {
      const j = await chamar("/api/rh/curriculos/formulario", { method: "PUT", body: JSON.stringify({ restaurar: true }) });
      const novo = j.config as ConfigFormulario;
      setCfg(novo); setSalvo(JSON.stringify(novo));
      toast("Formulário padrão restaurado.");
      router.refresh();
    } catch (e) { toast((e as Error).message, "erro"); }
  };

  const setAbertura = (patch: Partial<ConfigFormulario["abertura"]>) => setCfg((a) => ({ ...a, abertura: { ...a.abertura, ...patch } }));
  const setFinal = (patch: Partial<ConfigFormulario["final"]>) => setCfg((a) => ({ ...a, final: { ...a.final, ...patch } }));
  const setEtapa = (id: string, patch: Partial<EtapaFormulario>) => setCfg((a) => ({ ...a, etapas: a.etapas.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  return (
    <>
      <Cabecalho
        tarja="RH · CONFIGURAÇÕES"
        titulo="Currículos"
        sub="O formulário que o candidato responde e o que chega pro RH."
        acoes={
          <>
            <Botao icone="arrow-left" variante="sutil" onClick={() => router.push("/rh/curriculos")}>Currículos</Botao>
            <Botao icone="eye" onClick={() => window.open("/curriculo?previa=1", "_blank", "noopener")} title={sujo ? "A prévia mostra o que está SALVO" : undefined}>Prévia</Botao>
            <Botao variante="primario" icone="check" estado={salvar.estado} disabled={!sujo} onClick={() => void salvar.rodar()}>
              {sujo ? "Salvar" : "Salvo"}
            </Botao>
          </>
        }
      />
      {schemaPendente && <AvisoSchema modulo="RH" arquivo="supabase/rh_curriculos.sql" />}

      <div style={{ marginBottom: 16 }}>
        <Abas<Aba>
          ariaLabel="Configurações de currículos"
          valor={aba}
          onMuda={setAba}
          itens={[
            { valor: "processo", rotulo: "Processo" },
            { valor: "formulario", rotulo: "Formulário" },
            { valor: "etapas", rotulo: "Etapas" },
            { valor: "perguntas", rotulo: "Perguntas" },
            { valor: "vagas", rotulo: "Vagas" },
          ]}
        />
      </div>

      {aba === "processo" && <AbaProcesso inicial={etapasProcesso} />}
      {aba === "formulario" && <AbaFormulario cfg={cfg} setCfg={setCfg} setAbertura={setAbertura} setFinal={setFinal} />}
      {aba === "etapas" && <AbaEtapas cfg={cfg} setCfg={setCfg} setEtapa={setEtapa} />}
      {aba === "perguntas" && <AbaPerguntas cfg={cfg} setCfg={setCfg} />}
      {aba === "vagas" && <AbaVagas cfg={cfg} vagasIniciais={vagasIniciais} podeEditar={podeEditarVagas} />}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 18 }}>
        {aba !== "vagas" && aba !== "processo" && (
          <Botao variante="primario" icone="check" estado={salvar.estado} disabled={!sujo} onClick={() => void salvar.rodar()}>
            {sujo ? "Salvar alterações" : "Tudo salvo"}
          </Botao>
        )}
        {sujo && aba !== "vagas" && aba !== "processo" && <Botao variante="sutil" onClick={() => setCfg(JSON.parse(salvo))}>Descartar</Botao>}
        <span style={{ flex: 1 }} />
        {personalizado && aba !== "processo" && <Botao variante="sutil" icone="refresh" onClick={() => void restaurar()}>Restaurar padrão</Botao>}
      </div>
    </>
  );
}

// ── Formulário: textos, logo e personagens ───────────────────────────────────

function AbaFormulario({ cfg, setCfg, setAbertura, setFinal }: {
  cfg: ConfigFormulario;
  setCfg: React.Dispatch<React.SetStateAction<ConfigFormulario>>;
  setAbertura: (p: Partial<ConfigFormulario["abertura"]>) => void;
  setFinal: (p: Partial<ConfigFormulario["final"]>) => void;
}) {
  const setDestaque = (i: number, patch: Partial<ConfigFormulario["abertura"]["destaques"][number]>) =>
    setAbertura({ destaques: cfg.abertura.destaques.map((d, k) => (k === i ? { ...d, ...patch } : d)) });
  return (
    <div style={{ display: "grid", gap: 16, alignItems: "start", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Cartao estatico>
          <TituloCartao icone="sparkles">Apresentação</TituloCartao>
          <div style={{ display: "grid", gap: 14 }}>
            <Interruptor ligado={cfg.abertura.ativa} onChange={(v) => setAbertura({ ativa: v })} rotulo="Tela de apresentação" dica="Desligada, o link já abre em “Vamos começar”." />
            <Campo label="Título" dica="O trecho entre *asteriscos* sai em roxo.">
              {(id) => <input id={id} value={cfg.abertura.titulo} maxLength={200} onChange={(e) => setAbertura({ titulo: e.target.value })} />}
            </Campo>
            <Campo label="Texto de apoio">
              {(id) => <textarea id={id} rows={2} value={cfg.abertura.sub} maxLength={400} onChange={(e) => setAbertura({ sub: e.target.value })} />}
            </Campo>
            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Destaques</strong>
              {cfg.abertura.destaques.map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input aria-label={`Destaque ${i + 1}`} value={d.titulo} maxLength={120} onChange={(e) => setDestaque(i, { titulo: e.target.value })} style={{ flex: "2 1 200px", minWidth: 0 }} />
                  <input aria-label={`Complemento do destaque ${i + 1}`} value={d.sub} maxLength={160} onChange={(e) => setDestaque(i, { sub: e.target.value })} style={{ flex: "2 1 200px", minWidth: 0 }} />
                  <BotaoIcone icone="trash" titulo="Remover destaque" variante="sutil" onClick={() => setAbertura({ destaques: cfg.abertura.destaques.filter((_, k) => k !== i) })} />
                </div>
              ))}
              {cfg.abertura.destaques.length < 4 && (
                <div><Botao variante="sutil" tamanho="sm" icone="plus" onClick={() => setAbertura({ destaques: [...cfg.abertura.destaques, { icone: "sparkles", titulo: "Novo destaque", sub: "" }] })}>Destaque</Botao></div>
              )}
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
              <Campo label="Personagem">{(id) => <GlassSelect id={id} value={cfg.abertura.personagem ?? ""} onChange={(v) => setAbertura({ personagem: (v || null) as Pose | null })} options={OPCOES_POSE} />}</Campo>
              <Campo label="Frase manuscrita">{(id) => <input id={id} value={cfg.abertura.nota} maxLength={80} onChange={(e) => setAbertura({ nota: e.target.value })} />}</Campo>
            </div>
          </div>
        </Cartao>

        <Cartao estatico>
          <TituloCartao icone="circle-check">Mensagem final</TituloCartao>
          <div style={{ display: "grid", gap: 14 }}>
            <Campo label="Título" dica="{nome} vira o primeiro nome do candidato.">
              {(id) => <input id={id} value={cfg.final.titulo} maxLength={200} onChange={(e) => setFinal({ titulo: e.target.value })} />}
            </Campo>
            <Campo label="Texto">{(id) => <textarea id={id} rows={2} value={cfg.final.sub} maxLength={400} onChange={(e) => setFinal({ sub: e.target.value })} />}</Campo>
            <Campo label="Próximo passo">{(id) => <textarea id={id} rows={2} value={cfg.final.proximo} maxLength={400} onChange={(e) => setFinal({ proximo: e.target.value })} />}</Campo>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
              <Campo label="Personagem">{(id) => <GlassSelect id={id} value={cfg.final.personagem ?? ""} onChange={(v) => setFinal({ personagem: (v || null) as Pose | null })} options={OPCOES_POSE} />}</Campo>
              <Campo label="Frase manuscrita">{(id) => <input id={id} value={cfg.final.nota} maxLength={80} onChange={(e) => setFinal({ nota: e.target.value })} />}</Campo>
            </div>
          </div>
        </Cartao>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <Cartao estatico>
          <TituloCartao icone="photo">Logo</TituloCartao>
          <Campo label="Endereço da imagem" dica="SVG ou PNG já publicado (https://… ou /caminho). Vazio = o nome “Tridi” em texto.">
            {(id) => <input id={id} value={cfg.logo_url ?? ""} maxLength={500} placeholder="https://…/logo.svg" onChange={(e) => setCfg((a) => ({ ...a, logo_url: e.target.value.trim() || null }))} />}
          </Campo>
          <div style={{ marginTop: 12, padding: 14, borderRadius: "var(--r-sm)", background: "#f4f1fb", display: "flex", alignItems: "center", minHeight: 58 }}>
            {cfg.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={cfg.logo_url} alt="Prévia da logo" style={{ height: 30, width: "auto", maxWidth: "100%" }} />
              : <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: "-.04em", color: "#6D1192" }}>T<span style={{ color: "#8b3ac6" }}>ridi</span></span>}
          </div>
        </Cartao>

        <Cartao estatico>
          <TituloCartao icone="mood-smile">Personagens</TituloCartao>
          <Interruptor ligado={cfg.personagens} onChange={(v) => setCfg((a) => ({ ...a, personagens: v }))} rotulo="Mostrar os personagens" dica="Desligado, sobra só a frase manuscrita. A escolha por etapa fica na aba Etapas." />
          <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 120px), 1fr))", opacity: cfg.personagens ? 1 : 0.45 }}>
            {POSES.map((p) => (
              <li key={p.id} style={{ display: "grid", justifyItems: "center", gap: 6, padding: "10px 6px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", textAlign: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={srcDaPose(p.id)} alt={p.nome} loading="lazy" style={{ height: 96, width: "auto" }} />
                <strong style={{ fontSize: 12 }}>{p.uso}</strong>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </div>
  );
}

// ── Etapas: liga, ordem, título, personagem ──────────────────────────────────

function AbaEtapas({ cfg, setCfg, setEtapa }: {
  cfg: ConfigFormulario;
  setCfg: React.Dispatch<React.SetStateAction<ConfigFormulario>>;
  setEtapa: (id: string, p: Partial<EtapaFormulario>) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const porId = new Map(cfg.perguntas.map((p) => [p.id, p]));
  return (
    <Cartao estatico>
      <TituloCartao icone="route">Etapas do formulário</TituloCartao>
      <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 12px" }}>
        Etapa sem pergunta visível pro candidato some sozinha (quem não estuda não vê a de formação). “Dados pessoais” e “Currículo” não desligam.
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {cfg.etapas.map((e, i) => {
          const ativas = e.perguntas.filter((id) => porId.get(id)?.ativa).length;
          const ultima = e.id === "curriculo";
          return (
            <li key={e.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", opacity: e.ativa ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", flexWrap: "wrap" }}>
                <span className="mt-num" style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--surface-2)", fontSize: 12.5, fontWeight: 800, flex: "none" }}>{i + 1}</span>
                <span style={{ flex: "1 1 160px", minWidth: 0, display: "grid" }}>
                  <strong style={{ fontSize: 14 }}>{e.rotulo}</strong>
                  <small style={{ color: "var(--text-dim)" }}>
                    {ativas} pergunta{ativas === 1 ? "" : "s"}{e.uma_por_tela ? " · uma por tela" : ""}{e.recebe_vaga ? " · recebe as da vaga" : ""}{e.personagem ? " · com personagem" : ""}
                  </small>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}>
                  <Interruptor ligado={e.ativa} desativado={!!e.fixa} titulo={`Etapa ${e.rotulo} ativa`} onChange={(v) => setEtapa(e.id, { ativa: v })} />
                  <BotaoIcone icone="arrow-up" titulo="Subir" variante="sutil" disabled={i === 0 || ultima} onClick={() => setCfg((a) => ({ ...a, etapas: mover(a.etapas, i, -1) }))} />
                  <BotaoIcone icone="arrow-down" titulo="Descer" variante="sutil" disabled={ultima || i >= cfg.etapas.length - 2} onClick={() => setCfg((a) => ({ ...a, etapas: mover(a.etapas, i, 1) }))} />
                  <BotaoIcone icone={aberta === e.id ? "chevron-up" : "edit"} titulo="Editar etapa" variante="sutil" onClick={() => setAberta(aberta === e.id ? null : e.id)} />
                </span>
              </div>
              {aberta === e.id && (
                <div style={{ display: "grid", gap: 12, padding: "4px 14px 14px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", paddingTop: 10 }}>
                    <Campo label="Rótulo (cabeçalho)">{(id) => <input id={id} value={e.rotulo} maxLength={60} onChange={(x) => setEtapa(e.id, { rotulo: x.target.value })} />}</Campo>
                    <Campo label="Título" dica="Aparece quando as perguntas ficam juntas.">{(id) => <input id={id} value={e.titulo} maxLength={200} onChange={(x) => setEtapa(e.id, { titulo: x.target.value })} />}</Campo>
                  </div>
                  <Campo label="Texto de apoio">{(id) => <input id={id} value={e.sub ?? ""} maxLength={300} onChange={(x) => setEtapa(e.id, { sub: x.target.value || undefined })} />}</Campo>
                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
                    <Campo label="Personagem">{(id) => <GlassSelect id={id} value={e.personagem ?? ""} onChange={(v) => setEtapa(e.id, { personagem: (v || null) as Pose | null })} options={OPCOES_POSE} />}</Campo>
                    <Campo label="Frase manuscrita">{(id) => <input id={id} value={e.nota ?? ""} maxLength={80} onChange={(x) => setEtapa(e.id, { nota: x.target.value || undefined })} />}</Campo>
                  </div>
                  <Interruptor ligado={!!e.uma_por_tela} onChange={(v) => setEtapa(e.id, { uma_por_tela: v || undefined })} rotulo="Uma pergunta por tela" dica="Bom pra perguntas abertas. As condicionadas à anterior aparecem junto dela." />
                  <Interruptor ligado={!!e.recebe_vaga} desativado={!!e.recebe_vaga}
                    onChange={() => setCfg((a) => ({ ...a, etapas: a.etapas.map((x) => ({ ...x, recebe_vaga: x.id === e.id ? true : undefined })) }))}
                    rotulo="Recebe as perguntas da vaga" dica="Só uma etapa recebe. As da vaga entram antes das outras." />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Cartao>
  );
}

// ── Perguntas: o gerenciador ─────────────────────────────────────────────────

function Selinho({ children, cor = "var(--text-dim)" }: { children: React.ReactNode; cor?: string }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 7px", borderRadius: "var(--r-pill)", color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)`, whiteSpace: "nowrap" }}>{children}</span>;
}

function LinhaPergunta({ p, porId, primeira, ultima, aoSubir, aoDescer, aoEditar }: {
  p: Pergunta; porId: Map<string, Pergunta>; primeira: boolean; ultima: boolean;
  aoSubir: () => void; aoDescer: () => void; aoEditar: () => void;
}) {
  const tipo = TIPOS_PERGUNTA.find((t) => t.valor === p.tipo);
  const cond = p.quando?.[0];
  const alvo = cond ? porId.get(cond.pergunta) : null;
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", opacity: p.ativa ? 1 : 0.55, flexWrap: "wrap" }}>
      <Icon name={tipo?.icone ?? "forms"} size={18} color="var(--primary-texto)" style={{ flex: "none" }} />
      <button type="button" onClick={aoEditar} style={{ flex: "1 1 200px", minWidth: 0, display: "grid", gap: 4, textAlign: "left", background: "none", border: 0, color: "var(--text)", cursor: "pointer", padding: 0, minHeight: "var(--tap)", alignContent: "center" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>{p.titulo.replace(/\*/g, "")}</span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Selinho>{tipo?.label}</Selinho>
          {p.obrigatoria && <Selinho cor="var(--primary-texto)">Obrigatória</Selinho>}
          {!p.ativa && <Selinho>Inativa</Selinho>}
          {p.fixa && <Selinho>Sistema</Selinho>}
          {p.opcoes?.some((o) => o.certa) && <Selinho cor="var(--ok)">Pontua</Selinho>}
          {cond && <Selinho cor="var(--azul)">Se “{(alvo?.titulo ?? cond.pergunta).replace(/\*/g, "").slice(0, 32)}{(alvo?.titulo.length ?? 0) > 32 ? "…" : ""}”</Selinho>}
        </span>
      </button>
      <span style={{ display: "flex", gap: 2, flex: "none" }}>
        <BotaoIcone icone="arrow-up" titulo="Subir" variante="sutil" disabled={primeira} onClick={aoSubir} />
        <BotaoIcone icone="arrow-down" titulo="Descer" variante="sutil" disabled={ultima} onClick={aoDescer} />
        <BotaoIcone icone="edit" titulo="Editar" variante="sutil" onClick={aoEditar} />
      </span>
    </li>
  );
}

function AbaPerguntas({ cfg, setCfg }: { cfg: ConfigFormulario; setCfg: React.Dispatch<React.SetStateAction<ConfigFormulario>> }) {
  const [editando, setEditando] = useState<{ etapa: string; p: Pergunta; nova: boolean } | null>(null);
  const porId = useMemo(() => new Map(cfg.perguntas.map((p) => [p.id, p])), [cfg.perguntas]);
  const ordem = useMemo(() => cfg.etapas.flatMap((e) => e.perguntas), [cfg.etapas]);
  const anterioresDe = (id: string | null, etapa: string) => {
    const lim = id && ordem.includes(id) ? ordem.indexOf(id) : ordem.indexOf(cfg.etapas.find((e) => e.id === etapa)?.perguntas.at(-1) ?? "") + 1;
    return ordem.slice(0, Math.max(0, lim)).map((x) => porId.get(x)).filter((p): p is Pergunta => !!p && p.tipo !== "upload");
  };

  const aplicar = (etapa: string, p: Pergunta, nova: boolean) => {
    setCfg((a) => ({
      ...a,
      perguntas: nova ? [...a.perguntas, p] : a.perguntas.map((x) => (x.id === p.id ? p : x)),
      etapas: nova ? a.etapas.map((e) => (e.id === etapa ? { ...e, perguntas: [...e.perguntas, p.id] } : e)) : a.etapas,
    }));
    setEditando(null);
  };
  const apagar = async (p: Pergunta) => {
    const dependentes = cfg.perguntas.filter((q) => q.quando?.some((c) => c.pergunta === p.id));
    const ok = await confirmar("Apagar a pergunta?", {
      detalhe: dependentes.length
        ? `${dependentes.length} pergunta(s) dependem dela e perdem a condição. Respostas já recebidas continuam nos candidatos.`
        : "Respostas já recebidas continuam nos candidatos.",
      perigo: true,
    });
    if (!ok) return;
    setCfg((a) => ({
      ...a,
      perguntas: a.perguntas.filter((x) => x.id !== p.id).map((q) => (q.quando?.some((c) => c.pergunta === p.id) ? { ...q, quando: q.quando.filter((c) => c.pergunta !== p.id) } : q)),
      etapas: a.etapas.map((e) => ({ ...e, perguntas: e.perguntas.filter((x) => x !== p.id) })),
    }));
    setEditando(null);
  };
  const moverNaEtapa = (etapa: string, i: number, d: -1 | 1) =>
    setCfg((a) => ({ ...a, etapas: a.etapas.map((e) => (e.id === etapa ? { ...e, perguntas: mover(e.perguntas, i, d) } : e)) }));

  const visiveisPorEtapa = perguntasPorEtapa({ ...cfg, etapas: cfg.etapas.map((e) => ({ ...e, ativa: true })), perguntas: cfg.perguntas.map((p) => ({ ...p, ativa: true })) });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <NotaRodape icone="info-circle">
        Condição = a pergunta só aparece quando a resposta anterior bate. Ex.: “O que você está estudando?” só pra quem marcou <b>Estou estudando</b> ou <b>Trabalho e estudo</b>.
      </NotaRodape>
      {visiveisPorEtapa.map(({ etapa }) => {
        const itens = etapa.perguntas.map((id) => porId.get(id)).filter((p): p is Pergunta => !!p);
        const soCv = etapa.id === "curriculo";
        return (
          <Cartao estatico key={etapa.id}>
            <TituloCartao icone="forms" direita={
              soCv ? undefined : <Botao tamanho="sm" icone="plus" onClick={() => setEditando({ etapa: etapa.id, p: PerguntaNova(new Set(porId.keys())), nova: true })}>Pergunta</Botao>
            }>
              {etapa.rotulo}{!cfg.etapas.find((e) => e.id === etapa.id)?.ativa && <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}> · desligada</span>}
            </TituloCartao>
            {itens.length === 0 ? (
              <Vazio compacto icone="forms" titulo="Nenhuma pergunta nesta etapa." />
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                {itens.map((p, i) => (
                  <LinhaPergunta key={p.id} p={p} porId={porId} primeira={i === 0} ultima={i === itens.length - 1}
                    aoSubir={() => moverNaEtapa(etapa.id, i, -1)} aoDescer={() => moverNaEtapa(etapa.id, i, 1)}
                    aoEditar={() => setEditando({ etapa: etapa.id, p, nova: false })} />
                ))}
              </ul>
            )}
          </Cartao>
        );
      })}

      {editando && (
        <EditorPergunta
          inicial={editando.p}
          nova={editando.nova}
          anteriores={anterioresDe(editando.nova ? null : editando.p.id, editando.etapa)}
          idsEmUso={new Set(porId.keys())}
          aoSalvar={(p) => aplicar(editando.etapa, p, editando.nova)}
          aoApagar={editando.nova ? undefined : () => void apagar(editando.p)}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

// ── Vagas: perguntas específicas ─────────────────────────────────────────────

function AbaVagas({ cfg, vagasIniciais, podeEditar }: { cfg: ConfigFormulario; vagasIniciais: VagaRh[]; podeEditar: boolean }) {
  const router = useRouter();
  const [vagas, setVagas] = useState(vagasIniciais);
  const [vagaId, setVagaId] = useState(vagasIniciais.find((v) => v.status === "aberta")?.id ?? vagasIniciais[0]?.id ?? "");
  const [editando, setEditando] = useState<{ p: Pergunta; nova: boolean } | null>(null);
  const vaga = vagas.find((v) => v.id === vagaId);
  const perguntas = vaga?.perguntas ?? [];
  const etapaDaVaga = cfg.etapas.find((e) => e.recebe_vaga);
  // A condição de uma pergunta de vaga pode olhar o formulário geral (ex.: só
  // pra quem trabalha) ou uma pergunta anterior da própria vaga.
  const geraisAntes = useMemo(() => {
    const ordem = cfg.etapas.flatMap((e) => (e.recebe_vaga ? [] : e.perguntas));
    const i = cfg.etapas.findIndex((e) => e.recebe_vaga);
    const antes = cfg.etapas.slice(0, Math.max(0, i)).flatMap((e) => e.perguntas);
    return (i >= 0 ? antes : ordem).map((id) => cfg.perguntas.find((p) => p.id === id)).filter((p): p is Pergunta => !!p && p.ativa && p.tipo !== "upload");
  }, [cfg]);

  const gravar = useAcao(async (lista: Pergunta[]) => {
    await chamar("/api/rh/curriculos/vagas", { method: "PATCH", body: JSON.stringify({ id: vagaId, perguntas: lista }) });
    setVagas((a) => a.map((v) => (v.id === vagaId ? { ...v, perguntas: lista } : v)));
    toast("Perguntas da vaga salvas.");
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  if (!vagas.length) {
    return (
      <Cartao estatico>
        <Vazio icone="briefcase" titulo="Nenhuma vaga cadastrada." detalhe="Crie a vaga em “Link e vagas” e volte aqui para dar perguntas específicas a ela."
          acao={<Botao icone="link" onClick={() => router.push("/rh/curriculos/integracao")}>Link e vagas</Botao>} />
      </Cartao>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Cartao estatico>
        <TituloCartao icone="briefcase">Perguntas por vaga</TituloCartao>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 12px" }}>
          Perguntas gerais + as da vaga: quem se candidata pelo link da vaga responde as duas. Elas entram em <b>{etapaDaVaga?.rotulo ?? "Conte um pouco mais"}</b>, antes das outras. Salva na hora, por vaga.
        </p>
        <div style={{ maxWidth: 420 }}>
          <GlassSelect aria-label="Vaga" value={vagaId} onChange={setVagaId}
            options={vagas.map((v) => ({ value: v.id, label: `${v.titulo}${v.status === "aberta" ? "" : ` · ${v.status}`} (${v.perguntas?.length ?? 0})` }))} />
        </div>
      </Cartao>

      {vaga && (
        <Cartao estatico>
          <TituloCartao icone="forms" direita={
            <Botao tamanho="sm" icone="plus" disabled={!podeEditar || perguntas.length >= 20} onClick={() => setEditando({ p: PerguntaNova(new Set(perguntas.map((p) => p.id)), "v_"), nova: true })}>Pergunta</Botao>
          }>
            {vaga.titulo}
          </TituloCartao>
          {!podeEditar && (
            <div style={{ marginBottom: 12 }}>
              <NotaRodape icone="key">Editar as perguntas da vaga pede <code>rh:curriculos_editar</code> — a mesma chave do cadastro da vaga.</NotaRodape>
            </div>
          )}
          {perguntas.length === 0 ? (
            <Vazio compacto icone="forms" titulo="Sem perguntas específicas." detalhe="Ex.: “Você possui experiência com Excel?”, “Já trabalhou com atendimento?”" />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {perguntas.map((p, i) => (
                <LinhaPergunta key={p.id} p={p} porId={new Map([...geraisAntes, ...perguntas].map((q) => [q.id, q]))}
                  primeira={!podeEditar || i === 0} ultima={!podeEditar || i === perguntas.length - 1}
                  aoSubir={() => void gravar.rodar(mover(perguntas, i, -1))} aoDescer={() => void gravar.rodar(mover(perguntas, i, 1))}
                  aoEditar={() => { if (podeEditar) setEditando({ p, nova: false }); }} />
              ))}
            </ul>
          )}
          <div style={{ marginTop: 12 }}>
            <Botao variante="sutil" icone="eye" onClick={() => window.open(`/curriculo?previa=1&vaga=${vaga.id}`, "_blank", "noopener")}>Prévia com esta vaga</Botao>
          </div>
        </Cartao>
      )}

      {editando && vaga && (
        <EditorPergunta
          inicial={editando.p}
          nova={editando.nova}
          prefixo="v_"
          anteriores={[...geraisAntes, ...perguntas.slice(0, editando.nova ? perguntas.length : perguntas.findIndex((p) => p.id === editando.p.id))]}
          idsEmUso={new Set([...cfg.perguntas.map((p) => p.id), ...perguntas.map((p) => p.id)])}
          aoSalvar={(p) => {
            const lista = editando.nova ? [...perguntas, p] : perguntas.map((x) => (x.id === p.id ? p : x));
            void gravar.rodar(lista).then(() => setEditando(null));
          }}
          aoApagar={editando.nova ? undefined : async () => {
            const ok = await confirmar("Apagar a pergunta da vaga?", { detalhe: "Respostas já recebidas continuam nos candidatos.", perigo: true });
            if (ok) { await gravar.rodar(perguntas.filter((x) => x.id !== editando.p.id)); setEditando(null); }
          }}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

// ── Processo: as colunas do Kanban ───────────────────────────────────────────

/**
 * As etapas por onde o candidato passa. Rótulo, cor, papel e ordem mudam; as
 * etapas que o sistema conhece não apagam (candidato antigo aponta pra elas),
 * só desligam. Etapa nova ganha id a partir do nome. Salva aqui mesmo, à
 * parte do formulário — são assuntos diferentes.
 */
function AbaProcesso({ inicial }: { inicial: EtapaProcesso[] }) {
  const router = useRouter();
  const [etapas, setEtapas] = useState(inicial);
  const [salvo, setSalvo] = useState(() => JSON.stringify(inicial));
  const [nova, setNova] = useState("");
  const sujo = JSON.stringify(etapas) !== salvo;
  const set = (id: string, patch: Partial<EtapaProcesso>) => setEtapas((a) => a.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const salvar = useAcao(async (restaurar?: boolean) => {
    const j = await chamar("/api/rh/curriculos/etapas", { method: "PUT", body: JSON.stringify(restaurar ? { restaurar: true } : { etapas }) });
    const nov = j.etapas as EtapaProcesso[];
    setEtapas(nov); setSalvo(JSON.stringify(nov));
    toast(restaurar ? "Etapas padrão restauradas." : "Etapas salvas. O Kanban já usa estas colunas.");
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  const adicionar = () => {
    const label = nova.trim().slice(0, 40);
    if (!label) return;
    const base = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "e_$1").slice(0, 30) || "etapa";
    let id = base; let n = 2;
    while (etapas.some((e) => e.id === id) || id === "arquivado") id = `${base}_${n++}`;
    // Entra antes dos finais: é quase sempre um passo intermediário.
    const i = etapas.findIndex((e) => e.papel === "final_positivo" || e.papel === "final_negativo");
    const nov: EtapaProcesso = { id, label, cor: "var(--roxo)", icone: "circle-dot", papel: "andamento", ativa: true };
    setEtapas((a) => (i < 0 ? [...a, nov] : [...a.slice(0, i), nov, ...a.slice(i)]));
    setNova("");
  };

  return (
    <Cartao estatico>
      <TituloCartao icone="layout-kanban">Etapas do processo seletivo</TituloCartao>
      <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 12px" }}>
        São as colunas do Kanban. Todo currículo novo entra em <b>{etapas.find((e) => e.ativa && e.papel === "entrada")?.label ?? "Recebidos"}</b>.
        O papel diz como a etapa conta no topo da tela (para analisar, avançando/parado, finalizado).
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {etapas.map((e, i) => (
          <li key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", opacity: e.ativa ? 1 : 0.6 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: e.cor, flex: "none" }} />
            <input aria-label={`Nome da etapa ${i + 1}`} value={e.label} maxLength={40} onChange={(x) => set(e.id, { label: x.target.value })} style={{ flex: "2 1 160px", minWidth: 0 }} />
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <GlassSelect aria-label="Cor" value={e.cor} onChange={(v) => set(e.id, { cor: v })} options={CORES_ETAPA.map((c) => ({ value: c.valor, label: c.label }))} />
            </div>
            <div style={{ flex: "1 1 170px", minWidth: 0 }}>
              <GlassSelect aria-label="Papel no fluxo" value={e.papel} disabled={e.id === "novo"} onChange={(v) => set(e.id, { papel: v as PapelEtapa })} options={PAPEIS.map((p) => ({ value: p.valor, label: p.label }))} />
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
              <Interruptor ligado={e.ativa} desativado={e.id === "novo"} titulo={`Etapa ${e.label} ativa`} onChange={(v) => set(e.id, { ativa: v })} />
              <BotaoIcone icone="arrow-up" titulo="Subir" variante="sutil" disabled={i === 0} onClick={() => setEtapas((a) => mover(a, i, -1))} />
              <BotaoIcone icone="arrow-down" titulo="Descer" variante="sutil" disabled={i === etapas.length - 1} onClick={() => setEtapas((a) => mover(a, i, 1))} />
              {!e.fixa && <BotaoIcone icone="trash" titulo="Apagar etapa" variante="sutil" onClick={() => setEtapas((a) => a.filter((x) => x.id !== e.id))} />}
            </span>
          </li>
        ))}
      </ol>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input aria-label="Nova etapa" placeholder="Nova etapa (ex.: Teste prático)" value={nova} maxLength={40}
          onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
          style={{ flex: "1 1 220px", minWidth: 0 }} />
        <Botao icone="plus" onClick={adicionar} disabled={!nova.trim() || etapas.length >= 16}>Adicionar etapa</Botao>
      </div>
      <NotaRodape icone="info-circle">Apagar uma etapa nova com candidatos dentro faz eles aparecerem só na lista, com o nome da etapa em cinza — mova-os antes.</NotaRodape>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Botao variante="primario" icone="check" estado={salvar.estado} disabled={!sujo} onClick={() => void salvar.rodar()}>{sujo ? "Salvar etapas" : "Etapas salvas"}</Botao>
        {sujo && <Botao variante="sutil" onClick={() => setEtapas(JSON.parse(salvo))}>Descartar</Botao>}
        <span style={{ flex: 1 }} />
        <Botao variante="sutil" icone="refresh" onClick={() => void salvar.rodar(true)}>Restaurar padrão</Botao>
      </div>
    </Cartao>
  );
}
