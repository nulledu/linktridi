"use client";

// A ficha do colaborador — em POP-UP, não em rota.
//
// Era uma página (`/rh/colaboradores/[id]`). Trocar de tela para ver alguém
// custava um render de servidor inteiro, tirava a lista de baixo dos olhos e
// obrigava a voltar para abrir a próxima pessoa. E fugia do padrão do módulo
// que serve de referência: no Financeiro, clicar numa linha ABRE UM PAINEL.
//
// Agora é um `PainelLateral` que busca a ficha numa ida só
// (`GET /api/rh/colaboradores/[id]`). A lista continua atrás; fechar devolve o
// lugar onde a pessoa estava, e abrir o próximo é um clique.
//
// `soFechaNoX` é CONDICIONAL, não fixo: parada, a ficha é leitura e leitura
// fecha fácil (Esc, véu, arrasto) — não há nada a perder. Assim que existe algo
// digitado por salvar, ela vira formulário e passa a valer a regra dos
// formulários da fundação, porque aí um gesto involuntário custa vinte campos.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PoderesRh } from "@/lib/rh/gate";
import { SELO_SITUACAO, type ColaboradorRh, type FichaPayload } from "@/lib/rh/tipos";
import { Avatar } from "../../ui/Avatar";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { Botao, PainelLateral } from "../../ui/controles";
import { Selo } from "../../financeiro/ui";
import { CorpoDaFicha } from "./ficha/CorpoDaFicha";

