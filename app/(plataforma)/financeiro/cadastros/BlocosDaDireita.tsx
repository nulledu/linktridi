"use client";

import { dataBR } from "@/lib/financeiro/calculos";
import { Barras, Cartao, Tabela, TituloCartao, Vazio } from "../ui";

export interface FatiaCadastro { id: string; label: string; cor: string; valor: number; proporcao: number }
export interface UltimoCadastro { id: string; nome: string; tipo: string; cor: string; quando: string | null }

/**
 * A coluna da direita dos Cadastros: o gráfico de barras e a lista do que já
 * está cadastrado.
 *
 * Está aqui, e não na página, pela regra de fronteira: `<Barras>` recebe
 * `formatar` e `<Tabela>` recebe `celula`/`chaveDe` — todas FUNÇÕES, e função
 * não atravessa a fronteira servidor→cliente. A página é Server Component; o
 * kit é Client Component. Ver o cabeçalho de `../ProximosCompromissos.tsx`
 * para o modo como isso falha (tela que aparece e depois quebra na hidratação).
 */
export function BlocosDaDireita({ fatias, ultimos }: { fatias: FatiaCadastro[]; ultimos: UltimoCadastro[] }) {
  return (
    <>
      <Cartao>
        <TituloCartao icone="chart-bar">Resumo dos cadastros</TituloCartao>
        {/* Contagem, não dinheiro: sem isto "3" viraria "R$ 3,00". */}
        <Barras fatias={fatias} formatar={(v) => String(v)} />
      </Cartao>

      <Cartao>
        <TituloCartao icone="clock">Últimos cadastros</TituloCartao>
        <Tabela
          linhas={ultimos}
          chaveDe={(u) => u.id}
          vazio={<Vazio compacto icone="folder" titulo="Nenhum cadastro ainda" detalhe="Comece pelas contas: sem elas não dá para dar baixa em nada." />}
          colunas={[
            { chave: "nome", label: "Nome", largura: "minmax(min(100%, 140px), 1.4fr)", titulo: true, celula: (u) => u.nome },
            {
              chave: "tipo", label: "Tipo", largura: "minmax(min(100%, 120px), 1fr)",
              celula: (u) => (
                <span
                  style={{
                    display: "inline-block", padding: "3px 9px", borderRadius: "var(--r-pill)",
                    fontSize: 11.5, fontWeight: 700, color: u.cor,
                    background: `color-mix(in srgb, ${u.cor} 13%, transparent)`,
                  }}
                >
                  {u.tipo}
                </span>
              ),
            },
            { chave: "quando", label: "Data", largura: "96px", fim: true, celula: (u) => dataBR(u.quando, { curta: true }) },
          ]}
        />
      </Cartao>
    </>
  );
}
