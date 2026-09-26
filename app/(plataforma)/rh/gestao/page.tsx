import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A Gestão de equipe (cadastro das contas + grade de permissões) MUDOU DE
// CASA em 22/09/2026: agora é TI › Permissões (/ti/permissoes) — quem entra
// no sistema é assunto de TI, não do RH. O endereço velho continua
// respondendo porque ele mora em link de tarefa, em resultado de busca e na
// memória de quem usa o sistema há meses.
export default async function GestaoRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v != null) q.set(k, v);
  const suf = q.size ? `?${q.toString()}` : "";
  redirect(`/ti/permissoes${suf}`);
}
