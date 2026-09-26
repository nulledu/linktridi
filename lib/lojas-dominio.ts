// ── O estado de um domínio, e o que ainda falta ──────────────────────────────
//
// Ligar um domínio próprio tem QUATRO etapas, em três sistemas diferentes:
//
//   1. cadastrar o endereço aqui
//   2. apontar o DNS no provedor do domínio (Registro.br, Hostinger…)
//   3. adicionar o domínio no projeto da Vercel
//   4. ligar o endereço a uma loja PUBLICADA
//
// A verificação já sabia dizer em qual delas parou (`verificarDominio`), mas o
// painel só contava depois que a pessoa clicava em "Verificar" — e a etapa 3, a
// única que não acontece dentro do produto, não aparecia em lugar nenhum antes
// de falhar. Quem não sabia da Vercel apontava o DNS, esperava, e concluía que
// o sistema estava quebrado.
//
// Aqui a lista de pendências é DERIVADA do estado, sem clique nenhum. Puro e
// testável de propósito: é a explicação que a pessoa lê pra resolver, e ela não
// pode divergir do que a verificação de fato checa.

import { dnsPara, type LinhaDns } from "./dominio-dns";

export type EstadoDominio = "sem_dns" | "dns_errado" | "falta_vercel" | "ativo";

/** Cor por token semântico: hexadecimal reprovaria em contraste no tema claro. */
export const SITUACAO: Record<EstadoDominio, { txt: string; cor: string; icone: string }> = {
  ativo: { txt: "Conectado", cor: "var(--ok)", icone: "circle-check" },
  sem_dns: { txt: "Aguardando DNS", cor: "var(--atencao)", icone: "hourglass-high" },
  dns_errado: { txt: "DNS apontando errado", cor: "var(--perigo)", icone: "alert-triangle" },
  falta_vercel: { txt: "Falta liberar na hospedagem", cor: "var(--perigo)", icone: "alert-triangle" },
};

export interface Pendencia {
  chave: "dns" | "vercel" | "loja" | "publicar";
  titulo: string;
  detalhe: string;
  /** Linhas de DNS pra copiar. Só a pendência de DNS traz. */
  dns?: LinhaDns[];
  /** Endereço externo que resolve a pendência (o painel da Vercel). */
  href?: string;
  /** Rota interna que resolve a pendência. */
  rota?: string;
}

export interface SituacaoDominio {
  host: string;
  estado: EstadoDominio;
  /** Última mensagem da verificação, quando houve uma. */
  detalhe: string;
  /** A loja ligada — `null` quando o endereço não abre nada. */
  loja: { id: string; nome: string; publicada: boolean } | null;
  pendencias: Pendencia[];
  /** Nada pendente: o endereço abre a loja pra quem digitar. */
  pronto: boolean;
}

const VERCEL_DOMINIOS = "https://vercel.com/dashboard";

/**
 * As pendências, na ordem em que precisam ser resolvidas.
 *
 * A ordem importa: apontar o DNS antes de existir o domínio na Vercel funciona
 * (a Vercel emite o certificado quando o registro chega), mas o contrário
 * também — então a lista mostra as duas ao mesmo tempo em vez de esconder a
 * segunda atrás da primeira. Esconder foi o que fez a etapa da Vercel virar
 * surpresa.
 */
export function situacaoDoDominio(entrada: {
  host: string;
  estado: EstadoDominio;
  detalhe?: string;
  loja: { id: string; nome: string; publicada: boolean } | null;
}): SituacaoDominio {
  const { host, estado, loja } = entrada;
  const pendencias: Pendencia[] = [];

  if (estado === "sem_dns" || estado === "dns_errado") {
    pendencias.push({
      chave: "dns",
      titulo: "Aponte o DNS no seu provedor",
      detalhe: estado === "dns_errado"
        ? "Existe um registro para esse endereço, mas ele aponta para outro servidor. Troque o valor pelo de baixo."
        : "No painel de quem cuida do seu domínio, abra DNS / Zona de DNS e crie este registro.",
      dns: dnsPara(host),
    });
  }

  if (estado === "sem_dns" || estado === "dns_errado" || estado === "falta_vercel") {
    pendencias.push({
      chave: "vercel",
      titulo: "Adicione o domínio na hospedagem",
      detalhe: `No projeto da Vercel, em Settings › Domains, adicione ${host}. Sem isso o endereço chega até a hospedagem e ela não sabe o que responder — é a etapa que não acontece dentro deste painel.`,
      href: VERCEL_DOMINIOS,
    });
  }

  if (!loja) {
    pendencias.push({
      chave: "loja",
      titulo: "Escolha qual loja esse endereço abre",
      detalhe: "Um endereço serve uma loja por vez. Enquanto nenhuma estiver escolhida, quem digitar esse endereço não chega a lugar nenhum.",
    });
  } else if (!loja.publicada) {
    pendencias.push({
      chave: "publicar",
      titulo: `Publique a loja ${loja.nome}`,
      detalhe: "A loja está em rascunho. Mesmo com o DNS certo, uma loja em rascunho responde 404 para quem não é do time.",
      rota: `/lojas/${loja.id}/configuracoes`,
    });
  }

  return {
    host,
    estado,
    detalhe: entrada.detalhe ?? "",
    loja,
    pendencias,
    pronto: pendencias.length === 0,
  };
}

/** Uma linha de resumo pra tela dizer o estado sem a pessoa abrir o cartão. */
export function resumoDaSituacao(s: SituacaoDominio): string {
  if (s.pronto) return `Abre ${s.loja?.nome ?? "a loja"} em https://${s.host}`;
  const [p] = s.pendencias;
  return `Falta: ${p.titulo.toLowerCase()}`;
}
