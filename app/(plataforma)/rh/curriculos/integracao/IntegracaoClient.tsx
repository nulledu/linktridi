"use client";

// RH → Currículos → Candidaturas: por onde o candidato entra.
//
// Uma porta só, e ela já vem aberta: o formulário público de candidatura.
// Quem termina aparece em Currículos na hora — não há nada pra "conectar",
// nem token, nem bot, nem domínio de terceiro. O que a pessoa faz aqui é
// publicar vaga e pegar link.
//
// Isto era a tela "Integração TridiFlow": quatro cartões num `auto-fit` de
// 360px que viravam quatro colunas espremidas, um cartão inteiro de webhook
// (URL + token pra colar num bot) e uma lista de vagas SEM ação nenhuma —
// dava pra criar uma vaga e não dava pra publicá-la. O webhook saiu da tela;
// a vaga ganhou os botões que faltavam.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PoderesRh } from "@/lib/rh/gate";
import type { ConfigIntegracao, VagaRh } from "@/lib/rh/curriculos/tipos";
import { Botao, BotaoCopiar, Interruptor, useAcao } from "../../../ui/controles";
import { GlassSelect } from "../../../GlassPicker";
import { toast, confirmar } from "../../../Toast";
import { AvisoSchema, Cabecalho, Cartao, NotaRodape, Passos, Selo, TituloCartao, Vazio } from "../../../financeiro/ui";

function dataHoraBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " ·");
}

async function chamar(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error((j.erro as string) || "Não foi possível salvar.");
  return j;
}

/** Cor e palavra de cada status — a paleta semântica, que vale nos dois temas. */
const SELO_VAGA: Record<VagaRh["status"], { label: string; cor: string }> = {
  aberta: { label: "Publicada", cor: "var(--ok)" },
  pausada: { label: "Pausada", cor: "var(--atencao)" },
  encerrada: { label: "Encerrada", cor: "var(--neutro)" },
};

const campo: React.CSSProperties = {
  flex: 1, minWidth: 0, minHeight: "var(--tap)", padding: "0 12px", borderRadius: "var(--r-sm)",
  border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
  fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", overflow: "hidden",
  textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center",
};

