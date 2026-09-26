"use client";

// ── Aquecimento · editar e remover o ativo ───────────────────────────────────
// Mora DENTRO da gaveta, e não numa tela própria: quem descobre o erro de
// digitação é quem está olhando o ativo, e mandar essa pessoa para outro lugar
// pra consertar é o tipo de ida e volta que faz a correção nunca acontecer.
//
// O `editarAtivo`/`removerAtivo` do lib e o PATCH/DELETE da API existiam desde o
// primeiro commit sem NENHUMA tela chamando: dava pra cadastrar um ativo e nunca
// mais trocar o responsável, o aparelho ou corrigir o número.

import { useState } from "react";
import { Botao, Campo, Campos } from "../../ui/controles";
import { TIPOS, type Ativo, type Roteiro } from "@/lib/marketing-aquecimento-const";

export function EditarAtivo({ ativo, roteiros, bms, aparelhos, onSalvar, onRemover, onCancelar }: {
  ativo: Ativo;
  roteiros: Roteiro[];
  bms: Ativo[];
  aparelhos: string[];
  onSalvar: (patch: Record<string, unknown>) => Promise<boolean>;
  onRemover: () => Promise<boolean>;
  onCancelar: () => void;
}) {
  const [f, setF] = useState({
    nome: ativo.nome,
    identificador: ativo.identificador ?? "",
    paiId: ativo.paiId ?? "",
    aparelho: ativo.aparelho ?? "",
    operadora: ativo.operadora ?? "",
    responsavelNome: ativo.responsavelNome ?? "",
    iniciadoEm: ativo.iniciadoEm,
    roteiroId: ativo.roteiroId ?? "",
    obs: ativo.obs ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");

  const doTipo = roteiros.filter((r) => r.tipo === ativo.tipo);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
    if (!f.nome.trim() || salvando) return;
    setSalvando(true); setErro("");
    const ok = await onSalvar({ id: ativo.id, ...f });
    if (!ok) { setErro("Não deu para salvar. Tente de novo."); setSalvando(false); return; }
    onCancelar();
  }

  async function remover() {
    setSalvando(true);
    if (!await onRemover()) { setErro("Não deu para remover."); setSalvando(false); }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 14, padding: 14, borderRadius: 16,
      background: "var(--surface-2)", border: "1px solid var(--border)",
    }}>
      <Campos min={190}>
        <Campo label={ativo.tipo === "numero" ? "Número" : "Nome"} largo>
          <input value={f.nome} onChange={(e) => set("nome", e.target.value)} maxLength={120}
            style={{ width: "100%", minHeight: "var(--tap)" }} />
        </Campo>

        <Campo label={ativo.tipo === "bm" ? "ID da BM" : ativo.tipo === "conta" ? "ID da conta" : "Número internacional"}>
          <input value={f.identificador} onChange={(e) => set("identificador", e.target.value)} maxLength={120}
            style={{ width: "100%", minHeight: "var(--tap)" }} />
        </Campo>

        {ativo.tipo === "conta" && (
          <Campo label="BM dona">
            <select value={f.paiId} onChange={(e) => set("paiId", e.target.value)}
              style={{ width: "100%", minHeight: "var(--tap)" }}>
              <option value="">Sem BM vinculada</option>
              {bms.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </Campo>
        )}

        {ativo.tipo === "numero" && (
          <>
            <Campo label="Aparelho" dica="Trocar aqui move o número de grupo na visão WhatsApp.">
              <input value={f.aparelho} onChange={(e) => set("aparelho", e.target.value)} maxLength={80}
                list="aq-aparelhos-edit" style={{ width: "100%", minHeight: "var(--tap)" }} />
              <datalist id="aq-aparelhos-edit">
                {aparelhos.map((a) => <option key={a} value={a} />)}
              </datalist>
            </Campo>
            <Campo label="Operadora">
              <input value={f.operadora} onChange={(e) => set("operadora", e.target.value)} maxLength={40}
                style={{ width: "100%", minHeight: "var(--tap)" }} />
            </Campo>
          </>
        )}

        <Campo label="Responsável">
          <input value={f.responsavelNome} onChange={(e) => set("responsavelNome", e.target.value)} maxLength={80}
            style={{ width: "100%", minHeight: "var(--tap)" }} />
        </Campo>

        <Campo label="Início do aquecimento"
          dica="Mudar a data reposiciona TODOS os prazos das etapas.">
          <input type="date" value={f.iniciadoEm} onChange={(e) => set("iniciadoEm", e.target.value)}
            style={{ width: "100%", minHeight: "var(--tap)" }} />
        </Campo>

        <Campo label="Roteiro" largo
          dica="Trocar o roteiro mantém o histórico: as etapas já cumpridas continuam registradas.">
          <select value={f.roteiroId} onChange={(e) => set("roteiroId", e.target.value)}
            style={{ width: "100%", minHeight: "var(--tap)" }}>
            <option value="">Sem roteiro (só histórico)</option>
            {doTipo.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} — {r.etapas.filter((x) => !x.removidaEm).length} etapas
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Observações" largo>
          <textarea value={f.obs} onChange={(e) => set("obs", e.target.value)} maxLength={600} rows={2}
            style={{ width: "100%", resize: "vertical" }} />
        </Campo>
      </Campos>

      {erro && <p style={{ margin: 0, fontSize: 13, color: "var(--perigo)" }}>{erro}</p>}

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <Botao variante="primario" onClick={salvar} disabled={!f.nome.trim() || salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
        <Botao variante="sutil" onClick={onCancelar} disabled={salvando}>Cancelar</Botao>
      </div>

      {/* Zona destrutiva, separada por uma linha e no fim: alvo destrutivo colado
          em outro clicável é como se apaga a coisa errada no celular. */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 2 }}>
        {!confirmando ? (
          <Botao variante="perigo" tamanho="sm" icone="trash" onClick={() => setConfirmando(true)}>Remover este ativo</Botao>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text)" }}>
              Remover <b>{ativo.nome}</b> apaga junto o histórico dele — etapas cumpridas,
              anotações e mudanças de status. Não dá para desfazer.
            </p>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              <Botao variante="perigo" onClick={remover} disabled={salvando}>
                {salvando ? "Removendo…" : "Remover mesmo assim"}
              </Botao>
              <Botao variante="sutil" onClick={() => setConfirmando(false)} disabled={salvando}>
                Manter
              </Botao>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
