"use client";

// ── Administração ────────────────────────────────────────────────────────────
// Era um depósito: quatro abas de assuntos que não conversavam — um card de
// atalho pro TridiMarket, integração de marketplace, disparo de notificação e
// o editor do painel de TV. Cada uma virou uma tela quase vazia, e nenhuma
// estava perto de quem a usa.
//
// Cada coisa foi pro seu dono:
//   · TridiMarket   → atalho fixo na barra lateral (é um workspace, não uma aba)
//   · Marketplaces  → Comercial › Canais (integração que traz PEDIDO)
//   · Notificações  → gaveta do sininho (mandar e receber é o mesmo assunto)
//   · Painel de TV  → ficou; o editor de telas saiu em 25/09/26 (pedido do dono)
//
// E agora a FROTA voltou para cá, junto das telas. Eram duas portas para a
// mesma pergunta — "o que aparece naquela TV?" —, uma na Administração (onde
// se DESENHA a tela) e outra num item solto da barra lateral (onde se MANDA a
// TV abri-la). Quem desenhava não sabia mandar; quem mandava não lembrava que
// podia desenhar. Com as três abas juntas, o assunto é um só: a tela, os
// avisos que entram nela, e os aparelhos que a mostram.

import { useState } from "react";
import { FrotaClient } from "../frota/FrotaClient";
import { AvisosClient } from "./AvisosClient";
import { Momento } from "../ui/Momento";
import { Botao } from "../ui/controles";

type Aba = "avisos" | "tvs";

const ABAS: { key: Aba; label: string; icone: string }[] = [
  { key: "avisos", label: "Avisos", icone: "speakerphone" },
  { key: "tvs", label: "Aparelhos", icone: "settings" },
];

export function AdministracaoClient({ perms }: { perms: { paineis: boolean } }) {
  const [aba, setAba] = useState<Aba>("avisos");

  if (!perms.paineis) {
    return (
      <div className="glass" style={{ borderRadius: "var(--r-md)", maxWidth: 720 }}>
        <Momento icone="settings" titulo="Nada por aqui pra você"
          texto="As integrações de marketplace agora ficam em Comercial › Canais, e o envio de avisos saiu para o sino no topo da tela." />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      {/* `tab-strip`: no celular a fileira rola de lado em vez de espremer. */}
      <div className="tab-strip" style={{ display: "flex", gap: 8 }}>
        {ABAS.map((a) => (
          <Botao
            key={a.key}
            variante={a.key === aba ? "primario" : "secundario"}
            icone={a.icone}
            onClick={() => setAba(a.key)}
            style={{ flex: "none" }}
          >
            {a.label}
          </Botao>
        ))}
      </div>

      {aba === "avisos" && <AvisosClient />}
      {aba === "tvs" && <FrotaClient />}
    </div>
  );
}