export function IntegracaoClient({ inicial, vagas, base, poderes, schemaPendente }: {
  inicial: ConfigIntegracao; vagas: VagaRh[]; base: string; poderes: PoderesRh; schemaPendente: boolean;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState(inicial);
  const linkFormulario = `${base}/curriculo`;

  const patch = useAcao(async (corpo: Record<string, unknown>) => {
    await chamar("/api/rh/curriculos/integracao", { method: "PATCH", body: JSON.stringify(corpo) });
    setCfg((a) => ({ ...a, ...corpo } as ConfigIntegracao));
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  // ── Vagas ──────────────────────────────────────────────────────────────────
  const [novaVaga, setNovaVaga] = useState("");
  const [lista, setLista] = useState(vagas);
  const criarVaga = useAcao(async () => {
    const titulo = novaVaga.trim();
    if (!titulo) return false;
    const j = await chamar("/api/rh/curriculos/vagas", { method: "POST", body: JSON.stringify({ titulo }) });
    setLista((a) => [...a, j.vaga as VagaRh]);
    setNovaVaga("");
    toast(`Vaga “${titulo}” criada — já está publicada.`);
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  // Publicar / pausar / encerrar. É ISTO que faltava: a vaga nascia e não havia
  // como mudar o estado dela sem ir ao banco.
  const mudarStatus = useAcao(async (id: string, status: VagaRh["status"]) => {
    if (status === "encerrada") {
      const ok = await confirmar("Encerrar a vaga?", { detalhe: "O link dela para de aceitar candidatura. Quem já se candidatou continua em Currículos.", perigo: true });
      if (!ok) return false;
    }
    await chamar("/api/rh/curriculos/vagas", { method: "PATCH", body: JSON.stringify({ id, status }) });
    setLista((a) => a.map((v) => (v.id === id ? { ...v, status } : v)));
    toast(status === "aberta" ? "Vaga publicada." : status === "pausada" ? "Vaga pausada." : "Vaga encerrada.");
    router.refresh();
    return true;
  }, { aoErrar: (e) => toast((e as Error).message, "erro") });

  const publicadas = lista.filter((v) => v.status === "aberta").length;

  return (
    <>
      <Cabecalho
        tarja="RH"
        titulo="Candidaturas"
        sub="O link público por onde os candidatos entram em Currículos."
        acoes={<Botao icone="arrow-left" onClick={() => router.push("/rh/curriculos")}>Voltar aos currículos</Botao>}
      />
      {schemaPendente && <AvisoSchema modulo="RH" arquivo="supabase/rh_curriculos.sql" />}

      {/* Duas colunas de verdade: a de trabalho respira, a de referência é
          estreita. `min(100%, …)` faz as duas virarem uma só no celular. */}
      <div style={{ display: "grid", gap: 16, alignItems: "start", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
        {/* ── Coluna de trabalho ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gap: 16, alignItems: "start" }}>
          <Cartao estatico>
            <TituloCartao icone="id-badge" direita={<Selo selo={cfg.formulario_ativo ? { label: "No ar", cor: "var(--ok)" } : { label: "Fechado", cor: "var(--neutro)" }} />}>
              Formulário de candidatura
            </TituloCartao>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 12px", lineHeight: 1.5 }}>
              As 12 etapas da candidatura Tridi. Está no ar por padrão: todo mundo que terminar cai em Currículos na hora, com as respostas e o currículo anexado.
            </p>
            <Interruptor
              ligado={cfg.formulario_ativo}
              pendente={patch.estado === "carregando"}
              onChange={(v) => void patch.rodar({ formulario_ativo: v })}
              rotulo={cfg.formulario_ativo ? "Formulário no ar" : "Formulário fechado"}
              dica="Fechado, o link mostra um aviso e não aceita envio."
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, minWidth: 0, flexWrap: "wrap" }}>
              <span style={campo} title={linkFormulario}>{linkFormulario}</span>
              <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
                <BotaoCopiar texto={linkFormulario} rotulo="Copiar" tamanho="md" variante="secundario" />
                <Botao icone="external-link" onClick={() => window.open(linkFormulario, "_blank", "noopener")}>Abrir</Botao>
                <Botao icone="eye" variante="sutil" onClick={() => window.open("/curriculo?previa=1", "_blank", "noopener")}>Prévia</Botao>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Passos passos={[
                { icone: "link", titulo: "Divulgue o link", detalhe: "No anúncio, no WhatsApp, no QR do mural. Cada vaga publicada abaixo tem o link próprio dela." },
                { icone: "forms", titulo: "A pessoa responde", detalhe: "Nome, e-mail, WhatsApp, cidade, vaga, o questionário, o currículo (PDF, Word ou foto), como conheceu e se conhece alguém." },
                { icone: "inbox", titulo: "Chegou", detalhe: "Aparece em Currículos como Novo. Sem vaga no link, entra na vaga padrão." },
              ]} />
            </div>
          </Cartao>

          <Cartao estatico>
            <TituloCartao icone="briefcase" direita={<span style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>{publicadas} publicada{publicadas === 1 ? "" : "s"}</span>}>
              Vagas
            </TituloCartao>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 12px", lineHeight: 1.5 }}>
              Publique a vaga e divulgue o link dela — quem se candidatar por ali já chega marcado nessa vaga.
            </p>

            {poderes.curriculosEditar && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={novaVaga}
                  onChange={(e) => setNovaVaga(e.target.value.slice(0, 120))}
                  onKeyDown={(e) => { if (e.key === "Enter") void criarVaga.rodar(); }}
                  placeholder="Nova vaga (ex.: Auxiliar de Produção)"
                  aria-label="Título da nova vaga"
                  /* Borda, tinta, raio e corpo saem da fundação (`input` no
                     globals.css). Aqui fica só o que é desta fileira: quanto
                     ele estica ao lado do botão, e a altura de dedo. */
                  style={{ flex: "1 1 240px", minWidth: 0, minHeight: "var(--tap)", padding: "0 13px", borderRadius: "var(--r-sm)" }}
                />
                <Botao variante="primario" icone="plus" estado={criarVaga.estado} onClick={() => void criarVaga.rodar()} disabled={!novaVaga.trim()}>Criar e publicar</Botao>
              </div>
            )}

            {lista.length === 0 ? (
              <div style={{ marginTop: 14 }}>
                <Vazio compacto icone="briefcase" titulo="Nenhuma vaga ainda" detalhe="Crie a primeira acima — ela já nasce publicada e com link próprio." />
              </div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "grid", gap: 10 }}>
                {lista.map((v) => (
                  <LinhaVaga
                    key={v.id}
                    vaga={v}
                    link={`${base}/curriculo?vaga=${v.id}`}
                    podeEditar={poderes.curriculosEditar}
                    ocupado={mudarStatus.estado === "carregando"}
                    aoMudar={(s) => void mudarStatus.rodar(v.id, s)}
                  />
                ))}
              </ul>
            )}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Vaga padrão</span>
              <GlassSelect
                value={cfg.vaga_padrao_id ?? ""}
                onChange={(v) => void patch.rodar({ vaga_padrao_id: v || null })}
                placeholder="Sem vaga padrão"
                options={[{ value: "", label: "Sem vaga padrão" }, ...lista.map((v) => ({ value: v.id, label: v.titulo + (v.status === "aberta" ? "" : ` · ${SELO_VAGA[v.status].label.toLowerCase()}`), disabled: v.status === "encerrada" }))]}
              />
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>De quem se candidata pelo link solto. Cada candidato pode ser movido depois, no perfil.</span>
            </div>
          </Cartao>
        </div>

        {/* ── Coluna de referência ───────────────────────────────────────── */}
        <div style={{ display: "grid", gap: 16, alignItems: "start" }}>
          <Cartao estatico>
            <TituloCartao icone="activity" direita={<Selo selo={cfg.formulario_ativo ? { label: "Recebendo", cor: "var(--ok)" } : { label: "Fechado", cor: "var(--neutro)" }} />}>
              Recebimento
            </TituloCartao>
            <dl style={{ display: "grid", gap: 8, margin: 0, fontSize: 13.5 }}>
              <Linha rotulo="Formulário">{cfg.formulario_ativo ? "no ar" : "fechado"}</Linha>
              <Linha rotulo="Vagas publicadas">{publicadas > 0 ? `${publicadas} de ${lista.length}` : "nenhuma"}</Linha>
              <Linha rotulo="Última candidatura">{cfg.ultima_recepcao_em ? dataHoraBR(cfg.ultima_recepcao_em) : "nenhuma ainda"}</Linha>
            </dl>
            {cfg.ultimo_erro && (
              <div style={{ marginTop: 12 }}>
                <NotaRodape destaque icone="alert-triangle">
                  Último erro{cfg.ultimo_erro_em ? ` (${dataHoraBR(cfg.ultimo_erro_em)})` : ""}: {cfg.ultimo_erro}
                  {" "}<Botao variante="sutil" tamanho="sm" icone="backspace" estado={patch.estado} onClick={() => void patch.rodar({ limpar_erro: true, ultimo_erro: null, ultimo_erro_em: null })}>Limpar</Botao>
                </NotaRodape>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <NotaRodape icone="info-circle">
                Não há nada a conectar: o formulário é da própria plataforma e o candidato cai direto em Currículos.
              </NotaRodape>
            </div>
          </Cartao>
        </div>
      </div>
    </>
  );
}

/** Uma vaga: nome, estado, link e as ações — todas VISÍVEIS. Ação escondida em
 *  `:hover` não existe no celular, e era por isso que não dava pra publicar. */
function LinhaVaga({ vaga, link, podeEditar, ocupado, aoMudar }: {
  vaga: VagaRh; link: string; podeEditar: boolean; ocupado: boolean;
  aoMudar: (status: VagaRh["status"]) => void;
}) {
  const aberta = vaga.status === "aberta";
  return (
    <li style={{ display: "grid", gap: 10, padding: 12, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ minWidth: 0, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {vaga.titulo}
          {vaga.setor && <small style={{ color: "var(--text-dim)", fontWeight: 600 }}> · {vaga.setor}</small>}
        </span>
        <Selo selo={SELO_VAGA[vaga.status]} />
      </div>

      {aberta && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ ...campo, fontSize: 12 }} title={link}>{link}</span>
          <BotaoCopiar texto={link} rotulo="Copiar link" tamanho="md" variante="secundario" />
        </div>
      )}

      <div className="tab-strip" style={{ display: "flex", gap: 8, alignItems: "center", padding: 0, flexWrap: "wrap" }}>
        <Botao tamanho="sm" variante="sutil" icone="users" onClick={() => window.location.assign(`/rh/curriculos?vaga=${vaga.id}`)}>Ver candidatos</Botao>
        {podeEditar && (
          aberta ? (
            <>
              <Botao tamanho="sm" variante="sutil" icone="player-pause" disabled={ocupado} onClick={() => aoMudar("pausada")}>Pausar</Botao>
              <Botao tamanho="sm" variante="sutil" icone="archive" disabled={ocupado} onClick={() => aoMudar("encerrada")}>Encerrar</Botao>
            </>
          ) : (
            <Botao tamanho="sm" variante="primario" icone="rocket" disabled={ocupado} onClick={() => aoMudar("aberta")}>
              {vaga.status === "pausada" ? "Retomar" : "Republicar"}
            </Botao>
          )
        )}
      </div>
    </li>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 130px), 130px) 1fr", gap: 10, alignItems: "start" }}>
      <dt style={{ color: "var(--text-dim)", fontWeight: 600, fontSize: 12.5 }}>{rotulo}</dt>
      <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{children}</dd>
    </div>
  );
}
