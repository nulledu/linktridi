// Oficina — o DEVKIT à vista, só pro superusuário.
//
// O manual (docs/DEVKIT.md) e a vitrine (/dev-micro) existiam só pra quem
// abre o repositório ou roda o app local: o /dev-micro some em produção. Esta
// página mostra os dois NO sistema, atrás da sessão, pra quem manda nele.
//
// O endereço não está em menu, paleta ⌘K nem sitemap, e quem não é
// superusuário recebe 404 (não 403): pra todo o resto do mundo, a página não
// existe. O slug estranho é só a segunda camada — quem guarda é o gate.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProfile } from "@/lib/require-auth";
import { ehSuperusuario } from "@/lib/superusuario";
import { Abas } from "../ui/Abas";
import { PageHead } from "../ui/mobile";
import { Markdown, slug } from "./markdown";
import { Vitrine } from "./Vitrine";
import "./oficina.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Oficina", robots: { index: false, follow: false } };

const BASE = "/oficina-7k3q";

export default async function Oficina({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const me = await getProfile();
  if (!me || !ehSuperusuario(me.id, me.username)) notFound();

  const { v } = await searchParams;
  const aba = v === "vitrine" ? "vitrine" : "manual";

  const abas = (
    <Abas
      ariaLabel="Oficina"
      valor={aba}
      itens={[
        { valor: "manual", rotulo: "Manual", href: BASE },
        { valor: "vitrine", rotulo: "Vitrine", href: `${BASE}?v=vitrine` },
      ]}
    />
  );

  if (aba === "vitrine") {
    return (
      <div className="kit">
        <PageHead title="Oficina" sub="As peças do kit montadas, nos dois temas." />
        {abas}
        <Vitrine />
      </div>
    );
  }

  const fonte = await readFile(path.join(process.cwd(), "docs/DEVKIT.md"), "utf8").catch(() => "");
  const secoes = fonte.split("\n").filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim());

  return (
    <div className="kit">
      <PageHead title="Oficina" sub="O manual do kit de interface — o que existe, pra que serve e de onde veio." />
      {abas}
      {fonte ? (
        <div className="kit-corpo">
          <nav className="kit-indice" aria-label="Seções do manual">
            {secoes.map((s) => (
              <a key={s} href={`#${slug(s)}`}>{s.replace(/[`*]/g, "")}</a>
            ))}
          </nav>
          <article className="kit-md">
            <Markdown fonte={fonte} />
          </article>
        </div>
      ) : (
        <p className="kit-md">O docs/DEVKIT.md não foi encontrado no servidor.</p>
      )}
    </div>
  );
}
