import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Travas das TELAS do Financeiro — o que a varredura no navegador achou.
 *
 * Nenhuma delas foi pega por tipo nem por teste de unidade: são regras de
 * COERÊNCIA entre telas, e o defeito aparece como "esta tela não tem o que a
 * outra tem". Um módulo de dez telas em que cada uma resolve o mesmo problema
 * de um jeito diferente é o começo da bagunça que o dono reclamou na sidebar.
 *
 * Cada `it` abaixo nasceu de um defeito real encontrado abrindo a tela:
 *  · a Auditoria filtrava e não tinha como voltar num clique;
 *  · Compromissos tinha um "Limpar" com outro rótulo e outro desenho;
 *  · o cartão de número cortava "R$ 128.450,00" com reticências.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const TELAS = join(RAIZ, "app", "(plataforma)", "financeiro");

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/Client\.tsx$/.test(nome)) out.push(full);
  }
  return out;
}

const CLIENTES = varrer(TELAS).map((f) => ({
  arquivo: relative(RAIZ, f),
  texto: readFileSync(f, "utf8"),
}));

describe("Toda tela que filtra sabe desfiltrar", () => {
  it("quem tem <Filtro> tem <LimparFiltros>", () => {
    // Sem isto a pessoa liga um filtro, esquece, e passa a achar que o cadastro
    // está vazio — foi exatamente o que aconteceu na Auditoria.
    const semSaida = CLIENTES
      .filter((c) => /<Filtro\b/.test(c.texto) && !/LimparFiltros/.test(c.texto))
      .map((c) => c.arquivo);
    expect(semSaida, "tela filtra e não oferece 'Limpar filtros'").toEqual([]);
  });

  it("a FILEIRA de filtros usa a peça do kit, não um botão próprio", () => {
    // O alvo é só a fileira. Compromissos tinha ali um
    // `<BotaoFin icone="x">Limpar</BotaoFin>` à mão, e o mesmo ato aparecia de
    // dois jeitos no mesmo módulo.
    //
    // O botão de limpar do ESTADO VAZIO ("não achei nada → limpar filtros") é
    // outra coisa e continua permitido: ali ele não duplica o controle da
    // fileira, ele oferece a saída no lugar onde a pessoa está olhando. Foi por
    // não separar os dois que a primeira versão desta trava acusou Compras e
    // Compromissos por um acerto.
    const proprios: string[] = [];
    for (const c of CLIENTES) {
      for (const m of c.texto.matchAll(/<Filtros>([\s\S]*?)<\/Filtros>/g)) {
        if (/icone="x"|>\s*Limpar\s*</.test(m[1])) proprios.push(c.arquivo);
      }
    }
    expect(proprios, "botão de limpar escrito à mão dentro de <Filtros> — use <LimparFiltros>").toEqual([]);
  });
});

describe("O cartão de número não corta o valor", () => {
  const kit = readFileSync(join(TELAS, "ui.tsx"), "utf8");

  it("o valor usa a grade que muda de lugar no celular", () => {
    // No carrossel do celular o cartão tem 198px e o ícone comia 54 deles:
    // sobravam 93px para o número e "R$ 128.450,00" saía com reticências.
    // `.fin-kpi` é o que move o valor para uma linha própria — sem a classe,
    // o corte volta e ninguém percebe até alguém olhar no celular.
    expect(kit).toContain('className="fin-kpi"');
    expect(kit).toContain('className="fin-kpi-val"');
  });

  it("a regra do celular existe no globals.css", () => {
    const css = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
    const i = css.indexOf(".fin-kpi {");
    expect(i, "a classe .fin-kpi sumiu do globals.css").toBeGreaterThan(-1);
    // A troca de lugar acontece só abaixo de 700px; no computador o ícone fica
    // ao lado. Se a media query sair, o desktop vira o layout do celular.
    expect(css.slice(i)).toMatch(/@media \(max-width: 700px\)[\s\S]{0,400}\.fin-kpi\b/);
  });

  it("o corpo da fonte cede em valor longo, como segunda defesa", () => {
    expect(kit).toMatch(/valor\.length > 16 \? \d+ : valor\.length > 12 \? \d+ : \d+/);
  });
});

