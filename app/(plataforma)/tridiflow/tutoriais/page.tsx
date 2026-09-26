import { redirect } from "next/navigation";

// A lista da Central de Tutoriais é a aba Páginas do Marketing · Geral.
export default function TutoriaisAntigo() {
  redirect("/marketing?aba=paginas&ver=tutoriais");
}
