import { redirect } from "next/navigation";

// O editor da Central de Tutoriais mora no Marketing · Geral desde set/2026.
// Este endereço só existe pra não quebrar link salvo.
export default async function CentralAntiga({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/marketing/tutoriais/${encodeURIComponent((await params).id)}`);
}
