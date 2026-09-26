// TEMPORÁRIO — dados falsos das SETE abas do Estoque para o banco de provas.
//
// Sem isto, `/dev-mobile?ws=estoque` só provava o cabeçalho: todas as abas
// buscam sozinhas e, sem sessão, caem em "Nada nesta hierarquia", "Carregando…"
// ou no aviso de SQL não rodado. Ou seja, os cards do catálogo, a tabela que
// vira card em Produção do dia e Conferir, a fileira de KPIs do Recebimento e a
// árvore de Localização — exatamente onde moram os defeitos de celular — nunca
// chegavam a ser desenhados na única página onde dá pra medi-los.
//
// Nomes longos de propósito: é o texto comprido que estoura a largura. Um
// catálogo de nomes curtos esconderia o caso difícil.

const iso = (m: number, d: number, h: number, min: number) => new Date(2026, m, d, h, min).toISOString();

// ── Catálogo (/api/estoque-itens) ────────────────────────────────────────────
interface ItemFalso {
  // `hierarquia: null` é o item que entrou por carga e ninguém classificou —
  // o caso que a nona aba ("Não classificados") existe pra mostrar. Sem ele
  // aqui, o aviso do topo e a triagem em lote nunca são desenhados no banco
  // de provas, que é onde o celular se mede.
  id: string; nome: string; hierarquia: string | null; produzido: boolean; serializado: boolean;
  categoria: string | null; imagem_url: null; unidade: string; quantidade: number;
  qtd_minima: number; ativo: boolean; custo: number | null; sku: string | null;
  estoque_ideal: number | null; fornecedor_id: string | null; local_id: string | null;
  cor: string | null;
}

const item = (
  id: string, nome: string, hierarquia: string | null, categoria: string | null,
  extra: Partial<ItemFalso> = {},
): ItemFalso => ({
  id, nome, hierarquia, categoria,
  produzido: false, serializado: false, imagem_url: null,
  unidade: "un", quantidade: 40, qtd_minima: 0, ativo: true,
  custo: 12.5, sku: null, estoque_ideal: null,
  fornecedor_id: null, local_id: null, cor: null,
  ...extra,
});

export const ESTOQUE_ITENS = {
  podeGerir: true,
  podeCadastrar: true,
  podeAjustar: true,
  podeVerCusto: true,
  itens: [
    item("i1", "Chapa de borracha laminada 500×700mm — 2,3mm", "materia_prima", "Borrachas", { quantidade: 6, qtd_minima: 10, estoque_ideal: 40, custo: 87.9, unidade: "ch", fornecedor_id: "f1", local_id: "l2" }),
    item("i2", "Resina fotopolimerizável para clichê (galão 5L)", "materia_prima", "Químicos", { quantidade: 2, qtd_minima: 3, estoque_ideal: 8, custo: 640, unidade: "L", fornecedor_id: "f2" }),
    item("i3", "Cabo de madeira torneado nº 4", "materia_prima", "Madeiras", { quantidade: 210, custo: 3.2 }),
    item("i4", "Tinta para carimbo — preta (frasco 30ml)", "insumo_direto", "Tintas", { quantidade: 9, qtd_minima: 12, estoque_ideal: 60, custo: 7.4, sku: "IDTINTAPRETA", serializado: false }),
    item("i5", "Álcool isopropílico 1L", "insumo_indireto", "Limpeza", { quantidade: 4, custo: 28.9 }),
    item("i6", "Caixa de papelão kraft 12×8×4cm (pacote com 100)", "embalagem", "Caixas", { quantidade: 18, custo: 45, unidade: "pct", local_id: "l3" }),
    item("i7", "Clichê de polímero A5 gravado e lavado", "mp_processada", "Clichês", { quantidade: 118, custo: 21.9, produzido: true }),
    item("i8", "Almofada entintada para carimbo automático nº 2", "componente", "Almofadas", { quantidade: 9, qtd_minima: 10, estoque_ideal: 45, custo: 6.8, produzido: true, serializado: true, sku: "CMPALM2" }),
    item("i9", "Corpo plástico do carimbo automático 38×14", "componente", "Plásticos", { quantidade: 260, custo: 4.15, serializado: true, sku: "CMPCORPO38" }),
    item("i10", "Carimbo automático 38×14mm montado — tinta preta", "peca", "Carimbos", { quantidade: 42, qtd_minima: 20, estoque_ideal: 80, custo: 39.9, produzido: true, serializado: true, sku: "PECCAR3814", local_id: "l2" }),
    item("i11", "Carimbo de bolso 47×18mm montado", "peca", "Carimbos", { quantidade: 3, qtd_minima: 8, estoque_ideal: 30, custo: 44.5, produzido: true }),
    item("i12", "Placa de sinalização em ACM 20×30 com impressão UV", "produto", "Sinalização", { quantidade: 0, qtd_minima: 5, estoque_ideal: 25, custo: 62, produzido: true }),
    item("i13", "Kit escritório completo — carimbo, refil e almofada", "produto", "Kits", { quantidade: 27, custo: 128.4, produzido: true, serializado: true, sku: "PRDKITESC" }),
    // Os quatro sem hierarquia: vieram da planilha do galpão e ninguém disse
    // ainda do que são feitos. Um deles também sem categoria — os dois eixos
    // vazios ao mesmo tempo é o pior caso do card e da linha de triagem.
    item("i14", "Fita adesiva transparente 48mm × 100m (caixa com 12 rolos)", null, "Logística", { quantidade: 14, custo: 62.4, unidade: "cx" }),
    item("i15", "Pallet de madeira PBR 1000×1200mm usado", null, "Logística", { quantidade: 8, custo: 45 }),
    item("i16", "Graxa de lítio para guia linear da fresadora CNC (bisnaga 400g)", null, "Máquinas", { quantidade: 3, qtd_minima: 2, custo: 38.9 }),
    item("i17", "Parafuso allen M4 × 12mm cabeça cilíndrica (saco com 500)", null, null, { quantidade: 2, custo: 74, unidade: "sc" }),
  ],
};

