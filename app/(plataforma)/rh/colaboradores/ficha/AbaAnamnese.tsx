"use client";

// A ficha anamnésica.
//
// Só chega aqui quem tem `rh:anamnese` — o servidor nem busca o conteúdo sem a
// chave (ver o `page.tsx` da ficha). Esta tela existe para LER; editar exige
// `rh:anamnese_editar`, que é outra chave e outra decisão.
//
// O aviso de confidencialidade no topo não é enfeite: quem abre esta aba
// geralmente está com a tela virada para outra pessoa, e a linha é o lembrete de
// que o que vem abaixo não é cadastro.

import { useState } from "react";
import { CAMPOS_ANAMNESE, GRUPOS_ANAMNESE, quantosPreenchidos, valorDoCampo } from "@/lib/rh/anamnese";
import type { AnamneseRh } from "@/lib/rh/tipos";
import { dataBR } from "@/lib/financeiro/calculos";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral, useAcao } from "../../../ui/controles";
import { GlassSelect } from "../../../GlassPicker";
import { BotaoFin, Cartao, FichaBloco, FichaLinha, TituloCartao, Vazio } from "../../../financeiro/ui";

export function AbaAnamnese({
  employeeId, anamnese, podeEditar, aoMudar,
}: {
  employeeId: string;
  anamnese: AnamneseRh | null;
  podeEditar: boolean;
  aoMudar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const dados = anamnese?.dados ?? null;
  const preenchidos = quantosPreenchidos(dados);

  return (
    <Cartao>
      <TituloCartao
        icone="clipboard-list"
        direita={
          podeEditar
            ? <BotaoFin icone="pencil" primario onClick={() => setEditando(true)}>
                {preenchidos ? "Editar ficha" : "Preencher ficha"}
              </BotaoFin>
            : undefined
        }
      >
        Ficha anamnésica
      </TituloCartao>

      <p
        style={{
          display: "flex", alignItems: "flex-start", gap: 9, margin: "-6px 0 16px",
          padding: "10px 12px", borderRadius: "var(--r-sm)", fontSize: 12.5, lineHeight: 1.5,
          color: "var(--roxo)", background: "color-mix(in srgb, var(--roxo) 11%, transparent)",
          maxWidth: "68ch",
        }}
      >
        <Icon name="lock" size={16} color="var(--roxo)" />
        Informação de saúde declarada pela pessoa. Só quem tem a chave de ficha anamnésica do RH
        enxerga esta aba — ela não aparece na visão geral nem na lista.
      </p>

      {!preenchidos ? (
        <Vazio
          icone="clipboard-list"
          titulo="Ficha ainda não preenchida"
          detalhe="Tipo sanguíneo, alergias, condições de saúde, hábitos e restrições para o trabalho."
          acao={podeEditar ? <BotaoFin icone="pencil" primario onClick={() => setEditando(true)}>Preencher agora</BotaoFin> : undefined}
        />
      ) : (
        <>
          {GRUPOS_ANAMNESE.map((grupo) => {
            const campos = CAMPOS_ANAMNESE
              .filter((c) => c.grupo === grupo)
              .filter((c) => valorDoCampo(dados, c.chave) !== "");
            if (!campos.length) return null;
            return (
              <FichaBloco key={grupo} titulo={grupo}>
                {campos.map((c) => (
                  <FichaLinha key={c.chave} rotulo={c.rotulo}>
                    <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      {rotularValor(valorDoCampo(dados, c.chave))}
                    </span>
                  </FichaLinha>
                ))}
              </FichaBloco>
            );
          })}
          {anamnese?.atualizado_em && (
            <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--text-dim)" }}>
              Atualizada em {dataBR(anamnese.atualizado_em.slice(0, 10))}
              {anamnese.atualizado_por_nome ? ` por ${anamnese.atualizado_por_nome}` : ""}.
            </p>
          )}
        </>
      )}

      {editando && podeEditar && (
        <PainelAnamnese
          employeeId={employeeId}
          dados={dados}
          aoFechar={() => setEditando(false)}
          aoSalvar={() => { setEditando(false); aoMudar(); }}
        />
      )}
    </Cartao>
  );
}

