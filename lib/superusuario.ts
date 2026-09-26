// Superusuário — quem manda no sistema inteiro.
//
// Não é papel nem permissão: é uma lista fechada, no código, de quem atravessa
// TODOS os gates — áreas restritas, checagens de `role === "admin"` e ações que
// exigem "só admin". Existe por um motivo prático: alguém precisa continuar
// entrando quando a grade de permissões for salva errada, inclusive na própria
// tela que configura a grade. Sem isso, um clique infeliz tranca todo mundo
// para fora e a saída é mexer no banco na mão.
//
// De propósito NÃO é editável pela interface. Quem consegue se promover a
// superusuário por uma tela deixou de ser um limite — vira só mais um botão.
// Mudar esta lista é um commit, revisável no histórico.

// Caio Martins — dono do sistema.
// (profiles.id · username "caio" · caiomartins@tridixp.com.br)
const SUPERUSUARIOS_FIXOS = ["862eb118-084d-48cc-a12b-287f87946689"];
const USERNAMES_FIXOS = ["caio"];

// A env SOMA à lista fixa, nunca substitui: uma variável vazia, com espaço
// sobrando ou apontando para o ambiente errado não pode trancar o dono do
// sistema para fora. Aceita ids (uuid) e usernames, separados por vírgula.
function extras(): string[] {
  return (process.env.SUPERUSUARIOS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function ehSuperusuario(id?: string | null, username?: string | null): boolean {
  const alvo = [id, username].filter(Boolean).map((v) => String(v).toLowerCase());
  if (!alvo.length) return false;
  const lista = new Set([...SUPERUSUARIOS_FIXOS, ...USERNAMES_FIXOS, ...extras()].map((v) => v.toLowerCase()));
  return alvo.some((v) => lista.has(v));
}
