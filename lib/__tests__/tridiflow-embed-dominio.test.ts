import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { EMBED_DOMINIO } from "../tridiflow-db";

// ── Embed entre bots e domínios sempre com o nome da chave ───────────────────
// 17/09/2026: 14 dos 17 funis publicados caíram de uma vez, todos dizendo "Este
// link não está disponível". Nada de infraestrutura — o `bot_id` de
// `supabase/tridiflow-dominio-raiz.sql` entrou no banco e criou um SEGUNDO
// caminho entre `tridiflow_bots` e `tridiflow_dominios`. Com dois caminhos, o
// PostgREST não escolhe: devolve `PGRST201` (HTTP 300) e reprova a consulta
// INTEIRA. `lerBotPublicado` via erro, o `/api/f/bot` virava 404 e o gedux
// mostrava a página de link indisponível pra TODO funil.
//
// O nome explícito da chave (`!tridiflow_bots_dominio_id_fkey`) fixa o sentido
// "projeto → endereço dele". A varredura existe porque o defeito não aparece em
// código nenhum: o embed cru continua compilando, passando no tsc e no lint, e
// só cai no dia em que alguém roda um SQL que liga as duas tabelas de novo.

const RAIZES = ["app", "lib", "scripts"];
const CRU = /tridiflow_dominios\s*\(/;                       // sem o `!<fk>` no meio

describe("embed de domínio do TridiFlow", () => {
  it("o embed nomeia a chave estrangeira e mantém a chave `tridiflow_dominios` na resposta", () => {
    expect(EMBED_DOMINIO).toBe("tridiflow_dominios!tridiflow_bots_dominio_id_fkey(host)");
    // O nome do embed no resultado é o da TABELA, não o da chave — quem lê
    // `r.tridiflow_dominios` continua valendo.
    expect(EMBED_DOMINIO.startsWith("tridiflow_dominios!")).toBe(true);
  });

  it("nenhum select volta a embutir o domínio sem dizer por qual chave", () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === "node_modules" || nome === "__tests__") continue;
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) { varrer(p); continue; }
        if (!/\.tsx?$/.test(nome)) continue;
        const texto = readFileSync(p, "utf8");
        texto.split("\n").forEach((linha, i) => {
          if (!CRU.test(linha)) return;
          if (linha.includes("tridiflow_dominios!")) return;   // nomeou a chave: ok
          if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return;        // comentário explicando o caso
          achados.push(`${p.replace(join(__dirname, "../../"), "")}:${i + 1}`);
        });
      }
    };
    for (const r of RAIZES) varrer(join(__dirname, "../..", r));
    expect(achados, `embed ambíguo (PGRST201 derruba a consulta inteira): use EMBED_DOMINIO em ${achados.join(", ")}`).toEqual([]);
  });
});