/** "sim"/"nao" foram gravados como texto — a leitura os mostra por extenso. */
function rotularValor(v: string): string {
  if (v === "sim") return "Sim";
  if (v === "nao") return "Não";
  return v;
}

function PainelAnamnese({
  employeeId, dados, aoFechar, aoSalvar,
}: {
  employeeId: string;
  dados: Record<string, unknown> | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS_ANAMNESE.map((c) => [c.chave, valorDoCampo(dados, c.chave)])));
  const campo = (k: string, v: string) => setF((a) => ({ ...a, [k]: v }));

  const salvar = useAcao(async () => {
    try {
      const r = await fetch("/api/rh/anamnese", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, dados: f }),
      });
      const ehJson = r.headers.get("content-type")?.includes("application/json");
      if (!r.ok || !ehJson) {
        const msg = ehJson ? ((await r.json()) as { erro?: string }).erro : null;
        toast.erro(msg || "Não deu para salvar a ficha.");
        return false;
      }
      toast.ok("Ficha anamnésica salva.");
      aoSalvar();
      return true;
    } catch {
      toast.erro("Sem conexão. Tente de novo.");
      return false;
    }
  });

  return (
    <PainelLateral
      centrado soFechaNoX
      titulo="Ficha anamnésica"
      subtitulo="O que a pessoa declarou sobre a própria saúde."
      largura={760}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Fechar</Botao>
          <Esp />
          <Botao variante="primario" icone="check" estado={salvar.estado} onClick={() => salvar.rodar()}>
            Salvar ficha
          </Botao>
        </Acoes>
      }
    >
      {GRUPOS_ANAMNESE.map((grupo) => {
        const campos = CAMPOS_ANAMNESE.filter((c) => c.grupo === grupo);
        if (!campos.length) return null;
        return (
          <section key={grupo} style={{ marginBottom: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              {grupo}
            </h3>
            <Campos>
              {campos.map((c) => (
                <Campo key={c.chave} label={c.rotulo} dica={c.dica} largo={c.tipo === "longo"}>
                  {(id) => {
                    if (c.tipo === "longo") {
                      return <textarea id={id} rows={3} value={f[c.chave] ?? ""} onChange={(e) => campo(c.chave, e.target.value)} />;
                    }
                    // Sim/Não vai de seletor e não de controle segmentado por
                    // causa da GRADE: são 20 e poucos campos em colunas de
                    // 220px, e uma fileira com metade seletor e metade pílula
                    // lê como dois formulários colados. O controle segmentado
                    // continua sendo a resposta certa onde a escolha aparece
                    // sozinha — aqui ela nunca aparece sozinha.
                    if (c.tipo === "sim_nao") {
                      return (
                        <GlassSelect id={id} value={f[c.chave] ?? ""} onChange={(v) => campo(c.chave, v)}
                          placeholder="Não informado"
                          options={[{ value: "", label: "Não informado" }, { value: "sim", label: "Sim" }, { value: "nao", label: "Não" }]} />
                      );
                    }
                    if (c.tipo === "escolha") {
                      return (
                        <GlassSelect id={id} value={f[c.chave] ?? ""} onChange={(v) => campo(c.chave, v)}
                          placeholder="Não informado"
                          options={[{ value: "", label: "Não informado" }, ...(c.opcoes ?? []).map((o) => ({ value: o, label: o }))]} />
                      );
                    }
                    return <input id={id} value={f[c.chave] ?? ""} onChange={(e) => campo(c.chave, e.target.value)} />;
                  }}
                </Campo>
              ))}
            </Campos>
          </section>
        );
      })}
    </PainelLateral>
  );
}
