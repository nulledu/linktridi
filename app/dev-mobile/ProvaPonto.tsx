"use client";

// Banco de provas das peças novas do Controle de Ponto — sem login e sem banco.
// As telas reais estão atrás de sessão, e o que precisa ser medido aqui é
// LAYOUT (320px, alvo de toque, folha do modal), não os dados.
import { useState } from "react";
import { BatidaChip, LancarDiaModal } from "../(plataforma)/administracao/PontoPanel";
import type { PontoPessoa, PontoRegistro } from "@/lib/ponto";

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "");

const pessoa = (id: string, nome: string): PontoPessoa => ({
  id, nome, colaboradorId: null, fotoUrl: null, fotos: [], temPin: false, consentimento: true,
  jornadaMin: 480, trabalhaSabado: false, sabadoMin: null,
  entradaPrevista: "08:00", saidaPrevista: "18:00", almocoInicio: "12:00", almocoFim: "13:00",
  turnoId: null, estagiario: false, ativo: true, createdAt: "2026-01-01T00:00:00.000Z",
});

const batida = (id: string, tipo: PontoRegistro["tipo"], h: string, origem: PontoRegistro["origem"] = "tablet"): PontoRegistro =>
  ({ id, pessoaId: "p1", tipo, batidoEm: `2026-08-03T${h}:00.000Z`, selfieUrl: null, confianca: 0.97, origem });

export function ProvaPonto() {
  const [modal, setModal] = useState(false);
  const pessoas = [pessoa("p1", "Maria Aparecida de Souza"), pessoa("p2", "João")];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800 }}>Ponto — peças novas</h2>

      <div className="glass" style={{ borderRadius: 16, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Chips de batida (hora editável)</div>
        <div id="ponto-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <BatidaChip r={batida("b1", "entrada", "11:02")} dia="2026-08-03" hora={hora}
            onMover={async () => true} onApagar={() => {}} />
          <BatidaChip r={batida("b2", "almoco", "15:01", "manual")} dia="2026-08-03" hora={hora}
            onMover={async () => true} onApagar={() => {}} />
        </div>
      </div>

      <button id="ponto-abrir-modal" onClick={() => setModal(true)}
        style={{ padding: "10px 16px", borderRadius: 11, fontSize: 13.5, fontWeight: 800, border: "none", cursor: "pointer", background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", width: "fit-content" }}>
        Abrir “Lançar ponto manual”
      </button>

      {modal && (
        <LancarDiaModal pessoas={pessoas} pessoaInicial="p1" diaInicial="2026-08-03"
          jaTemDe={() => ["08:02"]} onLancar={async () => true} onClose={() => setModal(false)} />
      )}
    </div>
  );
}