export function PainelDoColaborador({
  pessoa, hoje, poderes, aoFechar, aoMudar,
}: {
  /** A linha que a lista já tem: desenha o cabeçalho ANTES de a ficha chegar. */
  pessoa: ColaboradorRh;
  hoje: string;
  poderes: PoderesRh;
  aoFechar: () => void;
  /** A ficha mudou algo que a LISTA mostra (situação, cargo, setor). */
  aoMudar: () => void;
}) {
  const [dados, setDados] = useState<FichaPayload | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  // A ficha virou formulário: os campos das abas Pessoais e Profissionais são
  // editáveis direto aqui dentro, sem um segundo pop-up por cima. Enquanto há
  // algo por salvar, o painel passa a obedecer a regra dos FORMULÁRIOS da
  // fundação — só fecha no X. Esc, clique no véu e arrasto deixariam vinte
  // campos digitados irem embora num gesto involuntário.
  const [sujo, setSujo] = useState(false);
  // Identidade estável: o `aoSujar` entra numa lista de dependências lá dentro,
  // e uma função nova a cada render do pai faria o efeito rodar a cada tecla.
  const avisarSujo = useMemo(() => (v: boolean) => setSujo(v), []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch(`/api/rh/colaboradores/${encodeURIComponent(pessoa.id)}`, { cache: "no-store" });
      const ehJson = r.headers.get("content-type")?.includes("application/json");
      if (!r.ok || !ehJson) {
        const msg = ehJson ? ((await r.json()) as { erro?: string }).erro : null;
        setErro(msg || (r.status === 403 ? "Você não tem permissão para abrir esta ficha." : "Não deu para abrir a ficha."));
        return;
      }
      setDados((await r.json()) as FichaPayload);
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }, [pessoa.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * Recarrega a FICHA e avisa a lista.
   *
   * São duas coisas diferentes e as duas precisam acontecer: mudar a situação
   * de alguém tem de repintar a pílula aqui dentro (a ficha) e o selo lá fora
   * (a linha da lista). Recarregar só a ficha deixava a lista mentindo até a
   * próxima navegação.
   */
  const recarregar = () => { void carregar(); aoMudar(); };

  // Largura grande de propósito: agora que cada aba REÚNE várias seções numa
  // rolagem só (Cadastro = pessoais + profissionais, Documentação = três
  // listas, Jornada = ponto + férias), o painel estreito espremia grade de
  // campos e tabela numa coluna só. O CSS satura em `calc(100vw - 40px)`, então
  // num monitor menor o número não estoura nada; no celular o `PainelLateral`
  // ignora a largura e ocupa a tela inteira.
  return (
    <PainelLateral
      centrado
      soFechaNoX={sujo}
      largura={1320}
      onFechar={aoFechar}
      titulo={
        // `maxWidth: 100%` junto do `minWidth: 0`, e os dois são necessários:
        // um contêiner inline-flex dimensiona pelo CONTEÚDO, então sem o teto
        // ele media 335px num celular de 320 e o nome saía pela borda do
        // painel (o `overflow: hidden` do cabeçalho escondia a sobra em vez de
        // quebrar a linha — o defeito CORTA).
        <span style={{ display: "inline-flex", alignItems: "center", gap: 11, minWidth: 0, maxWidth: "100%" }}>
          <Avatar url={pessoa.foto} nome={pessoa.nome} size={34} />
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{pessoa.nome}</span>
        </span>
      }
      subtitulo={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Selo selo={SELO_SITUACAO[dados?.ficha?.situacao ?? pessoa.situacao]} />
          <span>{[pessoa.cargo, pessoa.setor].filter(Boolean).join(" · ") || "Sem cargo definido"}</span>
        </span>
      }
    >
      {/* ALTURA ESTÁVEL. O painel centrado é `height: max-content`, então ele
          encolhia e crescia a cada troca de aba — "Pessoais" (quatro linhas) o
          deixava com um terço do tamanho de "Ponto", e a janela pulava debaixo
          do cursor a cada clique. Com um piso, a moldura fica parada e só o
          conteúdo troca; o `max-height` do CSS continua sendo o teto, e quem
          passa dele rola por dentro. `dvh` e não `vh`: no celular a barra do
          navegador entra na conta e o rodapé nasceria atrás dela. */}
      <div style={{ minHeight: "min(70dvh, 720px)", display: "flex", flexDirection: "column", minWidth: 0 }}>
      {erro ? (
        <div style={{ display: "grid", gap: 14, placeItems: "center", padding: "36px 0", textAlign: "center" }}>
          <Icon name="alert-triangle" size={26} color="var(--perigo)" />
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", maxWidth: "48ch", lineHeight: 1.5 }}>{erro}</p>
          <Botao icone="refresh" onClick={() => void carregar()}>Tentar de novo</Botao>
        </div>
      ) : !dados ? (
        <EsqueletoDaFicha />
      ) : (
        <>
          {/* Recarregando por cima do conteúdo que já está na tela: trocar a
              ficha por um esqueleto a cada salvamento faria a tela piscar. */}
          {carregando && (
            <p style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12.5, color: "var(--text-dim)" }}>
              <Icon name="loader" size={14} color="var(--text-dim)" className="spin" />
              Atualizando…
            </p>
          )}
          <CorpoDaFicha dados={dados} poderes={poderes} hoje={hoje} aoMudar={recarregar} aoSujar={avisarSujo} />
        </>
      )}
      </div>
    </PainelLateral>
  );
}

/** A FORMA da ficha enquanto ela chega — abas, cartão de identidade e números. */
function EsqueletoDaFicha() {
  const osso = (h: number, w: string | number, r = 10, i = 0): React.CSSProperties => ({
    height: h, width: w, borderRadius: r, background: "var(--surface-2)",
    animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.06}s`,
  });
  return (
    <div aria-busy="true" aria-label="Carregando a ficha" style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[120, 96, 120, 116, 104].map((w, i) => <div key={i} style={osso(34, w, 999, i)} />)}
      </div>
      <div style={{ ...osso(120, "100%", 18, 2), padding: 18, display: "grid", gap: 10, alignContent: "center" }}>
        <div style={{ height: 18, width: "45%", borderRadius: 8, background: "var(--surface)" }} />
        <div style={{ height: 12, width: "62%", borderRadius: 6, background: "var(--surface)" }} />
      </div>
      <div
        style={{
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
        }}
      >
        {[0, 1, 2, 3].map((i) => <div key={i} style={osso(88, "100%", 16, i + 3)} />)}
      </div>
    </div>
  );
}
