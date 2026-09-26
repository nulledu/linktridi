import { fonteLojas } from "@/lib/lojas-fonte";
import { MODELOS } from "@/lib/vitrine/modelos";
import { ModelosClient } from "./ModelosClient";

export const dynamic = "force-dynamic";

// Modelos são TEMAS PRONTOS. Aplicar um em cima de uma loja troca a cara dela
// inteira — por isso a escolha da loja é explícita e a aplicação entra como
// RASCUNHO, não no ar: quem aplica ainda passa pelo editor e pelo "publicar".
export default async function ModelosPage() {
  const { dados: lojas } = await fonteLojas();
  return (
    <ModelosClient
      lojas={lojas.map((l) => ({ id: l.id, nome: l.nome }))}
      modelos={MODELOS.map((m) => ({ id: m.id, nome: m.nome, descricao: m.descricao }))}
    />
  );
}
