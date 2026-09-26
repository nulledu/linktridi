import { notFound } from "next/navigation";
import { ProvaTutoriaisAdmin } from "./ProvaTutoriaisAdmin";

// Banco de provas das TELAS ADMINISTRATIVAS da Central de Tutoriais (lista e
// editor) sem login. As duas travas de toda página /dev-*: o prefixo em
// DEV_ONLY_PREFIXES no middleware (a torna pública FORA de produção) e o
// notFound() abaixo (a faz sumir EM produção).
export default function DevTutoriaisAdminPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaTutoriaisAdmin />;
}
