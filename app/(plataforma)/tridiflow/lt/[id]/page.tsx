import { redirect } from "next/navigation";

// O editor do LinkTridi mora no Marketing · Geral desde set/2026. Este endereço
// só existe pra não quebrar link salvo.
export default async function LinkTridiAntigo({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/marketing/linktridi/${encodeURIComponent((await params).id)}`);
}
