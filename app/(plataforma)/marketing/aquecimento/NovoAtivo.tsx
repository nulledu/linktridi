"use client";

// ── Aquecimento · cadastro de ativo ──────────────────────────────────────────
// Um formulário só para os três tipos: o que muda entre BM, conta e número são
// três campos. Três telas separadas para isso obrigariam a escolher o tipo antes
// de ver o que ele pede — e a diferença é pequena demais para justificar.

import { useEffect, useMemo, useState } from "react";
import { PainelLateral, Botao, Acoes, Campo, Campos } from "../../ui/controles";
import { TIPOS, hojeISO, type Ativo, type Roteiro, type TipoAtivo } from "@/lib/marketing-aquecimento-const";

export function NovoAtivo({
  roteiros, ativos, tipoInicial, preAparelho, prePaiId, onFechar, onCriado,
}: {
  roteiros: Roteiro[];
  ativos: Ativo[];
  tipoInicial: TipoAtivo;
  /** Vem do "+ Número neste aparelho" do bloco: o container já está escolhido,
   *  e redigitá-lo é como o mesmo celular vira dois grupos por um espaço a
   *  mais. */
  preAparelho?: string;
  prePaiId?: string;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const [tipo, setTipo] = useState<TipoAtivo>(tipoInicial);
  const [nome, setNome] = useState("");
  const [identificador, setIdent] = useState("");
  const [paiId, setPaiId] = useState(prePaiId ?? "");
  const [aparelho, setAparelho] = useState(preAparelho ?? "");
  const [operadora, setOperadora] = useState("");
  const [responsavelNome, setResp] = useState("");
  const [iniciadoEm, setInicio] = useState(hojeISO());
  const [roteiroId, setRoteiro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const doTipo = useMemo(() => roteiros.filter((r) => r.tipo === tipo), [roteiros, tipo]);
  const bms = useMemo(() => ativos.filter((a) => a.tipo === "bm"), [ativos]);
  // Aparelhos já cadastrados viram sugestão: digitar "Moto G54" e "moto g54"
  // criaria dois grupos na visão WhatsApp para o mesmo celular.
  const aparelhos = useMemo(
    () => [...new Set(ativos.map((a) => a.aparelho).filter(Boolean) as string[])].sort(),
    [ativos]);

  // Trocar de tipo escolhe o roteiro daquele tipo — mas UMA vez, por efeito.
  // Antes isto era `roteiroId || doTipo[0]?.id` calculado no render, e o `||`
  // não distingue "ainda não escolhi" de "escolhi Sem roteiro": selecionar
  // «Sem roteiro» zerava o estado e o fallback recolocava o primeiro roteiro na
  // hora. A opção existia na lista e era impossível de escolher.
  useEffect(() => { setRoteiro(doTipo[0]?.id ?? ""); }, [doTipo]);

  async function salvar() {
    if (!nome.trim() || salvando) return;
    setSalvando(true); setErro("");
    const r = await fetch("/api/marketing/aquecimento", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo, nome, identificador, iniciadoEm,
        paiId: tipo === "conta" ? paiId : null,
        aparelho: tipo === "numero" ? aparelho : null,
        operadora: tipo === "numero" ? operadora : null,
        responsavelNome, roteiroId,
      }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { onCriado(); onFechar(); return; }
    setErro(r?.error === "sem_permissao"
      ? "Você não tem permissão para cadastrar ativos."
      : r?.error === "sql_pendente"
        ? "As tabelas do aquecimento ainda não existem no banco — rode supabase/marketing_aquecimento.sql."
        : "Não deu para salvar. Confira os campos e tente de novo.");
    setSalvando(false);
  }

  return (
    <PainelLateral titulo="Novo ativo em aquecimento" largura={470} onFechar={onFechar}
      rodape={
        <Acoes>
          <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={!nome.trim() || salvando}>
            {salvando ? "Salvando…" : "Cadastrar"}
          </Botao>
        </Acoes>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="tab-strip" style={{ display: "flex", gap: 7 }}>
          {TIPOS.map((t) => (
            <button key={t.key} type="button" onClick={() => { setTipo(t.key); setRoteiro(""); }}
              aria-pressed={tipo === t.key}
              className="aq-bt-sm"
              style={{
                flex: "0 0 auto", padding: "0 14px", borderRadius: 999,
                font: "inherit", fontSize: 13.5, fontWeight: 580, cursor: "pointer",
                background: tipo === t.key ? "var(--text)" : "var(--surface-2)",
                color: tipo === t.key ? "var(--bg)" : "var(--text-dim)",
                border: `1px solid ${tipo === t.key ? "transparent" : "var(--border)"}`,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <Campos min={200}>
          <Campo label={tipo === "numero" ? "Número" : "Nome"} largo>
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120}
              placeholder={tipo === "numero" ? "(62) 9 9331-7745" : tipo === "bm" ? "BM Tridi · Principal" : "Conta 07 — Escala"}
              style={{ width: "100%", minHeight: "var(--tap)" }} />
          </Campo>

          <Campo label={tipo === "bm" ? "ID da BM" : tipo === "conta" ? "ID da conta (act_…)" : "Número em formato internacional"}
            dica={tipo === "numero" ? "Opcional — serve para casar com o TridiChat depois." : undefined}>
            <input value={identificador} onChange={(e) => setIdent(e.target.value)} maxLength={120}
              style={{ width: "100%", minHeight: "var(--tap)" }} />
          </Campo>

          {tipo === "conta" && (
            <Campo label="BM dona" dica={bms.length ? undefined : "Cadastre a BM primeiro para poder pendurar contas nela."}>
              <select value={paiId} onChange={(e) => setPaiId(e.target.value)}
                style={{ width: "100%", minHeight: "var(--tap)" }}>
                <option value="">Sem BM vinculada</option>
                {bms.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </Campo>
          )}

          {tipo === "numero" && (
            <>
              <Campo label="Aparelho" dica="É por ele que a tela agrupa — e é como você vê o que caiu junto se o celular for banido.">
                <input value={aparelho} onChange={(e) => setAparelho(e.target.value)} maxLength={80}
                  list="aq-aparelhos" placeholder="Moto G54 · mesa 3"
                  style={{ width: "100%", minHeight: "var(--tap)" }} />
                <datalist id="aq-aparelhos">
                  {aparelhos.map((a) => <option key={a} value={a} />)}
                </datalist>
              </Campo>
              <Campo label="Operadora">
                <input value={operadora} onChange={(e) => setOperadora(e.target.value)} maxLength={40}
                  placeholder="Vivo, Claro, TIM…" style={{ width: "100%", minHeight: "var(--tap)" }} />
              </Campo>
            </>
          )}

          <Campo label="Responsável">
            <input value={responsavelNome} onChange={(e) => setResp(e.target.value)} maxLength={80}
              placeholder="Quem cuida deste ativo" style={{ width: "100%", minHeight: "var(--tap)" }} />
          </Campo>

          <Campo label="Início do aquecimento" dica="É a partir daqui que os prazos das etapas são contados.">
            <input type="date" value={iniciadoEm} onChange={(e) => setInicio(e.target.value)}
              style={{ width: "100%", minHeight: "var(--tap)" }} />
          </Campo>

          <Campo label="Roteiro" largo
            dica={doTipo.length ? undefined : "Nenhum roteiro deste tipo — crie um na aba Roteiros."}>
            <select value={roteiroId} onChange={(e) => setRoteiro(e.target.value)}
              style={{ width: "100%", minHeight: "var(--tap)" }}>
              <option value="">Sem roteiro (só histórico)</option>
              {doTipo.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} — {r.etapas.filter((x) => !x.removidaEm).length} etapas
                </option>
              ))}
            </select>
          </Campo>
        </Campos>

        {erro && <p style={{ margin: 0, fontSize: 13, color: "var(--perigo)" }}>{erro}</p>}
      </div>
    </PainelLateral>
  );
}
