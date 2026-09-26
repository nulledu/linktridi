// ── Anexos do Financeiro ─────────────────────────────────────────────────────
// Comprovante de pagamento, XML e PDF de nota, foto do bem.
//
// POR QUE NÃO USA `/api/upload`. Aquela rota é do resto do app e grava em
// bucket PÚBLICO (`photos`, `sounds`, `branding`, `chat`), devolvendo um link
// permanente. Serve para foto de perfil e imagem de produto — não serve para
// comprovante de pagamento: quem descobre o link abre o arquivo para sempre,
// sem sessão e sem permissão. O §17 pede anexo privado e autorizado por
// empresa.
//
// Aqui o arquivo mora num bucket privado, o banco guarda só o CAMINHO, e o link
// é assinado na hora — com validade curta — depois de conferir a área e a
// empresa de quem pediu.

import { compactarImagem } from "@/lib/armazenamento/compactar";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { chaveValida, novaChave } from "@/lib/armazenamento/referencia";
import { apagarPrivado, b2Configurado, enviarPrivado, urlAssinadaLeitura } from "@/lib/armazenamento/privado";

export const BUCKET = "financeiro";

// Desde set/2026 o anexo NOVO (comprovante, NF, foto do bem) vai pro Backblaze
// B2 e `caminho` guarda a chave `documentos/aaaa/mm/<id>.<ext>`. O que já está
// no bucket `financeiro` do Supabase fica lá — `chaveValida` separa os dois.
// Logo de marca continua no Supabase: é assinado em lote com cache e não é
// documento.

/** Quanto tempo o link assinado vale. Curto de propósito: ele vai parar no
 *  histórico do navegador e em qualquer lugar onde for colado. */
export const VALIDADE_SEGUNDOS = 300;

export const DONOS = ["compra", "nota", "compromisso", "patrimonio"] as const;
export type DonoDeAnexo = (typeof DONOS)[number];

/** 20 MB. XML de nota tem alguns KB; PDF de contrato raramente passa disso. */
export const TAMANHO_MAX = 20 * 1024 * 1024;

/**
 * O que aceita entrar.
 *
 * Lista fechada, não bloqueio de extensões perigosas: quem escreve "tudo menos
 * .exe" sempre esquece uma. O que o financeiro precisa anexar é documento e
 * imagem — nada executável tem por que estar aqui.
 */
