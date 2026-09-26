"use client";

// A aba de Ponto & banco de horas da ficha.
//
// NÃO desenha nada próprio: monta o `DetalheDoDia`, a mesma peça que o painel
// da equipe (`/rh/ponto`) usa na coluna da direita — régua das quatro batidas
// do dia, horas do mês contra a meta, faltas, atrasos e os últimos registros.
//
// Reusar em vez de copiar é o ponto. A primeira versão desta aba tinha tabela
// própria, seletor de mês próprio e formatação de horas própria; duas telas
// mostrando o mesmo ponto da mesma pessoa, e qualquer correção numa delas
// deixava a outra para trás. Aqui a pergunta é a mesma ("como está o ponto
// dessa pessoa?"), então a resposta é o mesmo componente.
//
// NÃO tem poll: é consulta dentro de uma ficha, aberta por alguns segundos. O
// `DetalheDoDia` lê o mês por CLIQUE (na montagem), nunca em ciclo — é a regra
// do orçamento de execução do CLAUDE.md.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PontoPessoa } from "@/lib/ponto";
import { DetalheDoDia } from "../../../administracao/ponto/DetalheDoDia";
import { rotuloBatida } from "../../../administracao/ponto/PessoaDrawer";
import { Icon } from "../../../Icon";
import { BotaoFin, Cartao, TituloCartao, Vazio } from "../../../financeiro/ui";
import { BlocoDeCompensacoes } from "../../../ui/compensacao";

export function AbaPonto({
  colaboradorId, nome, podeVerBanco,
}: {
  colaboradorId: string;
  nome: string;
  /** Sem `rh:banco_horas` o saldo não aparece — ver `mostrarBanco`. */
  podeVerBanco: boolean;
}) {
  const router = useRouter();
  const [pessoa, setPessoa] = useState<PontoPessoa | null>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "sem-vinculo" | "erro">("carregando");

  // Uma leitura, na montagem: só para descobrir QUEM esta pessoa é no relógio
  // de ponto. O `colaborador.id` é do `profiles`; o ponto tem cadastro próprio
  // (`ponto_pessoas`), e o vínculo entre os dois é o `colaboradorId`.
  const carregar = useCallback(async () => {
    setEstado("carregando");
    try {
      const r = await fetch("/api/ponto/pessoas", { cache: "no-store" });
      if (!r.ok) throw new Error("pessoas");
      const { pessoas } = (await r.json()) as { pessoas?: PontoPessoa[] };
      const minha = (pessoas ?? []).find((p) => p.colaboradorId === colaboradorId);
      if (!minha) { setPessoa(null); setEstado("sem-vinculo"); return; }
      setPessoa(minha);
      setEstado("pronto");
    } catch {
      setEstado("erro");
    }
  }, [colaboradorId]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (estado === "sem-vinculo") {
    return (
      <Cartao>
        <TituloCartao icone="clock-hour-4">Ponto & banco de horas</TituloCartao>
        <Vazio
          icone="clock"
          titulo="Esta pessoa não bate ponto"
          detalhe={`${nome} ainda não tem cadastro no relógio de ponto. O vínculo é feito em Ponto & horas › Pessoas no ponto.`}
          acao={<BotaoFin icone="clock-hour-4" href="/rh/ponto">Abrir Ponto & horas</BotaoFin>}
        />
      </Cartao>
    );
  }

  if (estado === "erro") {
    return (
      <Cartao>
        <TituloCartao icone="clock-hour-4">Ponto & banco de horas</TituloCartao>
        <Vazio
          icone="alert-triangle"
          titulo="Não deu para ler o ponto"
          detalhe="O cadastro do relógio não respondeu agora."
          acao={<BotaoFin icone="refresh" onClick={() => void carregar()}>Tentar de novo</BotaoFin>}
        />
      </Cartao>
    );
  }

  if (estado === "carregando" || !pessoa) {
    return (
      <Cartao>
        <p style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--text-dim)" }}>
          <Icon name="loader" size={15} color="var(--text-dim)" className="spin" />
          Carregando o ponto…
        </p>
      </Cartao>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
    <DetalheDoDia
      pessoaId={pessoa.id}
      nome={pessoa.nome}
      fotoUrl={pessoa.fotoUrl}
      entradaPrevista={pessoa.entradaPrevista}
      saidaPrevista={pessoa.saidaPrevista}
      // `null` de propósito: `status` é o retrato AO VIVO que a lista do painel
      // mantém por poll. A ficha não faz esse poll — e sem ele o `DetalheDoDia`
      // já esconde o botão de bater sozinho, que é o certo: bater ponto por
      // outra pessoa é ato do painel da equipe, não de uma ficha de consulta.
      status={null}
      podeGerir={false}
      rotuloDaBatida={rotuloBatida}
      mostrarBanco={podeVerBanco}
      // O pop-up da ficha tem 1180px: com 2×2 metade da fileira de números
      // ficava vazia. Na coluna estreita do painel da equipe o padrão (2×2)
      // continua valendo.
      numerosEmLinha
      onAbrirTudo={() => router.push("/rh/ponto")}
    />

    {/* O histórico de compensações da pessoa, com o par visível em cada linha.
        É o que responde, de uma olhada, "qual dia foi usado como compensação"
        e "quem aprovou" — as duas perguntas que antes só existiam na cabeça de
        quem combinou a troca. */}
    <Cartao>
      <BlocoDeCompensacoes
        employeeId={colaboradorId}
        nome={nome}
        titulo="Feriados trocados e folgas compensatórias"
        aoMudar={() => router.refresh()}
      />
    </Cartao>
    </div>
  );
}
