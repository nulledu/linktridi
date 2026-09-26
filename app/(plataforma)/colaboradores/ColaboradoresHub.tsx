"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CarregandoGenerico } from "../ui/CarregandoGenerico";

// Só o TIPO: `import type` é apagado na compilação, então a lista de pessoas
// (1.900 linhas) NÃO entra no pedaço desta aba — ela chega pelo `dynamic`
// abaixo, quando alguém abre "Gestão de equipe".
import type { DadosDaEquipe } from "./GestaoDeEquipe";
import { PontoPanel } from "../administracao/PontoPanel";
import { Icon } from "../Icon";
import { useSticky } from "../useSticky";
import { Abas } from "../ui/Abas";

/**
 * As abas que NÃO são a porta de entrada chegam por pedaço separado.
 *
 * A aba padrão é o Ponto, mas o navegador baixava e interpretava, junto com
 * ela, a gestão de equipe inteira (a lista de pessoas, o cadastro, os turnos,
 * os aparelhos) — quase três mil linhas de componente que a maioria das
 * aberturas nunca desenha. Agora cada porta traz o próprio código quando é
 * aberta; o Ponto pinta sem esperar por nenhuma delas.
 *
 * `ssr: false` de propósito: são telas de trabalho atrás de login, não têm
 * nada a ganhar com HTML pronto, e assim o pedaço nem entra na resposta do
 * servidor.
 */
const GestaoDeEquipe = dynamic(
  () => import("./GestaoDeEquipe").then((m) => m.GestaoDeEquipe),
  { ssr: false, loading: () => <CarregandoGenerico /> },
);

// ── Pessoas: DOIS níveis de navegação, não três ──────────────────────────────
// Era Sidebar → 4 abas → sub-abas (Atividades|Metas dentro de uma; Agora|
// Registros|Pessoas|Turnos|Tablet dentro de outra). Três camadas pra chegar
// numa tela, e o terceiro nível mudava de desenho conforme a aba — a pessoa
// reaprendia onde clicar a cada degrau.
//
// Agora são duas portas, e cada uma é um ASSUNTO inteiro:
//   · Ponto — presença, espelho e banco de horas
//   · Equipe — quem é quem, acesso e os aparelhos
// O que se mexe de vez em quando (dispositivos, turnos) vira SEÇÃO dentro da
// porta certa, não uma aba própria.
// O Cofre de senhas SAIU de Pessoas em 15/09/2026 — mora só em Acessos & Infra
// agora (a permissão virou `infraestrutura:cofre`). "Produtividade & metas" saiu
// em 12/09/2026 (pedido do dono); o quadro de Atividades foi pro Operacional um
// dia antes; metas seguem na rota /metas.
type Tab = "ponto" | "equipe";

const VALIDAS: Tab[] = ["ponto", "equipe"];
// Quem tinha uma aba antiga guardada ("produtividade", "atividades", "metas",
// "cofre") cai no Ponto, a porta padrão — nunca numa tela em branco.
const resolveAba = (v: string): Tab =>
  (VALIDAS as string[]).includes(v) ? (v as Tab)
    : v === "dispositivos" ? "equipe"
    : "ponto";

export function ColaboradoresHub({
  meId, isAdmin, areasQueConcedo, equipe,
}: {
  meId: string;
  isAdmin: boolean;
  /** Áreas RESTRITAS que quem abriu a tela pode conceder (ver lib/areas.ts). */
  areasQueConcedo: string[];
  /** A lista de pessoas e o que o picker de restrição precisa — ainda em voo.
   *  É uma PROMESSA de propósito: só a aba "Gestão de equipe" a usa, e a aba que
   *  abre por padrão é o Ponto. Esperar por ela no servidor fazia toda abertura
   *  pagar a consulta mais pesada da tela. Quem a abre é `use()`, lá dentro,
   *  atrás da fronteira de Suspense do `dynamic`. */
  equipe: Promise<DadosDaEquipe>;
}) {
  // Quem chegou aqui TEM a área "Colaboradores" (o gate é a página). As abas
  // seguem essa porta, não o papel: antes tudo — Equipe, Ponto, Dispositivos —
  // dependia de `role === "admin"`, então quem recebeu a área na grade abria a
  // tela e encontrava só "Atividades". Permissão ligada, área vazia.
  // `isAdmin` continua valendo pro que distribui PODER (criar pessoa, resetar
  // senha, mexer na grade) — isso mora dentro do ColaboradoresClient.
  const [tabRaw, setTab] = useSticky<string>("pessoas.tab", "ponto");
  // A aba lembrada sobrevive à saída de uma aba (`useSticky` guarda no navegador,
  // não no servidor): "cofre", "produtividade" e afins caem no Ponto via
  // `resolveAba` — nunca numa tela em branco.
  const tab: Tab = resolveAba(tabRaw);

  const tabs: { key: Tab; nome: string; icon: string }[] = [
    { key: "ponto", nome: "Ponto & banco de horas", icon: "hourglass-high" },
    { key: "equipe", nome: "Gestão de equipe", icon: "users" },
  ];

  return (
    <div>
      {/* A mesma peça de abas do resto do sistema. Antes esta faixa pintava o
          próprio fundo (corte seco ao trocar), as subabas usavam um segmentado,
          e a aba Equipe já usava a pílula que viaja — TRÊS visuais de aba na
          mesma tela, cada um se comportando de um jeito. */}
      <div style={{ marginBottom: 20 }}>
        <Abas
          valor={tab}
          onMuda={(v) => setTab(v)}
          ariaLabel="Seções de Pessoas"
          itens={tabs.map((t) => ({
            valor: t.key,
            rotulo: <><Icon name={t.icon} size={15} color="currentColor" /> {t.nome}</>,
          }))}
        />
      </div>

      {tab === "ponto" && <PontoPanel podeGerir={isAdmin} />}

      {tab === "equipe" && <GestaoDeEquipe meId={meId} isAdmin={isAdmin} areasQueConcedo={areasQueConcedo} equipe={equipe} />}
    </div>
  );
}

