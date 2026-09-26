import Link from "next/link";

/** Faixa fixa que lembra: isto é o RASCUNHO, com tutoriais ainda não
 *  publicados aparecendo. Sem ela, a prévia é indistinguível do ar. */
export function BarraPrevia({ voltarHref }: { voltarHref: string }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 10,
      justifyContent: "center", flexWrap: "wrap", padding: "9px 14px",
      background: "#111114", color: "#fff", fontSize: 12.5, fontWeight: 600,
      paddingTop: "calc(9px + var(--safe-t, 0px))",
    }}>
      <span>Prévia do rascunho — os tutoriais não publicados também aparecem aqui.</span>
      {/* Única saída da prévia: o texto de 12,5px dava ~15px de toque. Os 44px
          vêm com margem negativa, que devolve o que o min-height acrescenta —
          o dedo ganha a área e a faixa não engorda. */}
      <Link href={voltarHref} style={{
        color: "#fff", fontWeight: 800, textDecoration: "underline",
        display: "inline-flex", alignItems: "center", minHeight: "var(--tap, 44px)",
        padding: "0 10px", marginBlock: -13,
      }}>Voltar ao editor</Link>
    </div>
  );
}
