import Link from "next/link";
import { AREA_BY_KEY, AREAS } from "@/lib/areas";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { Icon } from "../Icon";

export const dynamic = "force-dynamic";

// Tela de acesso negado.
//
// Antes, quem abria uma área sem permissão era jogado para a Central sem uma
// palavra. Do lado de quem clicou isso é indistinguível de um bug: o link não
// fez nada. Agora a pessoa lê o que aconteceu, vê QUAL área foi barrada e sabe
// o que fazer — pedir para quem administra.
//
// Não é um gate: qualquer pessoa logada pode abrir esta página. Ela não mostra
// nada além do nome da área que a própria pessoa tentou acessar.
export default async function SemPermissaoPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const { area } = await searchParams;
  // Nome bonito da área quando a chave é conhecida ("administracao:paineis" cai
  // no rótulo de Configurações). Chave desconhecida não vira texto na tela.
  const chave = (area ?? "").split(":")[0];
  const nome = AREA_BY_KEY[chave]?.label ?? null;

  // O que o SISTEMA resolveu pra esta pessoa, agora. Sem isto, "configurei e
  // continua barrado" não tinha como ser conferido sem abrir o banco: o admin
  // olhava a grade (o que foi gravado) e ninguém via o que o gate leu.
  const me = await getProfile();
  const minhas = me
    ? await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username })
    : [];
  const liberadas = AREAS.filter((a) => minhas.includes(a.key)).map((a) => a.label);

  return (
    <div style={{ maxWidth: 620, margin: "6dvh auto 0" }}>
      <div className="glass glass-spec" style={{ padding: 40, borderRadius: 22, textAlign: "center" }}>
        <div
          style={{
            width: 72, height: 72, margin: "0 auto", borderRadius: 20, display: "grid", placeItems: "center",
            background: "color-mix(in srgb, var(--primary) 12%, transparent)",
          }}
        >
          <Icon name="lock" size={34} color="var(--primary-texto)" />
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 20 }}>
          Ops, parece que você não tem permissão para acessar isso
        </h1>

        <p style={{ color: "var(--text-dim)", fontSize: 15.5, marginTop: 10, lineHeight: 1.55 }}>
          {nome
            ? <>A área <strong style={{ color: "var(--text)" }}>{nome}</strong> não está liberada para o seu acesso.</>
            : <>Esta área não está liberada para o seu acesso.</>}
          {" "}Se você precisa dela para trabalhar, peça a liberação para quem administra o sistema.
        </p>

        {/* Diagnóstico: o que ESTE login tem liberado neste momento. */}
        <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 14, background: "var(--surface-2, rgba(0,0,0,.04))", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
          {liberadas.length
            ? <>Hoje o seu acesso inclui: <strong style={{ color: "var(--text)" }}>{liberadas.join(" · ")}</strong>.</>
            : <>Hoje o seu acesso tem só a Central e as suas atividades.</>}
          {area ? <><br />Chave pedida: <code style={{ fontSize: 12 }}>{area}</code></> : null}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
          <Link
            href="/central"
            style={{
              fontSize: 14.5, fontWeight: 700, padding: "12px 24px", borderRadius: 12,
              background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", textDecoration: "none",
            }}
          >
            Voltar para a Central
          </Link>
        </div>
      </div>
    </div>
  );
}