const MIMES = new Set([
  "application/pdf",
  "application/xml", "text/xml",
  "image/jpeg", "image/png", "image/webp", "image/heic",
  "text/plain", "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function mimeAceito(mime: string): boolean {
  return MIMES.has((mime || "").toLowerCase());
}

/**
 * O tipo do arquivo quando o navegador não sabe dizer.
 *
 * XML de NF-e é o caso que motivou isto: baixado do portal da SEFAZ ou vindo
 * de um e-mail, o sistema operacional frequentemente não tem tipo registrado
 * para `.xml` e o `File.type` chega VAZIO — ou como `application/octet-stream`,
 * que é o "não sei" do protocolo. Nos dois casos a conferência recusava com
 * "Tipo de arquivo não aceito", justamente para o documento que o módulo mais
 * precisa guardar.
 *
 * A extensão só entra quando o navegador não afirmou nada. Se ele disse um
 * tipo, é ele que vale: aceitar a extensão por cima de um tipo declarado
 * deixaria renomear um executável para `.pdf` e passar.
 */
const POR_EXTENSAO: Record<string, string> = {
  xml: "application/xml", pdf: "application/pdf", csv: "text/csv", txt: "text/plain",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const VAZIO = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export function tipoDoArquivo(mime: string, nome: string): string {
  const declarado = (mime || "").toLowerCase();
  if (!VAZIO.has(declarado)) return declarado;
  const ext = (nome.split(".").pop() ?? "").toLowerCase();
  return POR_EXTENSAO[ext] ?? declarado;
}

/**
 * O nome que o arquivo terá NO BUCKET.
 *
 * Nunca o nome que o usuário mandou: nome de arquivo vindo de fora carrega
 * `../`, barra, byte nulo e acento que o storage rejeita. O nome original é
 * guardado no BANCO, para a tela mostrar; o caminho é montado por nós.
 */
export function caminhoDoAnexo(empresaId: string, tipo: DonoDeAnexo, ownerId: string, nomeOriginal: string): string {
  const ext = (nomeOriginal.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const aleatorio = crypto.randomUUID();
  // A empresa é o primeiro segmento: se um dia alguém errar a conferência na
  // rota, ainda dá para auditar e limpar por empresa sem ler o banco inteiro.
  return `${empresaId}/${tipo}/${ownerId}/${aleatorio}.${ext}`;
}

export interface Anexo {
  id: string; empresa_id: string; owner_tipo: string; owner_id: string;
  nome: string; caminho: string | null; url: string | null;
  mime: string | null; tamanho: number | null; created_at: string;
}

const db = () => createSupabaseAdminClient();

/** Sobe o arquivo e registra a linha. Devolve o anexo criado. */
export async function guardarAnexo(entrada: {
  empresaId: string; tipo: DonoDeAnexo; ownerId: string;
  nome: string; mime: string; bytes: ArrayBuffer; tamanho: number; autorId: string;
}): Promise<{ ok: true; anexo: Anexo } | { ok: false; erro: string }> {
  // O tipo é resolvido ANTES de conferir: XML de NF-e chega sem `File.type` em
  // boa parte dos sistemas, e recusá-lo seria barrar o documento principal.
  let mime = tipoDoArquivo(entrada.mime, entrada.nome);
  if (!mimeAceito(mime)) {
    return { ok: false, erro: "Tipo de arquivo não aceito. Envie PDF, XML, imagem ou planilha." };
  }
  if (entrada.tamanho > TAMANHO_MAX) {
    return { ok: false, erro: "Arquivo acima de 20 MB." };
  }
  // Foto de comprovante/bem entra compactada (WebP ≤1600px); PDF, XML e
  // planilha passam intocados. O nome ganha .webp junto com o conteúdo.
  const c = await compactarImagem(entrada.bytes, mime, entrada.nome);
  if (c.mime !== mime) {
    const bytes = c.corpo as Uint8Array;
    entrada = { ...entrada, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, nome: c.caminho, tamanho: bytes.byteLength };
    mime = c.mime;
  }

  const noB2 = b2Configurado();
  let caminho = noB2
    ? novaChave("documentos", entrada.nome, mime)
    : caminhoDoAnexo(entrada.empresaId, entrada.tipo, entrada.ownerId, entrada.nome);

  if (noB2) {
    try {
      caminho = await enviarPrivado(caminho, entrada.bytes, mime);
    } catch (e) {
      return { ok: false, erro: String((e as Error)?.message ?? e) || "Não foi possível enviar o arquivo." };
    }
  } else {
    const { error: erroUpload } = await db().storage
      .from(BUCKET)
      .upload(caminho, entrada.bytes, { contentType: mime, upsert: false });
    if (erroUpload) {
      const msg = erroUpload.message ?? "";
      if (msg.toLowerCase().includes("bucket") && msg.toLowerCase().includes("not found")) {
        return { ok: false, erro: "O bucket privado do Financeiro ainda não existe. Rode supabase/financeiro.sql." };
      }
      return { ok: false, erro: msg || "Não foi possível enviar o arquivo." };
    }
  }

  const { data, error } = await db()
    .from("fin_anexos")
    .insert({
      empresa_id: entrada.empresaId,
      owner_tipo: entrada.tipo,
      owner_id: entrada.ownerId,
      nome: entrada.nome.slice(0, 200),
      caminho,
      mime,
      tamanho: entrada.tamanho,
      created_by: entrada.autorId,
    })
    .select("id,empresa_id,owner_tipo,owner_id,nome,caminho,url,mime,tamanho,created_at")
    .maybeSingle();

  if (error || !data) {
    // O arquivo já subiu e a linha não nasceu: sem esta limpeza sobra lixo no
    // bucket que ninguém sabe de quem é — não aparece em tela nenhuma e conta
    // no armazenamento para sempre.
    await removerArquivo(caminho);
    return { ok: false, erro: error?.message ?? "Não foi possível registrar o anexo." };
  }

  return { ok: true, anexo: data as Anexo };
}

/** Os anexos de UMA linha, já com o link assinado. */
export async function anexosDe(
  empresaId: string, tipo: DonoDeAnexo, ownerId: string,
): Promise<(Anexo & { link: string | null })[]> {
  try {
    const { data, error } = await db()
      .from("fin_anexos")
      .select("id,empresa_id,owner_tipo,owner_id,nome,caminho,url,mime,tamanho,created_at")
      .eq("empresa_id", empresaId)
      .eq("owner_tipo", tipo)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];

    const linhas = (data ?? []) as Anexo[];
    return Promise.all(linhas.map(async (a) => ({ ...a, link: await linkAssinado(a) })));
  } catch {
    return [];
  }
}

/**
 * O link temporário. `null` quando não dá para gerar — a tela mostra o anexo
 * como "indisponível" em vez de um botão que leva a lugar nenhum.
 */
export async function linkAssinado(a: Pick<Anexo, "caminho" | "url" | "nome">): Promise<string | null> {
  if (!a.caminho) return a.url ?? null;   // anexo antigo, de bucket público
  try {
    if (chaveValida(a.caminho)) return await urlAssinadaLeitura(a.caminho, VALIDADE_SEGUNDOS, { nome: a.nome });
    const { data } = await db().storage.from(BUCKET).createSignedUrl(a.caminho, VALIDADE_SEGUNDOS);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Apaga o arquivo onde quer que ele more; nunca lança. */
async function removerArquivo(caminho: string): Promise<void> {
  try {
    if (chaveValida(caminho)) await apagarPrivado(caminho);
    else await db().storage.from(BUCKET).remove([caminho]);
  } catch { /* órfão no storage é chato, não grave */ }
}

/** Apaga a linha E o arquivo. */
export async function apagarAnexo(
  id: string, empresaId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const { data } = await db()
    .from("fin_anexos")
    .select("id,empresa_id,caminho")
    .eq("id", id)
    .maybeSingle();

  if (!data) return { ok: false, erro: "Anexo não encontrado." };
  // A empresa vem do BANCO, não do pedido: sem isto, quem tem o Financeiro da
  // Gedux apagaria o comprovante da Tridi mandando o id certo.
  if ((data as { empresa_id: string }).empresa_id !== empresaId) {
    return { ok: false, erro: "Anexo de outra empresa." };
  }

  const caminho = (data as { caminho: string | null }).caminho;
  const { error } = await db().from("fin_anexos").delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };

  // O arquivo sai DEPOIS da linha. Se a remoção do storage falhar, sobra um
  // arquivo órfão — chato, mas invisível. Na ordem inversa sobraria uma linha
  // apontando para um arquivo que já não existe, e aí a tela mostra um anexo
  // que não abre.
  if (caminho) await removerArquivo(caminho);
  return { ok: true };
}

/**
 * Assina os logos de marca (empresa, conta) para a tela.
 *
 * O banco guarda o CAMINHO no bucket privado, nunca a URL — link assinado
 * vence em minutos, e uma coluna cheia de link morto é pior que coluna vazia.
 * Quem assina é o servidor, a cada render.
 *
 * A validade aqui é MAIOR que a dos anexos (uma hora, não cinco minutos): logo
 * de banco aparece na barra lateral e em toda listagem, e um link que vence no
 * meio da sessão deixaria o ícone sumir enquanto a pessoa trabalha. Não é dado
 * sigiloso — é a logomarca do Itaú.
 */
const VALIDADE_MARCA = 60 * 60;

/**
 * Links assinados lembrados no processo por 45 min (valem 60).
 *
 * Assinar é uma ida ao storage — 400–700 ms daqui — e acontecia em TODA tela
 * com logo, para os MESMOS arquivos de sempre. Agora só o que ainda não foi
 * assinado (ou já envelheceu) viaja; o resto sai da memória na hora. Quem
 * troca ou remove uma marca chama `esquecerLogo(caminho)`.
 */
const ASSINADOS = new Map<string, { url: string; ate: number }>();
const REUSAR_ASSINATURA_MS = 45 * 60 * 1000;

export function esquecerLogo(caminho: string | null | undefined) {
  if (caminho) ASSINADOS.delete(caminho);
}

export async function assinarLogos(caminhos: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos.filter((c): c is string => !!c))];
  const out = new Map<string, string>();
  if (!unicos.length) return out;

  const agora = Date.now();
  const faltam: string[] = [];
  for (const c of unicos) {
    const lembrado = ASSINADOS.get(c);
    if (lembrado && lembrado.ate > agora) out.set(c, lembrado.url);
    else faltam.push(c);
  }
  if (!faltam.length) return out;

  try {
    const { data, error } = await db().storage.from(BUCKET).createSignedUrls(faltam, VALIDADE_MARCA);
    // Falhar aqui é MUDO na tela: sem link, a marca cai no ícone de reserva e
    // fica indistinguível de "esta empresa nunca teve logo". Quem subiu a
    // imagem lê isso como "a foto não subiu" — e o botão de remover, que só
    // aparece quando há logo, some junto, virando "não consigo excluir".
    // Os dois sintomas com uma causa invisível. Por isso o erro é registrado:
    // não dá para consertar o que nunca aparece em lugar nenhum.
    if (error) console.error("[financeiro] não deu para assinar logos:", error.message, faltam);
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        out.set(item.path, item.signedUrl);
        ASSINADOS.set(item.path, { url: item.signedUrl, ate: agora + REUSAR_ASSINATURA_MS });
      } else {
        // Um caminho gravado no banco cujo arquivo sumiu do bucket. A tela
        // segue com o ícone (nunca uma imagem quebrada), mas o registro fica.
        console.error("[financeiro] logo sem assinatura:", item.path, item.error ?? "");
      }
    }
  } catch (e) {
    console.error("[financeiro] storage indisponível ao assinar logos:", e);
  }
  return out;
}