// ── Produção do dia (/api/estoque/producao-dia) ──────────────────────────────
export const ESTOQUE_PRODUCAO_DIA = {
  automacao: { ativa: true, ultimaVarredura: "2026-08-12" },
  linhas: [
    { itemId: "i12", nome: "Placa de sinalização em ACM 20×30 com impressão UV", hierarquia: "produto", categoria: "Sinalização", quantidade: 0, minima: 5, ideal: 25, falta: 25, emAndamento: 0, aProduzir: 25 },
    { itemId: "i11", nome: "Carimbo de bolso 47×18mm montado", hierarquia: "peca", categoria: "Carimbos", quantidade: 3, minima: 8, ideal: 30, falta: 27, emAndamento: 12, aProduzir: 15 },
    { itemId: "i8", nome: "Almofada entintada para carimbo automático nº 2", hierarquia: "componente", categoria: "Almofadas", quantidade: 9, minima: 10, ideal: 45, falta: 36, emAndamento: 36, aProduzir: 0 },
    { itemId: "i4", nome: "Tinta para carimbo — preta (frasco 30ml)", hierarquia: "insumo_direto", categoria: "Tintas", quantidade: 9, minima: 12, ideal: 60, falta: 51, emAndamento: 0, aProduzir: 51 },
  ],
  totais: { itens: 4, aProduzir: 91 },
};

// ── Conferir · fila (/api/estoque/conferencias/pendentes) ────────────────────
export const ESTOQUE_PENDENTES = {
  qcDesligado: false,
  travadas: 1,
  proximoCursor: null,
  atividades: [
    { id: "a7", produtoNome: "Almofada entintada para carimbo automático nº 2", itemId: "i8", itemSerializado: true, categoria: "Almofadas", quantidadeAlvo: 10, quantidadeFeita: 10, executorId: "c1", executorNome: "Vinicius Andrade", concluidaEm: iso(7, 10, 15, 40), souEuQuemFez: false },
    { id: "a9", produtoNome: "Carimbo automático 38×14mm montado — tinta preta", itemId: "i10", itemSerializado: true, categoria: "Carimbos", quantidadeAlvo: 24, quantidadeFeita: 22, executorId: "c2", executorNome: "Davi Nogueira", concluidaEm: iso(7, 11, 9, 5), souEuQuemFez: false },
    // Os dois impedimentos, que são o texto mais longo do card no celular.
    { id: "a10", produtoNome: "Kit escritório completo — carimbo, refil e almofada", itemId: "i13", itemSerializado: true, categoria: "Kits", quantidadeAlvo: 6, quantidadeFeita: 6, executorId: "dev", executorNome: "Teste", concluidaEm: iso(7, 11, 17, 22), souEuQuemFez: true },
    { id: "a11", produtoNome: "Suporte de bancada (nome fora do catálogo)", itemId: null, itemSerializado: null, categoria: null, quantidadeAlvo: 4, quantidadeFeita: 4, executorId: "c3", executorNome: "Gustavo Lima", concluidaEm: iso(7, 12, 8, 12), souEuQuemFez: false },
  ],
};

