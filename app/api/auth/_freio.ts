import { criarFreio, origemDe } from "@/lib/rate-limit";

// ── Freio do login ───────────────────────────────────────────────────────────
// /api/auth/login era a rota mais atacável do sistema e a única sem freio
// nenhum: tentativa ilimitada de senha, e — pior — enumeração de username
// combinada com o 1º acesso, que cadastrava a senha de quem chegasse primeiro.
//
// SÓ FALHA CONTA. Login certo nunca debita o balde: o escritório inteiro sai
// pelo mesmo IP (NAT) e um dia cheio de gente entrando não pode virar bloqueio.
// Quem erra sem parar é ataque; quem acerta é trabalho.

// Balde por IP: folgado, porque o escritório compartilha um IP só. Ainda assim
// mata a varredura em massa vinda de uma origem.
export const freioLoginIp = criarFreio({ limite: 40, janelaMs: 15 * 60_000 });

// Balde por IDENTIFICADOR (username/e-mail tentado): apertado. Ataque dirigido a
// uma pessoa vem de muitos IPs, então o teto que importa é o da conta-alvo.
// Não trava o dono legítimo: quem sabe a senha acerta e não debita nada.
export const freioLoginConta = criarFreio({ limite: 10, janelaMs: 15 * 60_000 });

export { origemDe };

/** Chave da conta: o identificador digitado, normalizado. */
export function chaveDaConta(identificador: string): string {
  return "conta:" + identificador.trim().toLowerCase();
}

/**
 * Fecha a porta? SÓ o balde de IP fecha. Consulta sem contar.
 *
 * O balde de CONTA de propósito NÃO fecha a porta: ele é chaveado pelo nome
 * DIGITADO, então qualquer um erra dez vezes o usuário de um colega e o colega
 * — sabendo a senha, no escritório — levava 429 por 15 minutos. Isso é negar
 * serviço a quem trabalha, com o atacante nem precisando acertar nada.
 *
 * O balde de conta serve para outra coisa: `contaSobAtaque` marca a conta como
 * quente, e quem sabe a senha continua entrando (a senha certa é a prova que o
 * freio não consegue dar). Ver o uso em login/route.ts.
 */
export function loginBloqueado(ip: string, _identificador: string): boolean {
  return freioLoginIp.excedido(ip);
}

/** A conta levou muita tentativa errada na janela — serve para alerta/registro. */
export function contaSobAtaque(identificador: string): boolean {
  return freioLoginConta.excedido(chaveDaConta(identificador));
}

/** Debita os dois baldes. Chamado em CADA tentativa que não autenticou. */
export function registrarFalhaDeLogin(ip: string, identificador: string): void {
  freioLoginIp.consumir(ip);
  freioLoginConta.consumir(chaveDaConta(identificador));
}

/**
 * 429 do login. Mensagem propositalmente igual para IP e conta e sem dizer se o
 * usuário existe — contar isso entregaria de graça a enumeração que o freio
 * existe pra impedir.
 */
export function resposta429Login() {
  return Response.json(
    { error: "muitas_tentativas", detail: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
    { status: 429, headers: { "Retry-After": "900" } },
  );
}