// ── Logo de marca (empresa, conta) ───────────────────────────────────────────

/** Imagem, e pequena: é um ícone de app de banco, não um contrato. */
const MIMES_LOGO = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
const TAMANHO_MAX_LOGO = 2 * 1024 * 1024;   // 2 MB

/**
 * O que pode ter cara própria: empresa, banco/gateway, fornecedor, contato.
 *
 * A tabela de cada um é derivada daqui (`TABELA_DA_MARCA`) em vez de a rota
 * receber o nome da tabela do cliente — mandar `tabela` no corpo seria deixar
 * quem chama escolher onde escrever.
 */
export const TIPOS_DE_MARCA = ["empresa", "conta", "fornecedor", "contato", "colaborador", "recorrencia", "patrimonio"] as const;
export type TipoDeMarca = (typeof TIPOS_DE_MARCA)[number];

export const TABELA_DA_MARCA: Record<TipoDeMarca, string> = {
  empresa: "fin_empresas",
  conta: "fin_contas",
  fornecedor: "fin_fornecedores",
  contato: "fin_contatos",
  colaborador: "fin_colaboradores",
  recorrencia: "fin_recorrencias",
  // O bem é a única coisa da lista que existe fisicamente — e é onde a foto
  // mais serve: a descrição do modelo não distingue os três monitores iguais.
  patrimonio: "fin_patrimonio",
};

