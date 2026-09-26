// TEMPORÁRIO — banco de provas do layout do chat, sem login e sem banco.
// Serve para medir estouro de largura a 320/390/430px e conferir os dois temas.
import { notFound } from "next/navigation";
import { ProvaChat } from "./ProvaChat";
import { Shell } from "../(plataforma)/Shell";
import { MODULES, navFor } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default function DevChat() {
  // Trava 2 de 2: o middleware só torna a rota PÚBLICA fora de produção; quem
  // faz a página sumir em produção é esta linha.
  if (process.env.NODE_ENV === "production") notFound();
  // Shell REAL em volta: é ele que tem o rail, e o rail só se prova com a
  // sidebar do sistema montada de verdade.
  return (
    <Shell nav={navFor("admin")} modules={MODULES} name="Teste" role="admin" photoUrl={null}>
      <ProvaChat />
    </Shell>
  );
}
