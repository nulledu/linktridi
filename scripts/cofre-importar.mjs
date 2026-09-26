// ── Importador do cofre de acessos ───────────────────────────────────────────
//
// Cadastra em lote as credenciais que hoje moram numa planilha, num PDF ou num
// grupo de WhatsApp. O arquivo NUNCA sai da sua máquina: este script lê,
// cifra com a mesma AES-256-GCM da aplicação e grava direto no Supabase.
//
//   node scripts/cofre-importar.mjs acessos.csv            # confere, não grava
//   node scripts/cofre-importar.mjs acessos.csv --gravar   # grava de verdade
//
// O padrão é CONFERIR. Nada é escrito sem `--gravar`, e o modo de conferência
// mostra a tabela inteira com a senha mascarada — dá pra ver se a coluna certa
// virou senha e se cada linha achou a pessoa certa antes de qualquer escrita.
//
// Formatos aceitos: .csv, .tsv, .txt (delimitado) e .json (lista de objetos).
// PDF não entra de propósito: extrair texto de PDF acerta na maioria dos casos
// e erra em silêncio no resto — e "errar em silêncio" aqui significa gravar
// pedaço de uma senha, que só vai aparecer no dia em que alguém não conseguir
// entrar. Abra o PDF, copie a tabela, cole num .csv e confira com os olhos.
//
// Depois de importar, APAGUE o arquivo:  rm -P acessos.csv

import { readFileSync } from "node:fs";
import { createCipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ── Ambiente ─────────────────────────────────────────────────────────────────
// Lê o .env.local direto: ninguém deveria precisar exportar três variáveis à
// mão pra rodar um importador que roda uma vez na vida.
function envLocal() {
  const out = {};
  let bruto = "";
  try { bruto = readFileSync(new URL("../.env.local", import.meta.url), "utf8"); } catch { return out; }
  for (const linha of bruto.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = { ...envLocal(), ...process.env };

const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const CHAVE_BRUTA = (env.ACESSOS_CRYPTO_KEY || "").trim();

function morre(msg) { console.error(`\n  ${msg}\n`); process.exit(1); }

if (!URL_SB || !SVC) morre("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local.");
if (!CHAVE_BRUTA) morre("Falta ACESSOS_CRYPTO_KEY no .env.local. Gere com: openssl rand -base64 32");

// A MESMA leitura de chave de lib/acessos-cofre.ts. Duplicada de propósito:
// este script roda fora do Next (sem os aliases `@/`), e importar o módulo da
// aplicação arrastaria o cliente do Supabase do servidor junto.
const CHAVE = /^[0-9a-fA-F]{64}$/.test(CHAVE_BRUTA)
  ? Buffer.from(CHAVE_BRUTA, "hex")
  : Buffer.from(CHAVE_BRUTA, "base64");
if (CHAVE.length !== 32) morre("ACESSOS_CRYPTO_KEY não tem 32 bytes. Gere com: openssl rand -base64 32");

// Mesmo formato de lib/acessos-cofre.ts — "v1:<iv>:<tag>:<dado>", IV novo a
// cada linha. Se um dia o formato mudar lá, muda aqui junto.
function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", CHAVE, iv);
  const dado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), dado.toString("base64")].join(":");
}

