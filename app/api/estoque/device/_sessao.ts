import { createHmac } from "crypto";

// ── Login OFFLINE do operador no leitor ──────────────────────────────────────
// Mesma técnica do TridiMarket (app/api/tridimarket/device/_sessao.ts):
// `verificadorDeCodigo`. O leitor precisa reconhecer o código de QUALQUER
// operador sem rede — pra isso ele recebe no bootstrap um diretório com um
// VERIFICADOR por pessoa, nunca o código em si.
//
// O sal é o MESMO para todo o diretório de UM dispositivo (e diferente entre
// dispositivos): com um sal por pessoa o leitor teria que testar o código
// digitado contra cada operador da lista; com sal único ele calcula UM hash e
// faz busca direta.
//
// Namespace próprio ("estoque-offline-…"), não o do TridiMarket: mesmo usando
// o mesmo segredo (SUPABASE_SERVICE_ROLE_KEY), os dois domínios não podem
// produzir o mesmo verificador para o mesmo texto — senão vazar o diretório de
// um teria alguma chance de informar o do outro.
const SEGREDO = () => {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return s;
};

export function saltDoDispositivo(deviceId: string): string {
  return createHmac("sha256", SEGREDO()).update(`estoque-offline-salt|${deviceId}`).digest("base64url");
}

export function verificadorDeCodigo(codigo: string, salt: string): string {
  return createHmac("sha256", salt).update(`estoque-codigo|${codigo}`).digest("base64url");
}
