"use client";

// ── O que vai IMPRESSO na etiqueta ───────────────────────────────────────────
//
// O tamanho da tira virou ajuste; o conteúdo dela ainda era fixo. Um galpão que
// não usa prateleira numerada imprimia a linha do detalhe vazia, e um que refaz
// a etiqueta toda semana não tinha uso pra data.
//
// ── A TELA FALA NO POSITIVO, O BANCO GUARDA O NEGATIVO ──────────────────────
//
// Quem está aqui pensa "o que eu quero impresso", então a caixinha é "imprimir
// X" e nasce marcada. O banco guarda o contrário — a lista dos DESLIGADOS —
// porque é isso que faz um campo novo nascer ligado em quem já tem configuração
// gravada. A tradução acontece só nesta fronteira, e é uma linha.
//
// ── CADA CAIXINHA DIZ O QUE CUSTA, E ISSO NÃO É ENFEITE ─────────────────────
//
// Interruptor sem consequência escrita é interruptor que alguém deixa errado —
// e aqui "errado" quer dizer um lote de etiquetas sem a data, descoberto meses
// depois quando ninguém sabe a idade da pilha. Então cada linha diz o que se
// perde E o que se ganha: desligar DEVOLVE espaço, e é isso que faz a etiqueta
// baixa continuar valendo a pena.

import { Icon } from "../../Icon";
import { CAMPOS_DA_ETIQUETA, type CampoEtiqueta } from "@/lib/estoque-etiqueta-config";
import { Caixa } from "../../ui/controles";

export function CamposDaEtiqueta({
  ocultos,
  onMuda,
  desabilitado = false,
  /** Sem as explicações longas — pro painel da folha, onde elas já foram ditas. */
  compacto = false,
  idBase,
}: {
  ocultos: CampoEtiqueta[];
  onMuda: (ocultos: CampoEtiqueta[]) => void;
  desabilitado?: boolean;
  compacto?: boolean;
  /** Casa cada `<label>` com o seu `<input>`. Dois usos na mesma tela = dois bases. */
  idBase: string;
}) {
  function alternar(key: CampoEtiqueta, imprimir: boolean) {
    // A lista sai sempre na ordem do catálogo: assim duas telas nunca mostram
    // os mesmos campos em ordens diferentes, e comparar duas listas iguais dá
    // igual (é o que decide se o botão "Salvar" acende).
    const proximos = new Set(ocultos);
    if (imprimir) proximos.delete(key); else proximos.add(key);
    onMuda(CAMPOS_DA_ETIQUETA.filter((c) => proximos.has(c.key)).map((c) => c.key));
  }

  return (
    <div style={{ display: "grid", gap: compacto ? 2 : 10 }}>
      {CAMPOS_DA_ETIQUETA.map((campo) => {
        const imprime = !ocultos.includes(campo.key);
        const id = `${idBase}-${campo.key}`;
        return (
          <div key={campo.key}>
            {/* `<label>` envolvendo UM checkbox é o certo — o alerta do
                CLAUDE.md é sobre `<label>` em volta de um GRUPO de botões, onde
                clicar no rótulo dispara o primeiro deles. Aqui o rótulo e o
                controle são um só, e a área de toque é a linha inteira, que é o
                que o celular pede.

                `minHeight: var(--tap)` na LINHA e não só na caixinha: o alvo é
                o texto junto, senão sobram 16px clicáveis num alvo de 44. */}
            <label
              htmlFor={id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                minHeight: "var(--tap)", cursor: desabilitado ? "default" : "pointer",
                opacity: desabilitado ? 0.6 : 1,
              }}
            >
              <Caixa marcado={imprime} desativado={desabilitado} titulo={campo.rotulo} onChange={(marc) => alternar(campo.key, marc)} />
              <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>{campo.rotulo}</span>
              {!imprime && (
                <span style={{
                  flex: "0 0 auto", marginLeft: "auto", fontSize: 11, fontWeight: 700,
                  color: "var(--atencao)", display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <Icon name="eye-off" size={13} color="currentColor" />
                  não sai
                </span>
              )}
            </label>
            {!compacto && (
              // A explicação fica FORA do `<label>`: dentro dela, cada toque no
              // parágrafo alternaria a caixinha, e um texto de três linhas vira
              // um alvo enorme que ninguém quer acertar.
              <p style={{
                margin: "0 0 0 28px", fontSize: 12, lineHeight: 1.5, color: "var(--text-dim)",
              }}>
                {campo.troca}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
