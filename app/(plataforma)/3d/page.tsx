import { requireModule } from "@/lib/require-auth";
import { colaboradoresDeTodosOsSetores } from "@/lib/atividades";
import { Area3DTabs } from "./Area3DTabs";

export const dynamic = "force-dynamic";

// 3D — a central da operação das impressoras. A área abre pela chave `3d` da
// grade (lib/areas.ts); admin entra pelo papel. As pessoas vêm daqui (server)
// pro select de responsável — a rota /api/colaboradores exige outra área.
export default async function Pagina3D() {
  await requireModule("3d");
  const pessoas = (await colaboradoresDeTodosOsSetores().catch(() => []))
    .map((c) => ({ id: c.id, nome: c.nome }));
  return <Area3DTabs pessoas={pessoas} />;
}
