"use client";

// Ponto & banco de horas — a pergunta "quanto a equipe trabalhou".
//
// Separado de Colaboradores de propósito. As duas telas falam da mesma gente,
// mas respondem coisas diferentes: lá é QUEM é a pessoa (cadastro, documentos,
// atestados, férias); aqui é QUANTO ela trabalhou (batidas, saldo, jornada). Um
// módulo só, com tudo empilhado, fazia conferir o ponto do dia custar rolar por
// cima de endereço e ficha anamnésica.
//
// O ponto de UMA pessoa continua na ficha dela (Colaboradores › pessoa ›
// Ponto), montando o mesmo `DetalheDoDia` que o painel aqui usa.
//
// A CONFIGURAÇÃO saiu do fim da página. Ela era três sanfonas soltas embaixo do
// painel — quem vinha conferir o dia rolava por cima delas todo dia para nada,
// e quem vinha cadastrar um turno tinha que passar pelo painel inteiro antes.
// Nenhuma das duas rotinas era servida. Agora é um pop-up atrás de um botão no
// cabeçalho: sai do caminho de quem consulta, e fica a um clique de quem
// configura.

import { useCallback, useEffect, useState } from "react";
import type { PontoPessoa } from "@/lib/ponto";
import { PontoPanel } from "../../administracao/PontoPanel";
import { PessoasDoPonto, TabletPair } from "../../administracao/ponto/PessoasDoPonto";
import { PontoTurnos } from "../../administracao/PontoTurnos";
import { Acoes, Botao, Esp, PainelLateral } from "../../ui/controles";
import { Secao } from "../../ui/Secao";
import { Cabecalho } from "../../financeiro/ui";

export function PontoDaEquipe({ podeGerir }: { podeGerir: boolean }) {
  const [pessoas, setPessoas] = useState<PontoPessoa[] | null>(null);
  const [config, setConfig] = useState(false);

  // Uma leitura na montagem e outra quando alguém mexe no cadastro. NÃO é
  // poll: a tela fica aberta o dia inteiro num segundo monitor, e um intervalo
  // aqui seria exatamente o gasto que já pausou este projeto na Vercel.
  const carregar = useCallback(() => {
    fetch("/api/ponto/pessoas", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPessoas(d.pessoas ?? []))
      .catch(() => setPessoas([]));
  }, []);
  useEffect(carregar, [carregar]);

  return (
    <>
      <Cabecalho
        tarja="RH"
        titulo="Ponto & banco de horas"
        sub="Quem está presente agora, as batidas do período e o saldo de horas da equipe."
        acoes={
          podeGerir ? (
            <Botao icone="settings" onClick={() => setConfig(true)}>Configurar</Botao>
          ) : undefined
        }
      />

      <PontoPanel podeGerir={podeGerir} />

      {config && (
        <PainelLateral
          centrado
          largura={900}
          titulo="Configurar o ponto"
          subtitulo="Vale para a empresa inteira — quem bate, em que horário e em qual aparelho."
          onFechar={() => setConfig(false)}
          rodape={<Acoes><Esp /><Botao onClick={() => setConfig(false)}>Fechar</Botao></Acoes>}
        >
          {/* Sanfonas DENTRO do pop-up, e não três painéis abertos: são três
              assuntos de manutenção, abertos um de cada vez. A primeira nasce
              aberta porque é a que se mexe com mais frequência. */}
          <Secao
            icone="user-check"
            titulo="Pessoas no ponto"
            resumo={pessoas ? `${pessoas.length} cadastrada(s) — rosto, turno e jornada` : "rosto, turno e jornada"}
            inicialAberta
          >
            <PessoasDoPonto pessoas={pessoas} podeGerir={podeGerir} onChange={carregar} />
          </Secao>
          <Secao icone="clock" titulo="Turnos da empresa" resumo="horários reusados no cadastro das pessoas">
            <PontoTurnos />
          </Secao>
          <Secao icone="device-tv" titulo="Tablet do ponto" resumo="parear o aparelho que lê os rostos">
            <TabletPair />
          </Secao>
        </PainelLateral>
      )}
    </>
  );
}