// ── Conferir · histórico (/api/estoque/conferencias) ─────────────────────────
export const ESTOQUE_CONFERENCIAS = {
  qcDesligado: false,
  proximoCursor: null,
  conferencias: [
    {
      id: "cf1", atividadeId: "a8", itemId: "i7", itemNome: "Clichê de polímero A5 gravado e lavado",
      executorId: "c1", executorNome: "Vinicius Andrade", conferidoPorId: "adm", conferidoPorNome: "Beatriz Souza Nascimento",
      resultado: "certo", quantidade: 8, unidadeCodigo: "CLI-A5-00311",
      defeitos: [], obs: null, conferidoEm: iso(7, 11, 11, 20),
      tentativa: 1, tentativas: 1,
    },
    // A mesma atividade duas vezes: reprovada e depois aprovada. É o card mais
    // alto do celular — duas tentativas empilhadas, com o texto mais longo da
    // tela dentro de uma delas.
    {
      id: "cf2b", atividadeId: "a6", itemId: "i10", itemNome: "Carimbo automático 38×14mm montado — tinta preta",
      executorId: "c2", executorNome: "Davi Nogueira", conferidoPorId: "adm", conferidoPorNome: "Beatriz Souza Nascimento",
      resultado: "certo", quantidade: 22, unidadeCodigo: "CAR-3814-01072",
      defeitos: [], obs: null, conferidoEm: iso(7, 11, 9, 30),
      tentativa: 2, tentativas: 2,
    },
    {
      id: "cf2a", atividadeId: "a6", itemId: "i10", itemNome: "Carimbo automático 38×14mm montado — tinta preta",
      executorId: "c2", executorNome: "Davi Nogueira", conferidoPorId: "adm", conferidoPorNome: "Beatriz Souza Nascimento",
      resultado: "errado", quantidade: 0, unidadeCodigo: null,
      defeitos: ["acabamento_ruim", "medida_errada"],
      obs: "Quatro peças voltaram com a borracha desalinhada em relação ao corpo; refizemos a colagem das duas primeiras e as outras duas ficaram para o descarte.",
      conferidoEm: iso(7, 10, 16, 45),
      tentativa: 1, tentativas: 2,
    },
  ],
};

// ── Fornecedores (/api/estoque/fornecedores) ─────────────────────────────────
export const ESTOQUE_FORNECEDORES = {
  podeGerir: true,
  fornecedores: [
    { id: "f1", nome: "Borrachas e Laminados do Nordeste Ltda.", cnpj: "12.345.678/0001-90", contato: "Marcos Vinícius de Albuquerque", telefone: "(81) 99999-0000", email: "comercial@borrachasnordeste.com.br", obs: "Entrega às terças", ativo: true },
    { id: "f2", nome: "Quimipoli Distribuidora", cnpj: "98.765.432/0001-10", contato: "Ana", telefone: "(11) 4002-8922", email: "vendas@quimipoli.com", obs: null, ativo: true },
    { id: "f3", nome: "Papelaria Central", cnpj: null, contato: null, telefone: null, email: null, obs: null, ativo: false },
  ],
};

// ── Base de custos legada (/api/tridi/estoque) ───────────────────────────────
export const ESTOQUE_TRIDI = {
  podeVerCusto: true,
  fornecedores: [
    { id: 1, nome: "Borrachas e Laminados do Nordeste Ltda.", contato: "Marcos", telefone: "(81) 99999-0000" },
    { id: 2, nome: "Quimipoli Distribuidora", contato: "Ana", telefone: "(11) 4002-8922" },
  ],
  materiais: [
    { id: 1, nome: "Chapa de borracha laminada 500×700mm — 2,3mm", unidade: "ch", custo: 87.9, fornecedor_id: 1 },
    { id: 2, nome: "Resina fotopolimerizável para clichê (galão 5L)", unidade: "L", custo: 640, fornecedor_id: 2 },
  ],
};

// ── Localização (/api/estoque/locais) ────────────────────────────────────────
export const ESTOQUE_LOCAIS = {
  podeGerir: true,
  locais: [
    { id: "l1", nome: "Galpão principal", codigo: "GP", pai_id: null, ativo: true, ordem: 0 },
    { id: "l2", nome: "Prateleira de carimbos montados (corredor A)", codigo: "GP-A-01", pai_id: "l1", ativo: true, ordem: 1 },
    { id: "l3", nome: "Estante de embalagens", codigo: "GP-B-02", pai_id: "l1", ativo: true, ordem: 2 },
    { id: "l4", nome: "Almoxarifado do escritório", codigo: "ESC", pai_id: null, ativo: true, ordem: 3 },
  ],
};

