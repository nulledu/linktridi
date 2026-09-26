import { Alerta } from "../ui/Alerta";

/**
 * O módulo está mostrando EXEMPLO, não o banco.
 *
 * Uma tela que mostra dado de exemplo sem dizer é pior que uma tela vazia: a
 * pessoa cadastra um produto, o aviso de "salvo" aparece, e ela só descobre na
 * semana seguinte que nada foi gravado. O aviso diz o que falta e onde.
 */
// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
export function AvisoDemo() {
  return (
    <Alerta tom="atencao" role="status" titulo="Isto é um exemplo — ainda não grava." style={{ marginBottom: 14 }}>
      Rode o arquivo{" "}
      <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 6 }}>supabase/lojas.sql</code>{" "}
      no SQL Editor do Supabase e recarregue. Depois disso as telas passam a
      gravar de verdade, sem mais nenhuma mudança.
    </Alerta>
  );
}
