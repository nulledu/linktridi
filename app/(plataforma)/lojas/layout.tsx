import { requireModule } from "@/lib/require-auth";
import { fonteLojas } from "@/lib/lojas-fonte";
import { acessoBruto } from "@/lib/perfis";
import { LojasShell } from "./LojasShell";

export const dynamic = "force-dynamic";

// O gate mora AQUI, e não em cada página: um layout de rota cobre toda a
// árvore `/lojas/**` de uma vez. Página nova nasce protegida sem ninguém
// lembrar de escrever a linha — que é exatamente como uma tela acaba aberta
// pra quem não deveria.
export default async function LojasLayout({ children }: { children: React.ReactNode }) {
  // A barra lateral precisa saber QUAIS lojas existem — é o que decide se ela
  // mostra a navegação do criador ou a daquela loja. Antes ela procurava a loja
  // atual na lista de EXEMPLO: com loja de verdade não achava nada, caía no
  // menu do criador, e Análises, Temas e Loja Online ficavam inalcançáveis
  // dentro da própria loja. A lista vem do servidor, uma vez, pro módulo todo.
  //
  // Disparada ANTES do gate (padrão de /colaboradores): a lista não depende de
  // quem é a pessoa, então viaja junto com a sessão em vez de depois dela —
  // eram três idas em fila (gate → lojas → foto) em toda navegação de /lojas.
  const lojasP = fonteLojas();
  lojasP.catch(() => {});   // sem rejeição órfã se o gate redirecionar antes
  const profile = await requireModule("lojas");

  // A foto sai da MESMA linha de `employees` que decide o acesso: o gate acima
  // já pediu o `acessoBruto`, então aqui é cache-hit, não ida nova ao banco.
  // A chave `photo:` de antes só era cache-hit enquanto o layout raiz a
  // preenchia — quando ele passou a ler a ficha inteira, esta virou uma ida
  // solta em toda navegação de /lojas, e com 5 min que o salvar da ficha não
  // derrubava. Em paralelo com a lista de lojas: nenhuma depende da outra.
  const [{ dados: lojas }, ficha] = await Promise.all([
    lojasP,
    acessoBruto(profile.id).catch(() => null),   // sem foto: cai na letra do nome
  ]);
  const photoUrl = ficha?.photo_url ?? null;

  return (
    <LojasShell
      name={profile.name}
      role={profile.role}
      photoUrl={photoUrl}
      lojas={lojas.map((l) => ({ id: l.id, nome: l.nome, slug: l.slug, status: l.status, dominio: l.dominio }))}
    >
      {children}
    </LojasShell>
  );
}