describe("Coerência do módulo", () => {
  it("nenhuma tela monta tabela na mão — todas usam o kit", () => {
    // Tabela própria esquece o `data-l`, e aí as 6 colunas atravessam a tela de
    // 320px em vez de virar card.
    // Exceções COM MOTIVO, como toda trava deste repositório:
    // · Colaboradores: a folha do mês tem 14 colunas com célula EDITÁVEL e a
    //   coluna da pessoa grudada (sticky). A <Tabela> do kit vira card no
    //   celular pelo data-l — certo para leitura, impossível para uma grade de
    //   edição; aqui a regra usada é a outra da fundação: o bloco rola POR
    //   DENTRO (overflow-x: auto), e a página nunca rola de lado.
    const EXCECOES = new Set(["cadastros/colaboradores/ColaboradoresClient.tsx"]);
    const naMao = CLIENTES
      .filter((c) => /<table[\s>]/.test(c.texto))
      .filter((c) => ![...EXCECOES].some((e) => c.arquivo.endsWith(e)))
      .map((c) => c.arquivo);
    expect(naMao, "use <Tabela> do kit em vez de <table>").toEqual([]);
  });

  it("toda escrita confere o CORPO da resposta, não só r.ok", () => {
    // Sessão expirada já devolveu 200 com HTML neste repositório, e 129 telas
    // leram isso como sucesso. Quem faz POST/PATCH/DELETE tem de ler o corpo.
    const soOk = CLIENTES
      .filter((c) => /method:\s*"(POST|PATCH|DELETE)"/.test(c.texto))
      .filter((c) => !/\.json\(\)/.test(c.texto))
      .map((c) => c.arquivo);
    expect(soOk, "tela escreve e não lê o corpo da resposta").toEqual([]);
  });
});

/**
 * Cadastrar sem poder corrigir é meio cadastro.
 *
 * O Patrimônio nasceu assim: a folha de "Novo patrimônio" gravava o bem e não
 * havia caminho de volta. O local muda, o responsável sai da empresa, o valor
 * entra com um zero a mais — e a única saída era cadastrar de novo, com o
 * código repetido batendo no 409. A rota `PATCH` já existia e estava completa;
 * faltava a tela chamar.
 *
 * Vale para quem CADASTRA NA PRÓPRIA FOLHA (o formulário é a tela). Compras e
 * Notas ficam de fora de propósito: nelas o clique na linha abre uma gaveta de
 * detalhe, que é onde a edição mora — padrão diferente, não ausência dele.
 */
describe("Toda tela que cadastra também edita", () => {
  const GAVETA_DE_DETALHE = [
    "app/(plataforma)/financeiro/compras/ComprasClient.tsx",
    "app/(plataforma)/financeiro/notas/NotasClient.tsx",
  ];

  const CADASTRAM = CLIENTES.filter(
    // `"POST"` solto, e não `method: "POST"`: metade das telas escolhe o verbo
    // numa variável (`method: metodo`), e o casamento literal não via nenhuma.
    (c) => /"POST"/.test(c.texto) && /<Tabela\b/.test(c.texto)
           && !GAVETA_DE_DETALHE.includes(c.arquivo),
  );

  it("a lista dessas telas não está vazia (senão o teste não olha nada)", () => {
    expect(CADASTRAM.length).toBeGreaterThan(5);
  });

  it("todas chamam PATCH em algum lugar", () => {
    const soNascem = CADASTRAM.filter((c) => !/"PATCH"/.test(c.texto)).map((c) => c.arquivo);
    expect(soNascem, "tela cadastra e não deixa corrigir depois").toEqual([]);
  });

  it("todas abrem o registro num clique na linha", () => {
    // Sem `aoClicar` a edição existe no código e não existe pra pessoa: não há
    // por onde chegar nela.
    const semPorta = CADASTRAM.filter((c) => !/aoClicar=/.test(c.texto)).map((c) => c.arquivo);
    expect(semPorta, "a linha da tabela não abre o registro").toEqual([]);
  });
});

/**
 * Clique morto: a linha que não responde a quem só lê.
 *
 * Era assim em cinco telas — `aoClicar={podeEscrever ? … : undefined}`. Sem a
 * sub de escrita, a pessoa clicava na lista inteira e não acontecia nada: sem
 * mensagem, sem cursor, sem pista. "Não consigo clicar em nada nessas telas do
 * financeiro" é exatamente como isso chega a quem usa — e nada no código
 * parecia errado, porque esconder o que não se pode fazer é normalmente certo.
 *
 * A separação certa é outra: LER é de quem abre a tela; ESCREVER é de quem tem
 * a chave. A linha abre para todo mundo e o painel decide o que mostrar —
 * ficha de leitura (`FichaTopo`) ou formulário travado (`SoLeitura`).
 */