// ── Leitura do arquivo ───────────────────────────────────────────────────────
const [caminho, ...flags] = process.argv.slice(2);
const GRAVAR = flags.includes("--gravar");
// Pular linha sem dono é OPT-IN e barulhento. O padrão continua sendo travar:
// importação pela metade que ninguém percebeu é como metade da equipe fica sem
// credencial no cofre e ninguém descobre até precisar dela. Mas planilha de
// verdade vem com caixa compartilhada e conta reserva no meio das pessoas, e
// sem esta saída o arquivo inteiro fica refém de doze linhas que nem deveriam
// ter dono.
const PULAR = flags.includes("--pular-sem-dono");
const valorDe = (nome) => {
  const i = flags.indexOf(nome);
  return i >= 0 ? flags[i + 1] : undefined;
};
// Serviço padrão pra planilha SEM coluna de serviço — o caso comum da lista de
// e-mails corporativos, onde o serviço é o mesmo em toda linha.
const SERVICO_PADRAO = valorDe("--servico");
// Deduz o dono pelo PREFIXO do e-mail, pra lista que não tem coluna de nome —
// o caso das contas reserva, onde o dono está em `larissa2@` e mais nada.
// Deduzir aqui é legítimo porque o palpite é MOSTRADO na conferência antes de
// qualquer escrita, e porque ele desiste quando é ambíguo (ver `deduzir`).
const DONO_EMAIL = flags.includes("--dono-pelo-email");
// Mapeamento explícito, pro cabeçalho que os apelidos leem errado. O caso que
// motivou: uma planilha com `EMAIL, SENHA, USUÁRIO` — "USUÁRIO" ali é o NOME da
// pessoa, mas é também o apelido mais comum de "login". Adivinhar aqui é
// pendurar a senha na ficha de quem não é dono dela; quando o palpite não
// serve, quem manda é quem conhece a planilha:
//     --colunas pessoa=USUÁRIO,login=EMAIL,senha=SENHA
const COLUNAS = Object.fromEntries((valorDe("--colunas") || "")
  .split(",").filter(Boolean).map((par) => {
    const [campo, ...resto] = par.split("=");
    return [campo.trim(), resto.join("=").trim()];
  }));

if (!caminho) morre([
  "Uso: node scripts/cofre-importar.mjs <arquivo.csv> [opções]",
  "",
  "  --gravar                    grava de verdade (sem isto, só confere)",
  "  --colunas pessoa=X,senha=Y  diz qual coluna é qual, pelo nome no cabeçalho",
  '  --servico "Nome"            serviço padrão, pra planilha sem coluna de serviço',
  "  --dono-pelo-email           sem coluna de nome, deduz o dono pelo prefixo",
  "  --pular-sem-dono            importa quem casou e LISTA quem ficou de fora",
].join("\n  "));
if (/\.pdf$/i.test(caminho)) morre("PDF não é aceito — copie a tabela pra um .csv e confira com os olhos. O porquê está no topo deste arquivo.");

let bruto;
try { bruto = readFileSync(caminho, "utf8"); } catch (e) { morre(`Não consegui ler ${caminho}: ${e.message}`); }

// Reconhece o nome da coluna por APELIDO, e não por posição: planilha de gente
// real vem com "E-mail", "Email", "login", "usuário" — todos querendo dizer a
// mesma coisa. Exigir um cabeçalho exato só faria o script recusar o arquivo
// que ele deveria aceitar.
const APELIDOS = {
  pessoa:    ["colaborador", "colaboradora", "nome", "pessoa", "funcionario", "funcionário"],
  servico:   ["servico", "serviço", "sistema", "plataforma", "ferramenta", "conta"],
  login:     ["email", "e-mail", "usuario", "usuário", "login", "user"],
  senha:     ["senha", "password", "pass"],
  categoria: ["categoria", "tipo", "grupo"],
  url:       ["url", "link", "endereco", "endereço", "site"],
  notas:     ["obs", "observacao", "observação", "nota", "notas", "comentario", "comentário"],
};

