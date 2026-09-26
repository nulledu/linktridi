import Link from "next/link";
import { Icon } from "../../../Icon";

// Estado honesto: as colunas de página ainda não existem no banco. Em vez de
// abrir um editor que não salva, explica o que falta e mostra o arquivo exato.
export function MigracaoPendente() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "70dvh", padding: 24 }}>
      <div style={{
        maxWidth: 460, textAlign: "center", display: "grid", gap: 12, justifyItems: "center",
        border: "1px solid var(--border)", borderRadius: 18, padding: 28, background: "var(--surface)",
      }}>
        <Icon name="database" size={26} color="var(--text-dim)" />
        <strong style={{ fontSize: 17, color: "var(--text)" }}>Falta preparar o banco</strong>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.55, margin: 0 }}>
          As páginas precisam de duas colunas novas e uma tabela de eventos. Rode este arquivo
          no Supabase do TridiFlow e recarregue:
        </p>
        <code style={{
          fontSize: 12.5, background: "var(--surface-2)", border: "1px solid var(--border)",
          padding: "8px 12px", borderRadius: 9, color: "var(--text)",
        }}>supabase/tridiflow-paginas.sql</code>
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
          É aditivo e pode rodar mais de uma vez. Os fluxos conversadores continuam funcionando normalmente.
        </p>
        <Link href="/tridiflow/meus-bots" style={{
          marginTop: 4, textDecoration: "none", fontSize: 13, fontWeight: 700,
          color: "var(--tf-accent, var(--primary-texto))",
        }}>Voltar aos projetos</Link>
      </div>
    </div>
  );
}
