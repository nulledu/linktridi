#!/usr/bin/env node
// Espelha o código do Gaius no repositório do SITE PÚBLICO (nulledu/linktridi),
// que alimenta um SEGUNDO projeto na Vercel — outra conta, outro domínio.
//
// Por que espelho e não "conectar o mesmo repo nas duas Vercel": a integração
// Git da Vercel é por conta. Um repo já conectado numa conta recusa conectar em
// outra. Repo diferente, conta diferente, problema não existe.
//
// O espelho NÃO é um clone bruto — ele sai transformado:
//
//  1. `crons` some do vercel.json. Cron é POR PROJETO: com os 10 do Gaius no
//     espelho, `/api/tridichat/fila/drenar` rodaria duas vezes por dia em cima
//     da MESMA fila e o cliente poderia receber a mensagem duplicada; `/api/sync`
//     e `/api/trafego/sync` dobrariam o egress do Supabase, que é exatamente o
//     que pausou o projeto em julho/2026. (O middleware em APENAS_PLAYER já
//     devolve 404 nessas rotas, mas o Hobby da Vercel também recusa deploy com
//     mais de 2 crons — tirar aqui resolve os dois de uma vez.)
//  2. `.github/`, `.claude/` e `.planning/` ficam de fora: workflow do Gaius
//     rodando de novo no espelho é trabalho duplicado e falha ruidosa.
//  3. O histórico não é copiado. O espelho é um commit único, reescrito a cada
//     envio, com o SHA de origem na mensagem — dá pra saber de onde veio sem
//     arrastar anos de histórico pra outra conta.
//
// O espelho é SERVIDO em modo player: `APENAS_PLAYER=1` faz a instância inteira
// servir só /f, /p, /l e os assets, 404 no resto — nem /login existe lá. E com
// `PLAYER_API_BASE` apontando pro Gaius, ele nem toca no Supabase: pergunta as
// páginas ao ERP. Por isso o segundo projeto não recebe chave de banco nenhuma.
//
// Uso: npm run espelho
//
// A credencial é o apelido SSH `github-nulledu` (~/.ssh/config) — nunca
// github.com direto, que sairia com a conta do ERP e seria recusado.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REMOTO = process.env.ESPELHO_REMOTO || "git@github-nulledu:nulledu/linktridi.git";
// `master`, não `main`: é o ramo de produção do repo espelho, e é dele que a
// Vercel #2 faz o deploy. Empurrar pra `main` ali cria um ramo órfão que nunca
// vira produção — o deploy "não acontece" e não há erro nenhum pra investigar.
const RAMO = process.env.ESPELHO_RAMO || "master";
const FORA = [".github", ".claude", ".planning"];

const raiz = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (args, cwd = raiz) => execFileSync("git", args, { cwd, encoding: "utf8" });
const gitRuidoso = (args, cwd) => execFileSync("git", args, { cwd, stdio: "inherit" });

const sha = git(["rev-parse", "--short", "HEAD"]).trim();
const ramoOrigem = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();

// Trabalho não commitado não espelha: `git archive` lê o COMMIT, não o disco.
// Sem este aviso o espelho sai silenciosamente com o código anterior e a pessoa
// passa a tarde procurando por que a mudança "não subiu".
if (git(["status", "--porcelain"]).trim()) {
  console.warn(`aviso: há alterações não commitadas — o espelho leva ${sha} (${ramoOrigem}), não o que está no disco.`);
}

const tmp = mkdtempSync(join(tmpdir(), "espelho-"));
const arvore = join(tmp, "arvore");

try {
  // git archive = só o que está versionado no commit. node_modules, .next e
  // .env.local não têm como escapar por descuido: não estão no commit.
  execFileSync("sh", ["-c", `mkdir -p '${arvore}' && git archive ${sha} | tar -x -C '${arvore}'`], { cwd: raiz });

  for (const alvo of FORA) rmSync(join(arvore, alvo), { recursive: true, force: true });

  const caminhoVercel = join(arvore, "vercel.json");
  if (existsSync(caminhoVercel)) {
    const conf = JSON.parse(readFileSync(caminhoVercel, "utf8"));
    delete conf.crons;
    writeFileSync(caminhoVercel, JSON.stringify(conf, null, 2) + "\n");
  }

  writeFileSync(join(arvore, "ESPELHO.md"), [
    "# Espelho — não edite aqui",
    "",
    "Este repositório é gerado por `npm run espelho` a partir do Gaius",
    "(`sistemaempreendedores/dashvendas`). Qualquer commit feito diretamente aqui",
    "é apagado no próximo envio: o espelho é reescrito por inteiro.",
    "",
    `Origem: \`${sha}\` (${ramoOrigem})`,
    "",
    "## O que este deploy serve",
    "",
    "Só as páginas públicas — funis (`/f`), páginas e tutoriais (`/p`), vitrine",
    "(`/l`) e os assets. Todo o resto responde 404, inclusive `/login`.",
    "",
    "## Variáveis obrigatórias na Vercel",
    "",
    "| Variável | Valor |",
    "|---|---|",
    "| `APENAS_PLAYER` | `1` |",
    "| `PLAYER_API_BASE` | URL do Gaius em produção (sem barra no fim) |",
    "",
    "Com `PLAYER_API_BASE` definido o site pergunta as páginas ao Gaius e **não**",
    "fala com o Supabase — por isso nenhuma chave de banco mora neste projeto.",
    "",
  ].join("\n"));

  git(["init", "-q", "-b", RAMO], arvore);
  git(["add", "-A"], arvore);
  git(["-c", "user.name=espelho", "-c", "user.email=espelho@local", "commit", "-q", "-m",
    `chore: espelho de dashvendas@${sha}`], arvore);
  git(["remote", "add", "origin", REMOTO], arvore);

  console.log(`enviando espelho de ${sha} para ${REMOTO} (${RAMO})…`);
  gitRuidoso(["push", "-f", "origin", `${RAMO}:${RAMO}`], arvore);
  console.log("espelho atualizado.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
