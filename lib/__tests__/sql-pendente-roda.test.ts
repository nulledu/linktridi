import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * O SQL pendente roda mesmo — contra um Postgres de verdade.
 *
 * Duas vezes seguidas o arquivo que o dono precisa rodar à mão explodiu na cara
 * dele no SQL Editor, e as duas eu tinha "revisado à mão" e dito que estava
 * bom. Revisão à mão não pega sintaxe de plpgsql, ordem entre seções, nem o
 * caso em que o banco JÁ tem metade das coisas — que é justamente o caso real,
 * porque os arquivos avulsos foram rodados antes do consolidado existir.
 *
 * PGlite é o Postgres compilado pra WASM: roda em processo, sem servidor, sem
 * container, sem rede. Não é um simulador — é o mesmo motor.
 *
 * O que este teste NÃO cobre: RLS de verdade, permissão de service role, e
 * qualquer coisa que dependa de extensão que o Supabase tem e o PGlite não.
 * Cobre o que quebrou: sintaxe, ordem, idempotência e o estado sujo.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ARQUIVO = join(RAIZ, "supabase", "estoque_pendente_tudo.sql");

/**
 * O banco ANTES do arquivo rodar, no estado real de 13/08/2026: a fundação
 * existe, alguns arquivos avulsos já rodaram (por isso `estoque_config` e
 * `codigo_expira_em` estão aqui), e `estoque_conferencias` ficou no formato
 * ANTIGO — com `nota`, que o app não manda mais.
 *
 * É de propósito que isto NÃO é o schema completo de produção: o arquivo só
 * pode depender do que ele mesmo declara precisar. Se um dia ele passar a
 * exigir uma coluna que não está aqui, o teste falha — e essa é a informação.
 */
const ANTES = `
create table public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null, sku text, quantidade int not null default 0,
  qtd_minima int, unidade text, categoria text, hierarquia text,
  serializado boolean not null default false, ativo boolean not null default true
);
create table public.estoque_fornecedores (id uuid primary key default gen_random_uuid(), nome text not null);
create table public.estoque_locais      (id uuid primary key default gen_random_uuid(), nome text not null);
create table public.estoque_unidades (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_itens(id) on delete restrict,
  codigo text not null unique, seq int not null, status text not null default 'em_estoque'
);
-- compras como ela é de verdade (supabase/recebimento.sql): o CHECK de status
-- nasceu INLINE, então quem escolheu o nome foi o Postgres. O §9 precisa
-- derrubar esse CHECK sem saber o nome dele — com um stub de duas colunas isso
-- passaria batido e só quebraria no SQL Editor do dono.
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  item_nome text not null default '',
  quantidade_comprada numeric(12,2) not null default 0,
  quantidade_recebida numeric(12,2) not null default 0,
  status text not null default 'comprado'
    check (status in ('solicitado','comprado','aguardando_entrega',
                      'chegou_parcial','divergencia','recebido','cancelado')),
  updated_at timestamptz not null default now()
);
create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras(id) on delete cascade,
  quantidade_recebida numeric(12,2) not null default 0,
  correto boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.estoque_dispositivos (
  id uuid primary key default gen_random_uuid(), nome text,
  codigo_ativacao text, codigo_expira_em timestamptz
);
create table public.estoque_operacoes (
  operation_id text primary key, dispositivo_id uuid, resultado jsonb,
  tipo text not null,
  constraint estoque_operacoes_tipo_check check (tipo in ('baixa','recebimento'))
);
create table public.estoque_config (
  id boolean primary key default true check (id),
  automacao_ativa boolean not null default false, ultima_varredura date,
  atualizado_em timestamptz not null default now(), atualizado_por uuid
);
insert into public.estoque_config (id) values (true);
create table public.estoque_conferencias (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid not null,
  item_id uuid references public.estoque_itens(id) on delete set null,
  executor_id uuid, executor_nome text,
  conferido_por_id uuid, conferido_por_nome text,
  quantidade_aprovada int not null default 0,
  quantidade_recusada int not null default 0,
  nota text not null check (nota in ('excelente','bom','mediano','ruim','pessimo')),
  defeitos text[] not null default '{}', obs text,
  conferido_em timestamptz not null default now()
);
create unique index estoque_conferencias_atividade_uidx on public.estoque_conferencias (atividade_id);
`;

let SQL = "";
beforeAll(() => { SQL = readFileSync(ARQUIVO, "utf8"); });

