import { redirect } from "next/navigation";

// /vendas era a MESMA tela da aba "Setores" do Analytics, montada por fora.
// Duas diferenças a tornavam um problema, não só uma duplicata:
//
// 1. Ela não passava `views` para o VendasClient, então `restrito` ficava
//    `false` e TODA aba de setor aparecia — inclusive as que a grade não
//    liberou para aquela pessoa.
// 2. O gate era `requireRole(["admin","gerente_vendas"])`, por fora da grade
//    de áreas que o Analytics respeita.
//
// Quem tem acesso legítimo a um setor não perde nada: em `chavesDasAreas`
// (lib/areas.ts) qualquer sub concedida adiciona a área junto, então quem tem
// `set:comercial` tem `analytics` por construção.
export default function VendasPage() {
  redirect("/analytics?aba=vendas");
}
