import { redirect } from "next/navigation";

// A lista das centrais é a aba Páginas do Marketing · Geral; aqui moram só os
// editores (/marketing/tutoriais/<id>).
export default function TutoriaisPage() {
  redirect("/marketing?aba=paginas&ver=tutoriais");
}