const normaliza = (s) => String(s ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function coluna(cabecalho) {
  const mapa = {};
  // O que veio em `--colunas` entra PRIMEIRO e não é revisto: é a palavra de
  // quem conhece a planilha, e ela ganha de qualquer palpite por apelido.
  for (const [campo, nome] of Object.entries(COLUNAS)) {
    const i = cabecalho.findIndex((c) => normaliza(c) === normaliza(nome));
    if (i < 0) morre(`--colunas: não achei a coluna "${nome}" no cabeçalho.\n  Li: ${cabecalho.join(" | ")}`);
    mapa[campo] = i;
  }
  // Casamento em DOIS passes, exato antes de aproximado — e o aproximado
  // desiste quando o cabeçalho serve a mais de um campo.
  //
  // O passe único por `includes` parecia bastar até aparecer o cabeçalho
  // "EMAIL reserva conta google": ele contém "email" (apelido de login) e
  // "conta" (apelido de serviço). O primeiro campo do laço vencia por sorte da
  // ordem do objeto, e o e-mail de uma segunda lista virava o NOME DO SERVIÇO
  // de todas as linhas. Ninguém revisando o comando veria isso; só a tabela de
  // conferência denunciou.
  //
  // Cabeçalho ambíguo agora não vira nada, e diz por quê: mudo seria a mesma
  // armadilha com outra roupa.
  const livre = (i) => !Object.values(mapa).includes(i);
  const candidatos = (n, exato) => Object.entries(APELIDOS)
    .filter(([, apelidos]) => apelidos.some((a) => (exato ? n === normaliza(a) : n.includes(normaliza(a)))))
    .map(([campo]) => campo);

  for (const exato of [true, false]) {
    cabecalho.forEach((nome, i) => {
      const n = normaliza(nome);
      if (!n || !livre(i)) return;                   // sem cabeçalho, ou já reservada
      // A ambiguidade é medida no conjunto INTEIRO de candidatos, antes de
      // descartar os campos já preenchidos. Filtrar primeiro desfaz o teste:
      // "EMAIL reserva conta google" casa com login e serviço, mas login já
      // tinha dono, então sobrava um candidato só e a coluna era adotada como
      // serviço — o mesmo erro, agora escondido atrás da verificação que
      // deveria pegá-lo.
      const todos = candidatos(n, exato);
      if (!todos.length) return;
      if (todos.length > 1) {
        if (!exato) console.log(`  aviso: ignorei a coluna "${nome}" — ela parece ${todos.join(" e ")} ao mesmo tempo. Use --colunas se ela importa.`);
        return;
      }
      if (mapa[todos[0]] !== undefined) return;
      mapa[todos[0]] = i;
    });
  }
  return mapa;
}

// Divisor de linha de CSV que respeita aspas — sem isto, uma senha com vírgula
// (que é senha boa) racharia em duas colunas e entraria pela metade.
function celulas(linha, sep) {
  const out = []; let atual = ""; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; continue; }
    if (ch === sep && !aspas) { out.push(atual); atual = ""; continue; }
    atual += ch;
  }
  out.push(atual);
  return out.map((c) => c.trim());
}