// ── Recebimento (/api/recebimento/compras) ───────────────────────────────────
const compra = (
  id: string, item_nome: string, status: string, extra: Record<string, unknown> = {},
) => ({
  id, item_nome, categoria: "Borrachas", unidade: "ch",
  estoque_item_id: "i1", hierarquia: "materia_prima",
  quantidade_comprada: 20, quantidade_recebida: 0,
  fornecedor: "Borrachas e Laminados do Nordeste Ltda.", fornecedor_id: "f1", local_id: "l2",
  estoque_erro: null, preco_unit: 87.9,
  codigo_rastreio: null, codigo_recebimento: "REC-0042", nota_fiscal: null, pedido_ref: null,
  palavra_chave: null, prioridade: "normal", previsao_entrega: iso(7, 20, 12, 0), status,
  solicitante: "Gustavo Lima", criado_por: "Teste", observacoes: null,
  comprado_em: iso(7, 8, 10, 0), created_at: iso(7, 8, 10, 0), updated_at: iso(7, 8, 10, 0),
  ...extra,
});

export const ESTOQUE_COMPRAS = {
  dashboard: { aguardando: 3, recebidosHoje: 1, divergencias: 1, parciais: 1, criticos: 2, abaixoMinimo: 4, comprasPendentes: 5, aGuardar: 2 },
  compras: [
    compra("c1", "Chapa de borracha laminada 500×700mm — 2,3mm", "aguardando_entrega", { prioridade: "critica", codigo_rastreio: "AA123456789BR" }),
    compra("c2", "Resina fotopolimerizável para clichê (galão 5L)", "chegou_parcial", { quantidade_comprada: 8, quantidade_recebida: 5, unidade: "L", preco_unit: 640 }),
    compra("c3", "Caixa de papelão kraft 12×8×4cm (pacote com 100)", "divergencia", { quantidade_comprada: 30, quantidade_recebida: 30, unidade: "pct", preco_unit: 45, observacoes: "Vieram 30 pacotes, mas 4 estavam rasgados no transporte." }),
    compra("c4", "Cabo de madeira torneado nº 4", "comprado", { quantidade_comprada: 500, preco_unit: 3.2 }),
    // A FILA DO CORREDOR, que não existia aqui: sem uma compra em `chegou` o
    // filtro "A guardar", a marca roxa no card e o bloco "Dar entrada no
    // estoque" nunca eram desenhados — ou seja, a parte nova da tela não tinha
    // como ser medida a 320px. `c6` é o banco de HOJE (sem
    // supabase/recebimento_v4.sql): status rebaixado e a frase com o número.
    compra("c5", "Tinta base d'água para clichê — cartucho 1kg", "chegou", {
      quantidade_comprada: 24, quantidade_recebida: 24, quantidade_guardada: 0, unidade: "un", preco_unit: 128,
      chegou_em: iso(7, 12, 9, 30), chegou_por: "Recepção",
    }),
    compra("c6", "Fita dupla face para montagem de clichê 500mm × 33m", "divergencia", {
      quantidade_comprada: 10, quantidade_recebida: 10, unidade: "rolo", preco_unit: 310,
      chegou_em: iso(7, 10, 16, 0), chegou_por: "Recepção",
      estoque_erro: "ninguém guardou ainda — faltam 6 para guardar; dê entrada pela aba Recebimento ou pelo totem do galpão",
    }),
  ],
};

// ── Etiquetas de um item (/api/estoque/unidades?item=…) ──────────────────────
export const ESTOQUE_UNIDADES = {
  contagem: { em_estoque: 42, consumido: 8, expedido: 3, perdido: 1, devolvido: 0 },
  unidades: Array.from({ length: 6 }, (_, i) => ({
    id: `u${i + 1}`,
    codigo: `PECCAR3814-${String(120 - i).padStart(6, "0")}`,
    seq: 120 - i,
    status: i === 5 ? "consumido" : "em_estoque",
    origem: "producao",
    criado_em: iso(7, 11 - (i % 3), 10, 0),
  })),
};

export const ESTOQUE_FICHA = { ficha: [] as unknown[] };

/**
 * Mapa da rede falsa. A ORDEM importa: o `RedeFalsa` casa por `startsWith`, e
 * `/api/estoque` é prefixo de `/api/estoque-itens` e de `/api/estoque/…`. A
 * chave genérica tem de vir por último, senão ela responde por todas.
 */
export const REDE_ESTOQUE: Record<string, Record<string, unknown>> = {
  "/api/estoque/conferencias/pendentes": ESTOQUE_PENDENTES,
  "/api/estoque/conferencias": ESTOQUE_CONFERENCIAS,
  "/api/estoque/producao-dia": ESTOQUE_PRODUCAO_DIA,
  "/api/estoque/fornecedores": ESTOQUE_FORNECEDORES,
  "/api/estoque/locais": ESTOQUE_LOCAIS,
  "/api/estoque/unidades": ESTOQUE_UNIDADES,
  "/api/estoque-itens": ESTOQUE_ITENS,
  "/api/recebimento/compras": ESTOQUE_COMPRAS,
  "/api/ficha-tecnica": ESTOQUE_FICHA,
  "/api/tridi/estoque": ESTOQUE_TRIDI,
};
