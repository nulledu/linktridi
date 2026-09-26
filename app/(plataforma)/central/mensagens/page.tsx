import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A tela mudou de endereço para `/mensagens` (tela cheia, fora das abas da
// Central). Este redirecionamento mantém de pé o que já aponta para cá: as
// notificações antigas (`/central/mensagens?c=<id>`), os links copiados de
// mensagem e qualquer aba que alguém tenha deixado aberta — por isso a query
// vai junto, senão o link levaria à caixa em vez da conversa.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") query.set(k, v);
    else if (Array.isArray(v) && v[0]) query.set(k, v[0]);
  }
  const qs = query.toString();
  redirect(qs ? `/mensagens?${qs}` : "/mensagens");
}
