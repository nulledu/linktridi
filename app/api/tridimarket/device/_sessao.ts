import { createHmac, timingSafeEqual } from "crypto";

// ── Sessão do funcionário no totem — SEM TABELA ─────────────────────────────
// Tentei guardar em `sessoes_totem` (a tabela do legado) e ela é incompatível:
// empresa_id/usuario_perfil_id são uuid de um desenho antigo, e empresa_id é
// NOT NULL — por isso ela sempre esteve vazia. Em vez de criar mais uma tabela
// (e mais uma migração), a sessão virou um TOKEN ASSINADO: ele carrega
// dispositivo + funcionário + validade, e o servidor só confere a assinatura.
//
// Vantagens: nada pra migrar, nada pra limpar, e funciona igual no offline
// (o token vale 48h por si só). O controle de acesso forte continua sendo o
// token do DISPOSITIVO, que é revogável no painel.
// Segredo da assinatura: a chave de service role do banco principal. Era a
// chave do Supabase separado do mercadinho, que foi desligado junto com o ERP
// antigo — sem trocar, o login do tablet quebraria com "variável ausente".
//
// Efeito colateral aceito: trocar o segredo INVALIDA sessões e concessões
// offline emitidas antes. Como o sistema está sendo recomeçado do zero (tablets
// reativados, pessoas recadastradas), não há sessão legítima a preservar.
const SEGREDO = () => {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return s;
};

function assinar(payload: string): string {
  return createHmac("sha256", SEGREDO()).update(payload).digest("base64url");
}

// ── Login OFFLINE ───────────────────────────────────────────────────────────
// O tablet precisa reconhecer o código de QUALQUER funcionário sem rede. Para
// isso ele recebe no bootstrap um diretório com um VERIFICADOR por pessoa —
// nunca o código em si.
//
// O sal é o MESMO para todo o diretório de um dispositivo (e diferente entre
// dispositivos). Isso é proposital: com um sal por pessoa o tablet teria de
// testar o código contra os 49 cadastros, um por um; com sal único ele calcula
// UM hash e faz uma busca direta.
//
// Limite honesto: código de 6 dígitos tem ~20 bits. Quem extrair o banco do
// tablet consegue enumerar o espaço inteiro, com qualquer função de derivação.
// A proteção real não é o hash — é que o token do DISPOSITIVO é revogável pelo
// painel, toda compra fica atribuída e auditável, e o código só compra na
// carteira do próprio dono. O hash impede leitura casual dos códigos, não um
// ataque dedicado com o aparelho em mãos.
export function saltDoDispositivo(deviceId: string): string {
  return createHmac("sha256", SEGREDO()).update(`market-offline-salt|${deviceId}`).digest("base64url");
}

export function verificadorDeCodigo(codigo: string, salt: string): string {
  return createHmac("sha256", salt).update(`market-codigo|${codigo}`).digest("base64url");
}

// Concessão OFFLINE: autoriza o tablet a enviar compras que ele mesmo
// autenticou localmente. Vale para o dispositivo (não para uma pessoa) e é
// renovada a cada bootstrap. Sem ela, uma compra offline de alguém que nunca
// tinha logado neste tablet seria recusada e a venda se perderia.
export function criarConcessaoOffline(deviceId: string, validoAte: string): string {
  const payload = `offline|${deviceId}|${validoAte}`;
  return `${Buffer.from(payload).toString("base64url")}.${assinar(payload)}`;
}

export function validarConcessaoOffline(token: string | null, deviceId: string, momento: number): boolean {
  if (!token) return false;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;
  let payload: string;
  try { payload = Buffer.from(b64, "base64url").toString("utf8"); } catch { return false; }
  const esperado = Buffer.from(assinar(payload));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return false;
  const [marca, d, validoAte] = payload.split("|");
  return marca === "offline" && d === deviceId && !!validoAte && new Date(validoAte).getTime() > momento;
}

export function criarTokenSessao(deviceId: string, employeeId: number, expiresAt: string): string {
  const payload = `${deviceId}|${employeeId}|${expiresAt}`;
  return `${Buffer.from(payload).toString("base64url")}.${assinar(payload)}`;
}

// `momento` = instante que precisa estar dentro da validade. Para uma ação ao
// vivo é agora; para uma compra que ficou na fila do tablet é a HORA DA COMPRA.
// Sem isso, tablet offline por mais de 48h tinha suas compras recusadas para
// sempre no sync — a pessoa estava autenticada quando comprou, e a venda sumia.
// A assinatura e o vínculo dispositivo+funcionário continuam obrigatórios.
export function validarTokenSessao(token: string | null, deviceId: string, employeeId: number, momento: number = Date.now()): boolean {
  if (!token) return false;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;
  let payload: string;
  try { payload = Buffer.from(b64, "base64url").toString("utf8"); } catch { return false; }

  // Comparação em tempo constante (evita descobrir a assinatura por timing).
  const esperado = Buffer.from(assinar(payload));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return false;

  const [d, e, exp] = payload.split("|");
  return d === deviceId && Number(e) === employeeId && !!exp && new Date(exp).getTime() > momento;
}
