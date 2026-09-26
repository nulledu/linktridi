import { redirect } from "next/navigation";

// Raiz → manda pro fluxo da plataforma (o middleware leva a /login se sem sessão,
// e /inicio redireciona pra home do papel).
export default function Home() {
  redirect("/inicio");
}
