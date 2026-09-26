import { notFound } from "next/navigation";
import { fonteLoja, fonteProdutos } from "@/lib/lojas-fonte";
import { lerTema } from "@/lib/vitrine/db";
import { TEMA_PADRAO } from "@/lib/vitrine/modelos";
import { AvisoDemo } from "../../AvisoDemo";
import { EditorClient } from "./EditorClient";

export const dynamic = "force-dynamic";

/**
 * O editor de aparência — o "Personalizar" da loja.
 *
 * Tudo chega pronto do servidor: loja, catálogo e os dois temas. É o que
 * permite a prévia desenhar no primeiro quadro, sem uma tela em branco
 * enquanto busca. Um editor que abre vazio e preenche depois faz a pessoa achar
 * que perdeu o trabalho.
 */
export default async function AparenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja } = await fonteLoja(id);
  if (!loja) notFound();

  const [{ dados: produtos, demo }, guardado] = await Promise.all([
    fonteProdutos(id),
    // Sem o SQL do tema rodado isto volta `persistido: false`, e o editor abre
    // funcionando com o aviso de que não grava — a mesma tolerância do resto
    // do módulo.
    lerTema(id).catch(() => ({ publicado: null, rascunho: null, persistido: false })),
  ]);

  return (
    <>
      {demo && <AvisoDemo />}
      <EditorClient
        loja={loja}
        produtos={produtos}
        publicado={guardado.publicado ?? TEMA_PADRAO()}
        rascunho={guardado.rascunho}
        persistido={guardado.persistido}
      />
    </>
  );
}
