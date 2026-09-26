// Código de acesso do operador ao leitor de estoque (login OFFLINE no
// aparelho do galpão — ver app/api/estoque/device/_sessao.ts e
// supabase/estoque_dispositivos.sql). É digitado num teclado numérico da
// tela do leitor, com luva, sob pressa: por isso curto e só dígitos — letra
// ou código longo é armadilha de usabilidade, não segurança a mais (quem
// segura a segurança é o verificador HMAC, nunca o tamanho do PIN).
//
// `null`/vazio (depois de aparado) É um resultado válido: é como se limpa o
// código de quem saiu da empresa. `undefined` não é tratado aqui — quem
// chama só invoca esta função quando o campo de fato veio no corpo do PATCH
// (campo ausente = não mexe no que já está salvo).
const FORMATO = /^\d{4,8}$/;

export function normalizarCodigoAcesso(input: string | null): { valor: string | null } | null {
  if (input === null) return { valor: null };
  const aparado = input.trim();
  if (aparado === "") return { valor: null };
  return FORMATO.test(aparado) ? { valor: aparado } : null;
}
