"use client";

import type { ReactNode } from "react";
import { Icon } from "../Icon";

/**
 * Momento — a tela quando não há o que listar, acabou de dar certo, ou deu erro.
 *
 * Existiam DEZ componentes `Vazio` no app (TridiChat, Tráfego ×2, TridiFlow ×3,
 * Marketing ×3, Central) e 111 mensagens de vazio distintas escritas à mão.
 * Cada um resolvia o mesmo problema com um espaçamento, um tamanho de ícone e
 * um tom diferentes.
 *
 * É aqui, e só aqui, que a atmosfera do login cabe. O login pode se dar ao luxo
 * do fundo com órbitas porque não há nada para ler além do formulário — a tela
 * inteira é o momento. Atrás de uma tabela de dados o mesmo fundo vira ruído e
 * disputa atenção com o conteúdo. Então o que atravessa é o BRILHO (um halo
 * radial da cor de destaque, atrás do ícone), não as órbitas: aquelas
 * continuam sendo a assinatura da porta de entrada.
 *
 * Um estado vazio tem três trabalhos, e a maioria dos dez só fazia o primeiro:
 *   1. dizer que está vazio,
 *   2. dizer POR QUE (filtro demais? ainda não começou? deu erro?),
 *   3. oferecer a saída.
 * Por isso `texto` e `acao` existem: uma tela que só diz "Nenhum resultado"
 * deixa a pessoa presa — e "nunca prender" é a regra de orientação.
 */
export function Momento({
  icone, titulo, texto, acao, tom = "vazio", compacto,
}: {
  icone: string;
  titulo: string;
  /** Por que está assim, e o que fazer. Sem isto a pessoa fica sem saída. */
  texto?: string;
  acao?: ReactNode;
  /** "vazio" (neutro) · "sucesso" · "erro". Só muda a cor do ícone e do halo. */
  tom?: "vazio" | "sucesso" | "erro";
  /** Dentro de um card pequeno: menos respiro, sem halo. */
  compacto?: boolean;
}) {
  const cor = tom === "sucesso" ? "var(--ok)" : tom === "erro" ? "var(--perigo)" : "var(--primary-texto)";

  return (
    <div className="ui-momento" data-compacto={compacto ? "1" : undefined}>
      <span className="ui-momento-halo" aria-hidden style={{ ["--halo" as string]: cor }} />
      <span className="ui-momento-ico" style={{ ["--halo" as string]: cor }}>
        <Icon name={icone} size={compacto ? 20 : 26} color={cor} />
      </span>
      <strong className="ui-momento-tit">{titulo}</strong>
      {texto && <p className="ui-momento-txt">{texto}</p>}
      {acao && <div className="ui-momento-acao">{acao}</div>}
    </div>
  );
}