/**
 * Sobe o logo e devolve o CAMINHO — nunca a URL. Quem grava `logo_url` na
 * tabela é a rota, depois desta função responder; ela só cuida do bucket.
 *
 * O caminho é sempre NOVO (uuid), mesmo trocando o logo de quem já tinha um.
 * Isso custa um arquivo órfão no bucket a cada troca — aceitável, porque
 * sobrescrever no mesmo caminho faria o link assinado antigo (que pode estar
 * em cache no navegador de alguém, válido por até uma hora) mostrar a imagem
 * NOVA sob o nome da empresa ERRADA pelo tempo que durar o cache.
 */
export async function guardarLogo(entrada: {
  tipo: TipoDeMarca; id: string; nome: string; mime: string; bytes: ArrayBuffer; tamanho: number;
}): Promise<{ ok: true; caminho: string } | { ok: false; erro: string }> {
  if (!MIMES_LOGO.has((entrada.mime || "").toLowerCase())) {
    return { ok: false, erro: "Envie uma imagem (JPG, PNG, WEBP ou SVG)." };
  }
  if (entrada.tamanho > TAMANHO_MAX_LOGO) {
    return { ok: false, erro: "Imagem acima de 2 MB." };
  }

  const ext = (entrada.nome.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "png";
  const c = await compactarImagem(entrada.bytes, entrada.mime, `logos/${entrada.tipo}/${entrada.id}/${crypto.randomUUID()}.${ext}`);
  const caminho = c.caminho;

  const { error } = await db().storage
    .from(BUCKET)
    .upload(caminho, c.corpo, { contentType: c.mime, upsert: false });
  if (error) {
    // Bucket sem o prefixo "logos/" liberado no Supabase antes do primeiro
    // upload — mesma situação tolerada que o resto do módulo: erra, não explode.
    return { ok: false, erro: error.message || "Não deu para salvar a imagem." };
  }
  return { ok: true, caminho };
}