describe("Ninguém fica com a linha morta na mão", () => {
  it("nenhum aoClicar depende de permissão de escrita", () => {
    const mortos = CLIENTES
      .filter((c) => /aoClicar=\{pode[A-Z]\w*\s*\?/.test(c.texto))
      .map((c) => c.arquivo);
    expect(
      mortos,
      "a linha só abre para quem escreve — use <SoLeitura> ou uma ficha de leitura",
    ).toEqual([]);
  });

  it("quem abre um formulário sem poder salvar diz o porquê", () => {
    // `SoLeitura` escreve o motivo e desliga os campos. Sem ela, o painel abre
    // editável e a escrita volta 403 depois de a pessoa digitar tudo.
    // Duas telas ficam de fora porque nelas não EXISTE o buraco: a página e a
    // escrita passam pela MESMA chave, então quem consegue abrir consegue
    // salvar. Folha é `financeiro:folha` na página e na rota; Configurações é
    // `financeiro:config` nas duas. Um aviso de "você não pode salvar" ali
    // seria mentira — e aviso que nunca é verdade ensina a ignorar aviso.
    const MESMA_CHAVE_PARA_LER_E_ESCREVER = [
      "app/(plataforma)/financeiro/cadastros/colaboradores/ColaboradoresClient.tsx",
      "app/(plataforma)/financeiro/configuracoes/ConfiguracoesClient.tsx",
    ];
    const comFormulario = CLIENTES.filter(
      (c) => /aoClicar=\{\(\w+\)\s*=>\s*\{?\s*(setErro|setForm|setConta|setRascunho)/.test(c.texto)
             && !MESMA_CHAVE_PARA_LER_E_ESCREVER.includes(c.arquivo),
    );
    const semAviso = comFormulario
      .filter((c) => !/<SoLeitura\b/.test(c.texto))
      .map((c) => c.arquivo);
    expect(semAviso, "o clique abre o formulário e ninguém explica que não dá para salvar").toEqual([]);
  });
});

/**
 * Em "Visão geral" o formulário PERGUNTA a empresa — nunca some o botão.
 *
 * A primeira versão do modo geral escondia todo botão de criar
 * (`podeX={(…) && !geral}`), e o resultado foi o dono relatando que não
 * conseguia criar compromisso, compra, nota, patrimônio nem cadastro nenhum:
 * o módulo inteiro parecia quebrado, e nada no código parecia errado —
 * esconder o que não dá para fazer costuma ser certo. Aqui não: a pessoa
 * sabe em qual empresa quer cadastrar; quem não sabia era a tela.
 */
describe("Visão geral pergunta a empresa em vez de esconder o botão", () => {
  const PAGINAS = varrerPaginas(TELAS).map((f) => ({ arquivo: relative(RAIZ, f), texto: readFileSync(f, "utf8") }));

  it("nenhuma página desliga um pode* por causa do modo geral", () => {
    const escondem = PAGINAS
      .filter((p) => /pode\w*=\{[^}]*&& !geral\}/.test(p.texto) || /compromissos: false/.test(p.texto))
      .map((p) => p.arquivo);
    expect(escondem, "o botão some em Visão geral — o formulário deve perguntar a empresa").toEqual([]);
  });

  it("toda tela que cria com empresa_id tem o seletor de empresa no formulário", () => {
    const semSeletor = CLIENTES
      .filter((c) => /empresa_id:\s*\w+(\.empresa_id)?\s*\|\|\s*empresaId|empresa_id: (empresaEscolhida|alvo)/.test(c.texto)
                  || /empresa_id: empresaId[,\s]/.test(c.texto))
      .filter((c) => !/<SeletorEmpresa\b/.test(c.texto))
      // Configurações cria CATEGORIA, e o card dela tem o próprio seletor;
      // o POST de empresa não tem empresa-mãe por definição.
      .filter((c) => !c.arquivo.endsWith("ConfiguracoesClient.tsx"))
      .map((c) => c.arquivo);
    expect(semSeletor, "cria numa empresa mas não deixa escolher qual em Visão geral").toEqual([]);
  });
});

/**
 * Trocar de empresa REMONTA a tela.
 *
 * O seletor troca o cookie e chama `router.refresh()`, que refaz a árvore no
 * servidor PRESERVANDO o estado do cliente. Sem `key` pela empresa, o filtro
 * de conta continuava com o id da outra empresa (lista vazia, com "Todas" em
 * todos os seletores), e o `empresaEscolhida` de Compras, Notas e Folha seguia
 * apontando para a empresa de antes — o cadastro nascia na empresa errada, em
 * silêncio. Foi o "troquei de empresa e sumiu tudo" relatado em 22/08/2026.
 */
describe("Trocar de empresa remonta a tela", () => {
  const PAGINAS = varrerPaginas(TELAS).map((f) => ({ arquivo: relative(RAIZ, f), texto: readFileSync(f, "utf8") }));

  it("toda página dá `key` ao Client pela empresa", () => {
    const soltas = PAGINAS
      .filter((p) => /<\w+Client\b/.test(p.texto))
      .filter((p) => !/<\w+Client\s*\n(?:\s*\/\/[^\n]*\n)*\s*key=\{empresa\?\.id \?\? "geral"\}/.test(p.texto))
      .map((p) => p.arquivo);
    expect(
      soltas,
      "Client sem `key={empresa?.id ?? \"geral\"}`: ao trocar de empresa o estado da tela (filtros, empresa escolhida, seleção) sobrevive e aponta para a empresa anterior",
    ).toEqual([]);
  });
});

describe("Cadastros financeiros apontam para a identidade canônica", () => {
  it("centraliza fornecedores no diretório de contatos", () => {
    // Um fornecedor é um papel de um contato. Manter uma entrada paralela no
    // menu ou no hub faz a pessoa escolher entre duas telas para o mesmo dado.
    const shell = readFileSync(join(TELAS, "FinanceiroShell.tsx"), "utf8");
    const paginaFornecedor = readFileSync(join(TELAS, "cadastros", "fornecedores", "page.tsx"), "utf8");

    expect(shell).toContain('label: "Contatos e empresas"');
    expect(shell).not.toContain('label: "Fornecedores"');
    expect(paginaFornecedor).toContain('redirect("/financeiro/cadastros/contatos?papel=fornecedor")');
  });

  it("recorrências usam um único relacionado sem perder as duas FKs", () => {
    // Mudar o seletor para gravar sempre `contato.id` apagaria o vínculo
    // operacional usado pelo gerador. A escolha unificada é só apresentação:
    // fornecedor continua preenchendo a FK legada, demais partes usam contato.
    const pagina = readFileSync(join(TELAS, "cadastros", "recorrencias", "page.tsx"), "utf8");
    const cliente = readFileSync(join(TELAS, "cadastros", "recorrencias", "RecorrenciasClient.tsx"), "utf8");

    expect(pagina).toContain("partes(escopo");
    expect(pagina).toContain("relacionados={relacionados}");
    expect(cliente).toContain('label="Relacionado a"');
    // O que importa é o DECODIFICADOR continuar no caminho — ele é quem parte
    // `contato:<id>` / `fornecedor:<id>` de volta nas duas FKs. A asserção
    // antiga prendia a sintaxe do `<select>` nativo (`e.target.value`) e
    // quebrou quando o seletor virou um componente próprio, sem que a regra
    // protegida tivesse mudado uma linha.
    expect(cliente).toMatch(/idsDoRelacionado\(/);
    expect(cliente).toContain("fornecedor_id: rascunho.fornecedor_id || null");
    expect(cliente).toContain("contato_id: rascunho.contato_id || null");
    expect(cliente).toContain("lancar_primeira: rascunho.lancar_primeira");
  });

  it.each(["compras", "notas", "patrimonio"])(
    "%s preserva fornecedor.id na FK e leva contato.id só ao link da ficha",
    (tela) => {
      // O ID da extensão é contrato do banco de compras/notas/patrimônio. O
      // contato canônico serve apenas para abrir a ficha unificada; trocar os
      // dois faria o POST referenciar a tabela errada.
      const pagina = readFileSync(join(TELAS, tela, "page.tsx"), "utf8");
      const cliente = readFileSync(
        join(TELAS, tela, `${tela[0].toUpperCase()}${tela.slice(1)}Client.tsx`),
        "utf8",
      );

      expect(pagina).toContain("id: f.id");
      expect(pagina).toContain("contato_id: contatoPorFornecedor.get(f.id) ?? null");
      expect(cliente).toContain(tela === "notas" ? "n.fornecedor_id" : "fornecedor_id:");
      expect(cliente).toContain("/financeiro/cadastros/contatos?papel=fornecedor&editar=");
      expect(cliente).toContain("encodeURIComponent");
    },
  );

  it.each([
    ["compras", ["fCompras.dados", "fParcelas.dados"]],
    ["notas", ["fNotas.dados", "fCompras.dados"]],
    ["patrimonio", ["fItens.dados", "fCompras.dados"]],
  ])("%s resolve links também para fornecedores históricos exibidos", (tela, fontes) => {
    const pagina = readFileSync(join(TELAS, tela, "page.tsx"), "utf8");
    const cliente = readFileSync(
      join(TELAS, tela, `${tela[0].toUpperCase()}${tela.slice(1)}Client.tsx`),
      "utf8",
    );

    expect(pagina).toContain("idsDeFornecedoresReferenciados(");
    for (const fonte of fontes) expect(pagina).toContain(fonte);
    expect(pagina).toContain("escopo, [], idsFornecedores");
    expect(pagina).toContain("contatosPorFornecedor={Object.fromEntries(contatoPorFornecedor)}");
    expect(pagina).toContain("fornecedores={fFornecedores.dados");
    expect(cliente).toContain("contatosPorFornecedor[");
  });
});

function varrerPaginas(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrerPaginas(full, out);
    else if (nome === "page.tsx") out.push(full);
  }
  return out;
}

/**
 * Formulário só fecha no X.
 *
 * Pedido do dono, com todas as letras: "um pop-up que só desse pra sair caso
 * clicasse no X". Clique fora, Esc e arrasto eram três jeitos de perder vinte
 * campos digitados por um gesto involuntário. A regra geral do kit (fechar
 * fácil) continua valendo para painel de LEITURA — ali não há nada a perder.
 *
 * Três travas, porque o defeito volta por três portas:
 *  · um `apple-backdrop` cru com `onMouseDown` chamando o fechar;
 *  · um `keydown` de Escape escrito na mão;
 *  · um `<PainelLateral>` de formulário sem `soFechaNoX`.
 */
describe("Formulário do Financeiro só fecha no X", () => {
  it("nenhum véu fecha no clique fora", () => {
    const furam = CLIENTES
      .filter((c) => /apple-backdrop[^\n]*\n?[^\n]*onMouseDown=\{[^}]*(aoFechar|fechar)\(/.test(c.texto))
      .map((c) => c.arquivo);
    expect(furam, "use <ModalFormulario>, que não fecha no véu").toEqual([]);
  });

  it("nenhum Esc escrito na mão fecha um formulário", () => {
    const furam = CLIENTES
      .filter((c) => /e\.key === "Escape"[^\n]*(aoFechar|fechar|setForm\(null\)|setRascunho\(null\))/.test(c.texto))
      .map((c) => c.arquivo);
    expect(furam, "o Esc não pode fechar um formulário").toEqual([]);
  });

  it("todo painel lateral de formulário tem soFechaNoX", () => {
    // Painel de formulário = o título fala em Novo/Nova/Editar ou decide pelo
    // rascunho. Ficha de leitura ("Fornecedor", "Contato", o compromisso
    // selecionado) fica de fora de propósito.
    const semTrava: string[] = [];
    for (const c of CLIENTES) {
      const linhas = c.texto.split("\n");
      linhas.forEach((l, i) => {
        if (l.trim() !== "<PainelLateral") return;
        const titulo = linhas[i + 1] ?? "";
        const ehFormulario = /Nov[oa]\b|Editar|rascunho\.id|conta\.id|\?\s*"Editar/.test(titulo);
        if (!ehFormulario) return;
        if ((linhas[i + 2] ?? "").trim() !== "soFechaNoX") semTrava.push(`${c.arquivo}:${i + 1}`);
      });
    }
    expect(semTrava, "painel de formulário sem soFechaNoX").toEqual([]);
  });
});
