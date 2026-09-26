"use client";

// FORMULÁRIO da página.
//
// Reuso deliberado: o envio cai em `tridiflow_sessoes` (a MESMA tabela dos leads
// dos fluxos), então o lead aparece em Contatos junto com os do chat, e o
// webhook de lead + o envio pro Comercial (gaiaLeads) já configurados no projeto
// disparam sozinhos. Nada de CRM novo aqui — era exatamente o pedido.

import { useState } from "react";
import type { Bloco, CampoForm } from "@/lib/tridiflow-pagina";
import { linkWhatsapp, urlSegura, TEXTO } from "@/lib/tridiflow-pagina-estilo";
import { PARAM_SESSAO, guardarRespostas, idVisitante, utmsDaUrl } from "@/lib/tridiflow-pagina-runtime";
import type { CtxPagina } from "./contexto";
import { Caixa } from "../(plataforma)/ui/controles";

const TIPO_INPUT: Record<CampoForm["tipo"], string> = {
  nome: "text", email: "email", telefone: "tel", texto: "text", selecao: "text", checkbox: "checkbox",
};

/** Nomes que valem pelo mesmo campo — `?whatsapp=` preenche o campo telefone. */
const APELIDOS: Record<string, string[]> = {
  nome: ["nome", "name", "primeiro_nome"],
  email: ["email", "e-mail", "mail"],
  telefone: ["telefone", "whatsapp", "celular", "phone", "tel"],
};

const chave = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Formulário que nasce preenchido com o que já se sabe (`?nome=Ana`, ou o que
 *  a pessoa respondeu numa tela anterior do mesmo funil).
 *
 *  Vale conversão: cada campo que a pessoa não precisa digitar de novo é um
 *  motivo a menos pra ela desistir no meio. */
function preencher(campos: CampoForm[], vars: Record<string, string>): Record<string, string> {
  if (!Object.keys(vars).length) return {};
  const porChave = new Map(Object.entries(vars).map(([k, v]) => [chave(k), v]));
  const out: Record<string, string> = {};
  for (const c of campos) {
    if (c.tipo === "checkbox") continue;   // marcar sozinho um aceite seria assinar pela pessoa
    // O rótulo escrito pelo autor ganha do tipo: é o nome que ele usa no webhook.
    const candidatos = [chave(c.rotulo || ""), ...(APELIDOS[c.tipo] ?? [c.tipo])];
    for (const nome of candidatos) {
      const v = nome && porChave.get(nome);
      if (v) { out[c.id] = v; break; }
    }
  }
  return out;
}