async function bancoSujo(conferenciasGravadas = 0): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(ANTES);
  for (let i = 0; i < conferenciasGravadas; i++) {
    await db.exec(`insert into public.estoque_conferencias (atividade_id, nota)
                   values (gen_random_uuid(), 'bom');`);
  }
  return db;
}

const existeColuna = (db: PGlite, tabela: string, coluna: string) =>
  db.query<{ n: number }>(
    `select count(*)::int n from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2`, [tabela, coluna],
  ).then((r) => r.rows[0].n > 0);

describe("supabase/estoque_pendente_tudo.sql roda num Postgres de verdade", () => {
  it("no estado REAL (conferência velha e vazia) roda inteiro e entrega tudo", async () => {
    const db = await bancoSujo(0);
    await db.exec(SQL);   // se estourar, o teste falha aqui com a mensagem do Postgres

    // §2 — a conferência trocou de formato
    expect(await existeColuna(db, "estoque_conferencias", "resultado")).toBe(true);
    expect(await existeColuna(db, "estoque_conferencias", "nota")).toBe(false);

    // §6 — a caixa
    expect(await existeColuna(db, "estoque_unidades", "quantidade")).toBe(true);
    expect(await existeColuna(db, "estoque_unidades", "baixa_atividade_id")).toBe(true);

    // §4 — a compra fala a língua do catálogo
    expect(await existeColuna(db, "compras", "fornecedor_id")).toBe(true);
    expect(await existeColuna(db, "compras", "hierarquia")).toBe(true);

    // §8 — a impressão é do escritório, e a etiqueta tem dois tipos
    expect(await existeColuna(db, "estoque_config", "etiqueta_altura_mm")).toBe(true);
    expect(await existeColuna(db, "estoque_itens", "etiqueta_tipo")).toBe(true);

    // §7 — o mutirão de /fotos-estoque anota o que é e deixa rastro
    expect(await existeColuna(db, "estoque_itens", "observacoes")).toBe(true);
    const item = await db.query<{ id: string }>(
      `insert into public.estoque_itens (nome) values ('Item da faxina') returning id`,
    );
    await db.exec(`insert into public.estoque_faxina_log (item_id, campo, antes, depois, por_nome)
                   values ('${item.rows[0].id}', 'local', null, 'Prateleira A3', 'Ana');`);
    // O `check` é o que impede o log virar depósito de campo inventado.
    await expect(db.exec(`insert into public.estoque_faxina_log (item_id, campo)
                          values ('${item.rows[0].id}', 'preco');`)).rejects.toThrow();

    await db.close();
  }, 60_000);

  it("o único por atividade é PARCIAL — senão o refazer fica bloqueado", async () => {
    const db = await bancoSujo(0);
    await db.exec(SQL);

    const { rows } = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'estoque_conferencias_atividade_uidx'`,
    );
    expect(rows[0]?.indexdef ?? "").toMatch(/where \(?resultado/i);

    // A prova que importa não é o texto do índice, é o comportamento: a mesma
    // atividade pode ser reprovada N vezes (o refazer) e aprovada UMA só.
    const ativ = "11111111-1111-1111-1111-111111111111";
    const grava = (r: string) => db.exec(
      `insert into public.estoque_conferencias (atividade_id, resultado, quantidade)
       values ('${ativ}', '${r}', 0);`,
    );
    await grava("errado");
    await grava("errado");          // reprovar de novo é o ciclo normal
    await grava("certo");
    await expect(grava("certo")).rejects.toThrow();   // aprovar duas vezes, não

    await db.close();
  }, 60_000);

  it("§8 — o item nasce 'unica' e o banco recusa altura ilegível", async () => {
    const db = await bancoSujo(0);
    await db.exec(SQL);

    // O default é o que dispensa preencher os 192 itens à mão: todo item nasce
    // 'unica', que é EXATAMENTE o comportamento de hoje (selo só quando a
    // quantidade passa de 1). Nada muda de aparência sem alguém escolher.
    const novo = await db.query<{ etiqueta_tipo: string }>(
      `insert into public.estoque_itens (nome) values ('Chapa') returning etiqueta_tipo`,
    );
    expect(novo.rows[0].etiqueta_tipo).toBe("unica");

    // Os limites físicos são `check` no banco também. A tela é a primeira
    // defesa e a única que um `fetch` na mão contorna — 4mm de etiqueta é uma
    // barra que leitor nenhum lê, e ela sairia impressa em lote.
    await expect(db.exec(`update public.estoque_config set etiqueta_altura_mm = 4;`)).rejects.toThrow();
    await db.exec("rollback;");
    await expect(db.exec(`update public.estoque_itens set etiqueta_tipo = 'pallet';`)).rejects.toThrow();
    await db.exec("rollback;");

    // ── Quais campos vão impressos ──────────────────────────────────────────
    //
    // A coluna nasce VAZIA, e é isso que faz a atualização não mexer em
    // etiqueta nenhuma: vazio quer dizer "imprime tudo", que é o galpão de
    // hoje. Se o default fosse a lista dos LIGADOS, rodar este SQL mudaria o
    // desenho de toda etiqueta do galpão no dia seguinte.
    const campos = await db.query<{ etiqueta_ocultos: string[] }>(
      `select etiqueta_ocultos from public.estoque_config where id is true`,
    );
    expect(campos.rows[0].etiqueta_ocultos).toEqual([]);

    await db.exec(`update public.estoque_config set etiqueta_ocultos = '{codigo_legivel,cor_dimensoes}';`);
    // E o `check` recusa chave que a etiqueta não tem: gravada, ela sumiria na
    // leitura seguinte (o servidor descarta o que não conhece) e quem mexeu
    // concluiria que a tela não salva.
    await expect(
      db.exec(`update public.estoque_config set etiqueta_ocultos = '{nome_do_produto}';`),
    ).rejects.toThrow();
    await db.exec("rollback;");

    await db.close();
  }, 60_000);

  it("§11 — o bipe nasce DESLIGADO e o livro recusa linha sem sentido", async () => {
    const db = await bancoSujo(0);
    await db.exec(SQL);

    // Nasce desligado. Uma exigência nova que se liga sozinha no dia do deploy
    // é uma bancada parada de manhã sem ninguém entender por quê — e como este
    // arquivo é rodado à mão pelo dono, "no dia do deploy" é literalmente o
    // minuto em que ele colar isto no SQL Editor.
    const cfg = await db.query<{ bipe_para_iniciar: boolean }>(
      `select bipe_para_iniciar from public.estoque_config where id is true`,
    );
    expect(cfg.rows[0].bipe_para_iniciar).toBe(false);

    const ativ = "33333333-3333-3333-3333-333333333333";
    // O que deu certo, e a caixa lacrada valendo 50.
    await db.exec(`insert into public.atividade_bipes (atividade_id, codigo, situacao, item, pecas, colaborador_nome)
                   values ('${ativ}', 'FOLHA-000012', 'baixada', 'Folha de alavanca', 50, 'Fulano');`);
    // A saída registrada: sem código, com motivo. É a linha que faz a saída de
    // emergência não virar o caminho normal.
    await db.exec(`insert into public.atividade_bipes (atividade_id, situacao, motivo, colaborador_nome)
                   values ('${ativ}', 'dispensado', 'etiqueta_ilegivel', 'Fulano');`);

    const { rows } = await db.query<{ n: number; pecas: number }>(
      `select count(*)::int n, coalesce(sum(pecas),0)::int pecas
         from public.atividade_bipes where atividade_id = '${ativ}'`,
    );
    expect(rows[0]).toEqual({ n: 2, pecas: 50 });

    // Bipe sem código não é bipe: só a dispensa pode não ter etiqueta.
    await expect(db.exec(`insert into public.atividade_bipes (atividade_id, situacao)
                          values ('${ativ}', 'baixada');`)).rejects.toThrow();
    await db.exec("rollback;");
    // Vocabulário fechado — o mesmo de SituacaoBaixa.
    await expect(db.exec(`insert into public.atividade_bipes (atividade_id, codigo, situacao)
                          values ('${ativ}', 'X-000001', 'mais_ou_menos');`)).rejects.toThrow();
    await db.exec("rollback;");
    // Peça negativa devolveria material ao estoque pela porta do histórico.
    await expect(db.exec(`insert into public.atividade_bipes (atividade_id, codigo, situacao, pecas)
                          values ('${ativ}', 'X-000001', 'baixada', -3);`)).rejects.toThrow();
    await db.exec("rollback;");

    await db.close();
  }, 60_000);

  it("rodar duas vezes seguidas não quebra (é o que 'idempotente' quer dizer)", async () => {
    const db = await bancoSujo(0);
    await db.exec(SQL);
    await db.exec(SQL);
    await db.close();
  }, 60_000);

  it("num banco LIMPO também roda — quem instalar do zero não fica de fora", async () => {
    const db = await PGlite.create();
    // a fundação, sem nenhum dos arquivos pendentes
    await db.exec(ANTES
      .replace(/create table public\.estoque_config[\s\S]*?\);/, "")
      .replace(/insert into public\.estoque_config[^;]*;/, "")
      .replace(/create table public\.estoque_conferencias[\s\S]*?\);/, "")
      .replace(/create unique index estoque_conferencias_atividade_uidx[^;]*;/, "")
      .replace(/, codigo_expira_em timestamptz/, ""));
    await db.exec(SQL);
    expect(await existeColuna(db, "estoque_config", "automacao_ativa")).toBe(true);
    expect(await existeColuna(db, "estoque_dispositivos", "codigo_expira_em")).toBe(true);
    // O tablet manda os dois números em todo heartbeat e o servidor jogava
    // fora. Sem estas colunas, um aparelho com 40 operações presas há dois dias
    // continua invisível pra quem poderia resolver.
    expect(await existeColuna(db, "estoque_dispositivos", "pendencias")).toBe(true);
    expect(await existeColuna(db, "estoque_dispositivos", "app_versao")).toBe(true);
    await db.close();
  }, 60_000);

  it("conferência velha COM dado: para, e NÃO apaga o histórico", async () => {
    const db = await bancoSujo(3);
    // Apagar conferência é apagar o registro de quem produziu o quê. O arquivo
    // resolve sozinho só quando não há nada a perder.
    await expect(db.exec(SQL)).rejects.toThrow(/formato ANTIGO[\s\S]*3 conferência/);

    // O `begin;` do arquivo deixou a transação aberta e ABORTADA — qualquer
    // consulta agora responde "current transaction is aborted". Desfazer é o
    // que o SQL Editor do Supabase faz sozinho ao ver o erro; aqui é na mão.
    // (E é a prova de que o arquivo não deixa escrita pela metade: o que ele
    // tinha feito antes de parar some junto.)
    await db.exec("rollback;");

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int n from public.estoque_conferencias`,
    );
    expect(rows[0].n).toBe(3);   // intactas
    await db.close();
  }, 60_000);

  // ── §9 · chegou ≠ está no estoque ─────────────────────────────────────────
  // O backfill é a parte perigosa do arquivo inteiro: ele ESCREVE em linhas
  // que já existem. Se rodar duas vezes, carimba como "guardado" a mercadoria
  // que chegou hoje e está esperando alguém no galpão — e o estoque passa a
  // contar caixa fechada de novo, que é o defeito que o §9 veio consertar.
  it("o backfill de quantidade_guardada roda UMA vez e respeita o estoque_erro", async () => {
    const db = await bancoSujo(0);
    await db.exec(`
      insert into public.compras (item_nome, quantidade_comprada, quantidade_recebida, status)
        values ('Almofada N.3', 10, 10, 'recebido');
      insert into public.compras (item_nome, quantidade_comprada, quantidade_recebida, status)
        values ('MDF 6mm', 50, 50, 'divergencia');
    `);
    // A segunda chegou e o lançamento falhou — o §4 é quem cria `estoque_erro`,
    // então o carimbo entra depois de rodar o arquivo a primeira vez.
    await db.exec(SQL);
    await db.exec(`update public.compras set quantidade_guardada = 0,
                     estoque_erro = 'o item não existe mais no catálogo'
                   where item_nome = 'MDF 6mm';`);

    const guardada = async (nome: string) => (await db.query<{ g: string; f: string }>(
      `select quantidade_guardada::text g, falta_guardar::text f from public.compras where item_nome = $1`, [nome],
    )).rows[0];

    // O que já estava recebido antes da migração conta como guardado: no mundo
    // antigo chegar e entrar no estoque eram o mesmo ato.
    expect(Number((await guardada("Almofada N.3")).g)).toBe(10);
    expect(Number((await guardada("Almofada N.3")).f)).toBe(0);

    // Status novo passa a ser aceito; lixo continua barrado.
    await db.exec(`insert into public.compras (item_nome, quantidade_comprada, quantidade_recebida, status)
                   values ('Chapa', 4, 4, 'chegou');`);
    await expect(db.exec(`insert into public.compras (item_nome, status) values ('X', 'inventado');`))
      .rejects.toThrow();

    // Segunda passada: nada do que está na fila de guardar pode ser carimbado.
    await db.exec(SQL);
    expect(Number((await guardada("MDF 6mm")).g), "compra com estoque_erro não está no estoque").toBe(0);
    expect(Number((await guardada("MDF 6mm")).f)).toBe(50);
    expect(Number((await guardada("Chapa")).g), "o que chegou hoje e ninguém guardou continua na fila").toBe(0);

    await db.close();
  }, 60_000);

  // O outro lado do mesmo backfill: a compra guardada PELA METADE. Enquanto a
  // coluna não existe, o código escreve "faltam N para guardar" em
  // `estoque_erro` (lib/recebimento-etapas.ts) — esse N é a única memória do
  // que já entrou no estoque. Um backfill que só olhasse "tem erro? então
  // zero" carimbaria zero guardado numa compra com metade no estoque, e o
  // galpão somaria essa metade de novo no dia seguinte.
  it("o backfill lê o NÚMERO da frase — compra guardada pela metade não zera", async () => {
    const db = await bancoSujo(0);
    await db.exec(`
      alter table public.compras add column if not exists estoque_erro text;
      insert into public.compras (item_nome, quantidade_comprada, quantidade_recebida, status, estoque_erro)
        values ('Chapa de borracha', 10, 10, 'divergencia',
                'ninguém guardou ainda — faltam 5 para guardar; dê entrada pela aba Recebimento ou pelo totem do galpão');
      insert into public.compras (item_nome, quantidade_comprada, quantidade_recebida, status, estoque_erro)
        values ('Resina 5L', 8, 3, 'chegou_parcial', 'o item vinculado não existe mais · faltam 2,5 para guardar');
      insert into public.compras (item_nome, quantidade_comprada, quantidade_recebida, status, estoque_erro)
        values ('Cola silicone', 20, 20, 'divergencia', 'o item vinculado a esta compra não existe mais no catálogo');
    `);
    await db.exec(SQL);

    const linha = async (nome: string) => (await db.query<{ g: string; f: string }>(
      `select quantidade_guardada::text g, falta_guardar::text f from public.compras where item_nome = $1`, [nome],
    )).rows[0];

    expect(Number((await linha("Chapa de borracha")).g), "5 já estavam no estoque").toBe(5);
    expect(Number((await linha("Chapa de borracha")).f), "e 5 continuam no corredor").toBe(5);
    // Decimal com vírgula, que é como a frase é escrita em português.
    expect(Number((await linha("Resina 5L")).g)).toBe(0.5);
    expect(Number((await linha("Resina 5L")).f)).toBe(2.5);
    // Erro sem número: o lançamento falhou inteiro, nada subiu.
    expect(Number((await linha("Cola silicone")).g)).toBe(0);

    await db.close();
  }, 60_000);

  // ── §10 · a fila de impressão ─────────────────────────────────────────────
  // O que o banco tem de garantir é o que a aplicação não consegue garantir
  // sozinha: um `insert` por qualquer outro caminho não pode enfileirar 30
  // vias, e trabalho não pode ficar órfão de aparelho.
  it("§10 — a fila nasce, recusa via demais e vai embora junto com o tablet", async () => {
    const db = await bancoSujo(0);
    await db.exec(SQL);

    const tablet = (await db.query<{ id: string }>(
      `insert into public.estoque_dispositivos (nome) values ('Tablet do galpão') returning id`,
    )).rows[0].id;

    const enfileira = (extra: string) => db.exec(
      `insert into public.estoque_impressao_trabalhos (dispositivo_id, titulo, conteudo${extra ? `, ${extra.split("=")[0]}` : ""})
       values ('${tablet}', 'PRATELEIRA A3', '{"linhas":[]}'::jsonb${extra ? `, ${extra.split("=")[1]}` : ""});`,
    );

    await enfileira("");
    const nascida = await db.query<{ status: string; copias: number }>(
      `select status, copias from public.estoque_impressao_trabalhos`,
    );
    expect(nascida.rows[0].status).toBe("fila");
    expect(nascida.rows[0].copias).toBe(1);

    // 30 vias digitadas sem querer viram 30 tiras de um rolo. A tela barra, a
    // rota barra, e o banco é a última linha.
    await expect(enfileira("copias=30")).rejects.toThrow();
    await db.exec("rollback;");
    await expect(enfileira("status='marciano'")).rejects.toThrow();
    await db.exec("rollback;");

    // `expirado` NÃO é um valor gravado — é calculado na leitura pelo tempo.
    // Se um dia alguém tentar gravá-lo, o banco recusa e o teste explica por quê.
    await expect(enfileira("status='expirado'")).rejects.toThrow();
    await db.exec("rollback;");

    // Tirar o tablet do ar leva junto a fila DELE: não há pra onde reapontar um
    // trabalho que existia porque alguém queria papel naquela impressora.
    await db.exec(`delete from public.estoque_dispositivos where id = '${tablet}';`);
    const sobrou = await db.query<{ n: number }>(
      `select count(*)::int n from public.estoque_impressao_trabalhos`,
    );
    expect(sobrou.rows[0].n).toBe(0);

    await db.close();
  }, 60_000);
});
