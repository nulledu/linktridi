"use client";

import { acharCategoria, CATEGORIAS_COMPROMISSO, SELO_COMPROMISSO } from "@/lib/financeiro/tipos";
import { dataBR, moeda } from "@/lib/financeiro/calculos";
import { Selo, Tabela, Vazio } from "./ui";
import type { CompromissoStatus } from "@/lib/financeiro/tipos";

export interface LinhaProxima {
  id: string;
  vencimento: string;
  descricao: string;
  categoria: string;
  valor: number;
  efetivo: CompromissoStatus;
}

/**
 * A tabela de "Próximos compromissos" da Visão Geral.
 *
 * Existe como componente próprio por uma regra de fronteira, não por gosto: a
 * Visão Geral é Server Component e a `<Tabela>` é Client Component. As colunas
 * levam `celula` e `chaveDe`, que são FUNÇÕES — e função não atravessa a
 * fronteira servidor→cliente. O React serializa o resto da tela, chega nelas e
 * quebra com "Functions cannot be passed directly to Client Components".
 *
 * O modo como isso falha é o pior possível: o HTML do servidor sai inteiro
 * (a tela chega a aparecer), mas o pacote RSC vai corrompido e a hidratação
 * morre — a pessoa vê "Não conseguimos abrir esta tela" numa página que o
 * servidor renderizou sem erro nenhum. Nem o `tsc` nem um teste que renderiza a
 * árvore com `renderToStaticMarkup` enxergam isso: os dois só olham UM lado da
 * fronteira, e a fronteira só existe no empacotador.
 *
 * Por isso a regra é a mesma das outras telas do módulo, que já nascem com um
 * `XClient`: a página lê no servidor e passa DADOS; quem define função é sempre
 * o lado cliente. A trava está em `lib/__tests__/financeiro-fronteira-rsc.test.ts`.
 */
export function ProximosCompromissos({ linhas }: { linhas: LinhaProxima[] }) {
  return (
    <Tabela
      linhas={linhas}
      chaveDe={(c) => c.id}
      vazio={<Vazio compacto icone="circle-check" titulo="Nenhuma conta em aberto" detalhe="Tudo que vencia já foi pago ou cancelado." />}
      colunas={[
        {
          chave: "vencimento", label: "Vencimento", largura: "112px",
          celula: (c) => (
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{dataBR(c.vencimento)}</span>
          ),
        },
        {
          chave: "descricao", label: "Descrição", largura: "minmax(min(100%, 180px), 1.4fr)", titulo: true,
          celula: (c) => c.descricao,
        },
        {
          chave: "categoria", label: "Categoria", largura: "minmax(min(100%, 130px), 1fr)", soNoComputador: true,
          celula: (c) => acharCategoria(CATEGORIAS_COMPROMISSO, c.categoria).label,
        },
        {
          chave: "valor", label: "Valor", largura: "minmax(min(100%, 110px), 0.8fr)", fim: true,
          celula: (c) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(c.valor)}</strong>,
        },
        {
          chave: "status", label: "Status", largura: "126px", fim: true,
          celula: (c) => <Selo selo={SELO_COMPROMISSO[c.efetivo]} />,
        },
      ]}
    />
  );
}
