import { notFound } from "next/navigation";
import { fonteLoja } from "@/lib/lojas-fonte";
import { lerTema } from "@/lib/vitrine/db";
import { MODELOS } from "@/lib/vitrine/modelos";
import { AvisoDemo } from "../../AvisoDemo";
import { TemasClient } from "./TemasClient";

export const dynamic = "force-dynamic";

// Temas: qual está no ar, o que há de rascunho e a biblioteca pra trocar.
//
// A tela NÃO é o editor — o editor é `/aparencia`. Aqui se escolhe o tema e se
// vê o estado dele; lá se mexe. Misturar os dois faria a lista de modelos
// aparecer toda vez que alguém quisesse trocar uma cor.
export default async function TemasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja, demo } = await fonteLoja(id);
  if (!loja) notFound();

  const guardado = await lerTema(id).catch(() => ({ publicado: null, rascunho: null, persistido: false }));
  const atual = guardado.publicado?.modelo ?? MODELOS[0].id;

  return (
    <>
      {demo && <AvisoDemo />}
      <TemasClient
        id={id}
        atual={atual}
        temRascunho={!!guardado.rascunho}
        persistido={guardado.persistido}
        modelos={MODELOS.map((m) => ({ id: m.id, nome: m.nome, descricao: m.descricao }))}
      />
    </>
  );
}