export function FormBloco({ bloco, ctx, paginaId }: { bloco: Bloco; ctx: CtxPagina; paginaId: string }) {
  const campos = bloco.campos ?? [];
  const envio = bloco.envio ?? { acao: "mensagem" as const };
  const [valores, setValores] = useState<Record<string, string>>(() => preencher(campos, ctx.vars));
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primaria = ctx.config.corPrimaria || "var(--primary-texto)";

  const set = (id: string, v: string) => setValores((a) => ({ ...a, [id]: v }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ctx.modo === "preview") { setPronto(true); return; }   // preview não grava lead
    // Validação no cliente; o servidor revalida (nunca confiar só daqui).
    const faltando = campos.find((c) => c.obrigatorio && !(valores[c.id] ?? "").trim());
    if (faltando) { setErro(`Preencha "${faltando.rotulo}".`); return; }
    setEnviando(true); setErro(null);
    try {
      const respostas: Record<string, string> = {};
      for (const c of campos) {
        const v = (valores[c.id] ?? "").trim();
        if (v) respostas[c.rotulo || c.tipo] = v;
      }
      const r = await fetch("/api/p/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A variante entra no lead (e daí no webhook e no CSV) pela MESMA porta
        // que as tags do quiz usam: uma chave reservada dentro de `respostas`.
        // Sem coluna nova e sem SQL — ver CHAVE_VARIANTE.
        body: JSON.stringify({
          paginaId, respostas, utm: utmsDaUrl(), visitante: idVisitante(),
          ...(ctx.config.teste?.ativo ? { variante: ctx.variante } : {}),
        }),
      });
      if (!r.ok) throw new Error("falha");
      const dados = (await r.json().catch(() => null)) as { sessaoId?: string } | null;
      ctx.onEvento("form_submitted", { blocoId: bloco.id, campos: Object.keys(respostas).length });
      // Guarda no navegador de quem preencheu — é o que faz a próxima tela do
      // funil não repetir as mesmas perguntas.
      guardarRespostas(respostas);

      // Ação pós-envio
      if (envio.acao === "redirect" && urlSegura(envio.url)) { window.location.href = urlSegura(envio.url); return; }
      if (envio.acao === "fluxo" && envio.fluxoSlug) {
        // Antes isto era um `location.href` seco pro /f/<slug>. O player abria
        // uma sessão NOVA: o mesmo lead virava duas linhas em tridiflow_sessoes,
        // os UTMs do anúncio morriam aqui, e quem tinha ACABADO de digitar o
        // telefone era perguntado tudo de novo na primeira etapa do funil.
        //
        // Levar a sessão adiante (e a query, que é onde estão os UTMs) faz o
        // funil continuar o mesmo atendimento em vez de recomeçar.
        const q = new URLSearchParams(window.location.search);
        if (dados?.sessaoId) q.set(PARAM_SESSAO, dados.sessaoId);
        const cauda = q.toString();
        window.location.href = `/f/${encodeURIComponent(envio.fluxoSlug)}${cauda ? `?${cauda}` : ""}`;
        return;
      }
      if (envio.acao === "whatsapp") {
        const wa = linkWhatsapp(envio.telefone, envio.mensagem);
        if (wa) { window.location.href = wa; return; }
      }
      setPronto(true);
    } catch {
      setErro("Não foi possível enviar agora. Tente de novo.");
    } finally { setEnviando(false); }
  };

  if (pronto) {
    return (
      <div style={{
        padding: "18px 16px", borderRadius: bloco.estilo?.raio ?? 12, textAlign: "center",
        background: `color-mix(in srgb, ${primaria} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${primaria} 30%, transparent)`,
      }}>
        <strong style={{ fontSize: 15 }}>{envio.mensagem || "Recebemos seus dados!"}</strong>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: 10, maxWidth: 460, marginInline: "auto", textAlign: "left" }}>
      {campos.map((c) => (
        <label key={c.id} style={{ display: "grid", gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600, opacity: TEXTO.secundario }}>
            {c.rotulo}{c.obrigatorio && <span style={{ color: "var(--perigo)" }}> *</span>}
          </span>

          {c.tipo === "selecao" ? (
            <select value={valores[c.id] ?? ""} onChange={(e) => set(c.id, e.target.value)} style={campoCss(bloco.estilo?.raio)}>
              <option value="">Selecione…</option>
              {(c.opcoes ?? []).map((o, i) => <option key={i} value={o}>{o}</option>)}
            </select>
          ) : c.tipo === "checkbox" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Caixa marcado={valores[c.id] === "sim"} onChange={(marc) => set(c.id, marc ? "sim" : "")} />
              <span style={{ fontSize: 13, opacity: TEXTO.secundario }}>{c.placeholder || "Concordo"}</span>
            </span>
          ) : (
            <input
              type={TIPO_INPUT[c.tipo]}
              inputMode={c.tipo === "telefone" ? "tel" : undefined}
              autoComplete={c.tipo === "nome" ? "name" : c.tipo === "email" ? "email" : c.tipo === "telefone" ? "tel" : undefined}
              placeholder={c.placeholder}
              value={valores[c.id] ?? ""}
              onChange={(e) => set(c.id, e.target.value)}
              style={campoCss(bloco.estilo?.raio)}
            />
          )}
        </label>
      ))}

      {erro && <span style={{ fontSize: 12.5, color: "var(--perigo)" }}>{erro}</span>}

      <button
        type="submit"
        disabled={enviando}
        style={{
          marginTop: 4, padding: "14px 18px", borderRadius: bloco.estilo?.raio ?? 12, border: "none",
          background: primaria, color: "#fff", fontWeight: 800, fontSize: 15.5,
          cursor: enviando ? "wait" : "pointer", opacity: enviando ? 0.7 : 1,
        }}
      >{enviando ? "Enviando…" : (envio.rotuloBotao || "Enviar")}</button>
    </form>
  );
}

function campoCss(raio?: number): React.CSSProperties {
  return {
    width: "100%", padding: "12px 13px", fontSize: 15,
    borderRadius: raio ?? 10,
    border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
    background: "color-mix(in srgb, currentColor 4%, transparent)",
    color: "inherit", font: "inherit", fontSizeAdjust: "none",
  } as React.CSSProperties;
}
