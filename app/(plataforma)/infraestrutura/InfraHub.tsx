"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CarregandoGenerico } from "../ui/CarregandoGenerico";
import { Icon } from "../Icon";
import { Abas } from "../ui/Abas";
import { useSticky } from "../useSticky";
import { PageHead } from "../ui/mobile";
import type { DadosDaEquipe } from "../colaboradores/GestaoDeEquipe";

// Cada aba traz o próprio pedaço quando é aberta — mesma razão de Pessoas: a
// porta padrão não paga o código das outras. `ssr: false` porque é tela de
// trabalho atrás de login; HTML pronto não ganha nada.
const Dominios = dynamic(() => import("./Dominios").then((m) => m.Dominios),
  { ssr: false, loading: () => <CarregandoGenerico /> });
const Hospedagens = dynamic(() => import("./Hospedagens").then((m) => m.Hospedagens),
  { ssr: false, loading: () => <CarregandoGenerico /> });
const Vps = dynamic(() => import("./Vps").then((m) => m.Vps),
  { ssr: false, loading: () => <CarregandoGenerico /> });
const CofreAcessos = dynamic(() => import("../colaboradores/CofreAcessos").then((m) => m.CofreAcessos),
  { ssr: false, loading: () => <CarregandoGenerico /> });

type Tab = "dominios" | "hospedagens" | "vps" | "emails" | "cofre";
const VALIDAS: Tab[] = ["dominios", "hospedagens", "vps", "emails", "cofre"];
const resolveAba = (v: string): Tab => (VALIDAS as string[]).includes(v) ? (v as Tab) : "dominios";

/** Opção de credencial pro vínculo. Só o NOME — a senha continua saindo apenas
 *  pela rota que audita. */
export interface OpcaoCredencial { value: string; label: string }

export function InfraHub({ podeCofre, equipe }: {
  /** Tem `infraestrutura:cofre`? A aba do cofre (e o seletor de credencial dos
   *  vínculos) nem são desenhados sem isso — a API gateia pela mesma chave. */
  podeCofre: boolean;
  equipe: Promise<DadosDaEquipe>;
}) {
  const [tabRaw, setTab] = useSticky<string>("infra.tab", "dominios");
  const salva = resolveAba(tabRaw);
  // A aba lembrada sobrevive a perder a permissão (useSticky mora no
  // navegador): sem esta volta, quem perdeu o cofre abriria uma aba vazia.
  // E-mails são credenciais do cofre com outra roupa — a aba segue a MESMA
  // chave: sem `infraestrutura:cofre` nem ela nem o Cofre são desenhados.
  const tab: Tab = (salva === "cofre" || salva === "emails") && !podeCofre ? "dominios" : salva;

  // As credenciais pro seletor de vínculo (Domínios e Hospedagens). Uma ida só,
  // sem poll, e SÓ pra quem tem o cofre — /api/acessos gateia por essa chave.
  const [credenciais, setCredenciais] = useState<OpcaoCredencial[]>([]);
  useEffect(() => {
    if (!podeCofre) return;
    fetch("/api/acessos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCredenciais(
        ((d?.credenciais ?? []) as { id: string; servico: string; login: string | null }[])
          .map((c) => ({ value: c.id, label: c.login ? `${c.servico} (${c.login})` : c.servico })),
      ))
      .catch(() => {});
  }, [podeCofre]);

  const tabs: { key: Tab; nome: string; icon: string }[] = [
    { key: "dominios", nome: "Domínios", icon: "world-www" },
    { key: "hospedagens", nome: "Hospedagens", icon: "stack-2" },
    { key: "vps", nome: "VPS", icon: "database" },
    ...(podeCofre ? [
      { key: "emails" as Tab, nome: "E-mails", icon: "mail" },
      { key: "cofre" as Tab, nome: "Cofre de senhas", icon: "lock" },
    ] : []),
  ];

  return (
    <div>
      <PageHead
        title="Acessos & Infra"
        sub="Domínios, hospedagens e o cofre de senhas — o que vence quando, o que renovar e com qual acesso se mexe em cada coisa."
      />
      <div style={{ marginBottom: 20 }}>
        <Abas
          valor={tab}
          onMuda={(v) => setTab(v)}
          ariaLabel="Seções de Acessos & Infra"
          itens={tabs.map((t) => ({
            valor: t.key,
            rotulo: <><Icon name={t.icon} size={15} color="currentColor" /> {t.nome}</>,
          }))}
        />
      </div>

      {tab === "dominios" && <Dominios equipe={equipe} credenciais={credenciais} podeCofre={podeCofre} />}
      {tab === "hospedagens" && <Hospedagens equipe={equipe} credenciais={credenciais} podeCofre={podeCofre} />}
      {tab === "vps" && <Vps equipe={equipe} credenciais={credenciais} podeCofre={podeCofre} />}
      {/* A aba E-mails é o PRÓPRIO cofre com o tipo travado: responde "este
          e-mail é pra quê?" sem misturar com GitHub e AWS. Cadastrar aqui ou
          lá dá no mesmo registro. */}
      {tab === "emails" && podeCofre && <CofreAcessos equipe={equipe} tipoFixo="email" />}
      {tab === "cofre" && podeCofre && <CofreAcessos equipe={equipe} />}
    </div>
  );
}