function lerLinhas() {
  if (/\.json$/i.test(caminho)) {
    const dados = JSON.parse(bruto);
    if (!Array.isArray(dados)) morre("O .json precisa ser uma LISTA de objetos.");
    return dados.map((o) => {
      const m = {};
      for (const [k, v] of Object.entries(o)) {
        const n = normaliza(k);
        for (const [campo, apelidos] of Object.entries(APELIDOS)) {
          if (m[campo] !== undefined) continue;
          if (apelidos.some((a) => n === normaliza(a) || n.includes(normaliza(a)))) m[campo] = v;
        }
      }
      return m;
    });
  }
  const linhas = bruto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) morre("Arquivo vazio.");
  // O separador é o que mais aparece no cabeçalho — planilha exportada do
  // Excel em pt-BR sai com ponto e vírgula, e adivinhar errado dá uma coluna só.
  const sep = [";", "\t", ","].map((s) => [s, linhas[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cab = celulas(linhas[0], sep);
  const col = coluna(cab);
  const semDono = col.pessoa === undefined && !(DONO_EMAIL && col.login !== undefined);
  if (col.senha === undefined || semDono) {
    morre([
      "Não achei as colunas obrigatórias no cabeçalho.",
      `Li: ${cab.filter(Boolean).join(" | ")}`,
      "Preciso de uma coluna de SENHA e de saber de QUEM é cada linha —",
      "uma coluna de nome, ou --dono-pelo-email com uma coluna de e-mail.",
      "",
      "Se o cabeçalho usa outro vocabulário, diga qual é qual:",
      `    node scripts/cofre-importar.mjs ${caminho} --colunas pessoa=<coluna>,senha=<coluna>`,
    ].join("\n  "));
  }
  return linhas.slice(1).map((l) => {
    const c = celulas(l, sep);
    const o = {};
    for (const [campo, i] of Object.entries(col)) o[campo] = c[i];
    return o;
  });
}

// Sem coluna de nome, o e-mail é quem diz de quem é a linha — e as linhas
// vazias do rabo da planilha (a segunda lista acaba antes da primeira) somem
// aqui em vez de virarem 40 avisos de "sem dono".
const linhas = lerLinhas().filter((l) => l.senha && (DONO_EMAIL ? l.login : l.pessoa));
if (!linhas.length) morre(DONO_EMAIL ? "Nenhuma linha com e-mail e senha." : "Nenhuma linha com pessoa e senha.");

// ── Casar cada linha com um colaborador ──────────────────────────────────────
const db = createClient(URL_SB, SVC, { auth: { persistSession: false } });
const { data: perfis, error } = await db
  .from("profiles").select("id,name,username,active").limit(1000);
if (error) morre(`Não consegui ler profiles: ${error.message}`);

const porNome = new Map();
for (const p of perfis ?? []) {
  porNome.set(normaliza(p.name), p);
  if (p.username) porNome.set(normaliza(p.username), p);
}

// Casa pelo nome inteiro; se não achar, pelo primeiro nome — mas SÓ quando o
// primeiro nome for único na empresa. Duas Marianas viram ambiguidade, e
// ambiguidade aqui significa gravar a senha de uma na ficha da outra.
const porPrimeiro = new Map();
for (const p of perfis ?? []) {
  const primeiro = normaliza(p.name).split(" ")[0];
  porPrimeiro.set(primeiro, porPrimeiro.has(primeiro) ? null : p);
}

function acha(nome) {
  const n = normaliza(nome);
  return porNome.get(n) ?? porPrimeiro.get(n.split(" ")[0]) ?? null;
}

// ── Dono deduzido pelo prefixo do e-mail ─────────────────────────────────────
// `larissaribeiro2@tridixp.com.br` → "larissaribeiro" → Larissa Ribeiro.
// O sufixo numérico sai porque é o que distingue a conta reserva da principal,
// não a pessoa.
const semEspaco = new Map();
for (const p of perfis ?? []) {
  const chave = normaliza(p.name).replace(/[^a-z0-9]/g, "");
  semEspaco.set(chave, semEspaco.has(chave) ? null : p);   // homônimo vira null
}

function deduzir(email) {
  const prefixo = normaliza(email).split("@")[0]
    .replace(/[^a-z0-9]/g, "")
    .replace(/\d+$/, "");
  if (!prefixo) return null;
  // Nome inteiro grudado primeiro: é o único que distingue "larissa" de
  // "larissaribeiro". Só depois o primeiro nome, e ele já vem com a trava de
  // unicidade de `porPrimeiro`.
  return semEspaco.get(prefixo) ?? porPrimeiro.get(prefixo) ?? null;
}

const CATEGORIAS = ["Infraestrutura", "Redes sociais", "Ferramentas internas", "Financeiro", "Marketing", "Outros"];
const categoria = (v) => CATEGORIAS.find((c) => normaliza(c) === normaliza(v)) ?? "Outros";

const prontas = [], soltas = [];
for (const l of linhas) {
  const p = DONO_EMAIL ? deduzir(l.login) : acha(l.pessoa);
  if (!p) { soltas.push({ ...l, motivo: DONO_EMAIL ? "não deduzi o dono pelo e-mail" : "nenhum colaborador com esse nome" }); continue; }
  prontas.push({ perfil: p, linha: l, deduzido: DONO_EMAIL });
}

// ── Trava de colisão ─────────────────────────────────────────────────────────
// Dois e-mails DIFERENTES que caem na mesma pessoa são a assinatura de um
// palpite errado, não de duas contas legítimas. No arquivo que motivou isto,
// `larissa2@` e `larissaribeiro2@` são de duas Larissas: a primeira não tem
// nome inteiro no prefixo, cai no primeiro nome, e aterrissa na ficha da
// segunda. A conta de uma pessoa na mão de outra é o pior resultado possível
// num cofre — pior que não importar.
//
// Só vale pra dono DEDUZIDO. Com coluna de nome, duas linhas na mesma pessoa
// são exatamente o que se espera: ela tem duas contas.
if (DONO_EMAIL) {
  const porPerfil = new Map();
  for (const p of prontas) {
    const arr = porPerfil.get(p.perfil.id);
    if (arr) arr.push(p); else porPerfil.set(p.perfil.id, [p]);
  }
  for (const [, grupo] of porPerfil) {
    const logins = new Set(grupo.map((g) => normaliza(g.linha.login)));
    if (logins.size < 2) continue;
    for (const g of grupo) {
      prontas.splice(prontas.indexOf(g), 1);
      soltas.push({ ...g.linha, motivo: `prefixo ambíguo: ${[...logins].join(" e ")} caem em ${g.perfil.name}` });
    }
  }
}

// ── Conferência ──────────────────────────────────────────────────────────────
// A senha aparece mascarada, com o tamanho: o suficiente pra ver que a coluna
// certa virou senha, sem imprimir segredo num terminal que guarda histórico.
const mascara = (s) => `${"•".repeat(Math.min(String(s).length, 12))} (${String(s).length})`;

console.log(`\n  ${linhas.length} linha(s) lida(s) de ${caminho}`);
// O til não é enfeite: ele separa o que a planilha AFIRMA do que o script
// deduziu. Sem a marca, um palpite errado passa despercebido no meio de
// quarenta linhas certas — que é o único jeito de o palpite fazer estrago.
if (DONO_EMAIL) console.log(`  (~ = dono deduzido pelo e-mail, confira antes de gravar)`);
console.log("");
for (const { perfil, linha, deduzido } of prontas) {
  console.log(`  ${deduzido ? "ok ~" : "ok  "}  ${perfil.name.padEnd(24)} ${String(linha.servico || SERVICO_PADRAO || "—").padEnd(24)} ${String(linha.login || "—").padEnd(30)} ${mascara(linha.senha)}`);
}
for (const l of soltas) {
  console.log(`  SEM   ${String(l.pessoa || l.login || "—").padEnd(24)} ${String(l.servico || SERVICO_PADRAO || "—").padEnd(24)} — ${l.motivo}`);
}

if (soltas.length) {
  console.log(`\n  ${soltas.length} linha(s) sem dono. ${DONO_EMAIL
    ? "Ponha uma coluna de nome no arquivo e rode sem --dono-pelo-email, ou tire a linha,"
    : "Corrija o nome no arquivo (tem que bater com o cadastro em Pessoas), tire a linha,"}`);
  console.log(`  ou rode com --pular-sem-dono pra importar só quem casou (as de cima continuam listadas aqui).`);
}

if (!GRAVAR) {
  console.log(`\n  Nada foi gravado. Confira a tabela acima e rode de novo com --gravar:\n`);
  console.log(`      node scripts/cofre-importar.mjs ${caminho} --gravar\n`);
  process.exit(soltas.length ? 1 : 0);
}
if (soltas.length && !PULAR) morre("Resolva as linhas sem dono antes de gravar — importar pela metade sem perceber é pior que não importar. Se for de propósito, use --pular-sem-dono.");
if (soltas.length) console.log(`\n  Pulando ${soltas.length} linha(s) sem dono, a pedido (--pular-sem-dono).`);

// ── Gravação ─────────────────────────────────────────────────────────────────
const registros = prontas.map(({ perfil, linha }) => ({
  colaborador_id: perfil.id,
  servico: String(linha.servico || SERVICO_PADRAO || "Acesso").trim(),
  categoria: categoria(linha.categoria),
  url: linha.url ? String(linha.url).trim() : null,
  login: linha.login ? String(linha.login).trim() : null,
  senha_enc: cifrar(String(linha.senha)),
  notas: linha.notas ? String(linha.notas).trim() : null,
}));

const { error: erroInsert } = await db.from("acessos_credenciais").insert(registros);
if (erroInsert) morre(`Não consegui gravar: ${erroInsert.message}`);

// Uma linha de auditoria por credencial, igual ao que a tela faz — importação
// em massa não pode ser o buraco por onde credencial entra sem registro.
await db.from("acessos_log").insert(prontas.map(({ perfil, linha }) => ({
  credencial_id: null, ator_id: null, ator_nome: "Importação em lote",
  acao: "criar", servico_snapshot: String(linha.servico || SERVICO_PADRAO || "Acesso").trim(),
  colaborador_nome: perfil.name,
}))).then(() => {}, () => {});

console.log(`\n  ${registros.length} credencial(is) gravada(s) e cifrada(s).`);
console.log(`  Confira em Pessoas › Cofre de acessos e depois apague o arquivo:\n`);
console.log(`      rm -P ${caminho}\n`);
