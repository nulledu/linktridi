import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { assinarEnvioPublico, b2PublicoConfigurado } from "@/lib/armazenamento/publico";
import {
  ACEITE_MIDIA_TUTORIAL, TETO_MIDIA_TUTORIAL, caminhoMidiaTutorial, classificarMidiaTutorial,
} from "@/lib/tridiflow-tutoriais-upload";

export const dynamic = "force-dynamic";

// Desde 24/09/2026 o envio vai pro bucket PÚBLICO do B2, com tamanho E tipo
// dentro da assinatura (assinarEnvioPublico) — a trava abaixo é a da reserva,
// quando as variáveis B2_PUBLICO_* não existem.
//
// Bucket PÚBLICO do Supabase (foto e vídeo de tutorial são o que o cliente precisa ver sem
// login), e
// SÓ dos tutoriais. A URL assinada do Supabase não amarra tipo nem tamanho: o
// `Content-Type` gravado é o do PUT, e quem tem a assinatura escolhe. Pedia-se
// a assinatura pra `image/jpeg` e subia-se um SVG com <script>, um HTML ou 50
// MB de vídeo, que o Storage servia público com o tipo escolhido no PUT. Quem
// barra agora é a regra do próprio bucket, que o Storage confere no PUT. O
// `photos` de sempre não pode ganhar essa trava: ele guarda a foto de produto,
// a do ponto e a do recebimento.
const BUCKET = "tutoriais";

// A regra sai da mesma tabela do editor: formato ou teto novo em
// lib/tridiflow-tutoriais-upload.ts chega ao bucket sem ninguém abrir o painel
// do Supabase. O bucket só tem UM teto, então vale o maior (o do vídeo).
const REGRA_DO_BUCKET = {
  public: true,
  allowedMimeTypes: ACEITE_MIDIA_TUTORIAL.qualquer.split(","),
  fileSizeLimit: Math.max(...Object.values(TETO_MIDIA_TUTORIAL)),
};

type Db = ReturnType<typeof createSupabaseAdminClient>;
type BucketLido = { public?: boolean; file_size_limit?: number | string | null; allowed_mime_types?: string[] | null };

function regraConfere(b: BucketLido): boolean {
  const tipos = new Set(b.allowed_mime_types ?? []);
  return b.public === true
    && Number(b.file_size_limit) === REGRA_DO_BUCKET.fileSizeLimit
    && tipos.size === REGRA_DO_BUCKET.allowedMimeTypes.length
    && REGRA_DO_BUCKET.allowedMimeTypes.every((t) => tipos.has(t));
}

async function conferirBucket(db: Db): Promise<boolean> {
  const { data }: { data: BucketLido | null } = await db.storage.getBucket(BUCKET);
  if (data && regraConfere(data)) return true;
  // Primeiro envio depois do deploy: o bucket nasce aqui, já com a regra — sem
  // SQL pra alguém esquecer de rodar (o mesmo do `ponto-selfies` em /api/ponto/bater).
  if (!data && !(await db.storage.createBucket(BUCKET, REGRA_DO_BUCKET)).error) return true;
  // Regra afrouxada no painel volta a valer; e a instância fria que perdeu a
  // corrida do `createBucket` pra outra cai aqui e reaplica a mesma regra.
  return !(await db.storage.updateBucket(BUCKET, REGRA_DO_BUCKET)).error;
}

// Uma conferência por instância: a regra só muda com deploy, e uma ida a mais
// ao Storage em todo envio seria latência à toa. Se falhou, a promessa é
// esquecida — a próxima tentativa confere de novo, em vez de a instância ficar
// presa num erro passageiro.
let bucketPronto: Promise<boolean> | null = null;
function garantirBucket(db: Db): Promise<boolean> {
  bucketPronto ??= conferirBucket(db).catch(() => false).then((ok) => {
    if (!ok) bucketPronto = null;
    return ok;
  });
  return bucketPronto;
}

/**
 * POST /api/tridiflow/tutoriais/upload-url { mime, tamanho } → { signedUrl, publicUrl, tipo }
 *
 * URL ASSINADA pro editor subir foto, GIF e vídeo DIRETO ao Storage. A rota
 * antiga (`/tutoriais/upload`) recebia o arquivo num FormData, e a função da
 * Vercel corta o corpo em ~4,5 MB: o vídeo gravado no celular falhava em
 * produção sem nunca chegar ao Storage. Aqui o servidor só confere e dá a
 * permissão; os bytes vão do navegador pro Storage sem passar pela função (nem
 * pagar a CPU dela durante o envio).
 *
 * Duas conferências, cada uma com seu papel. `classificarMidiaTutorial` repete
 * a do editor sobre o que o navegador DECLARA (`{ mime, tamanho }`): devolve a
 * mensagem que diz como resolver e escolhe a extensão do caminho. Os bytes e o
 * tipo gravado vêm do PUT, e esses quem barra é a regra do bucket (acima).
 * `"qualquer"` porque quem sabe se o campo é de foto ou de vídeo é a tela.
 *
 * Limite conhecido: o bucket tem um teto só, o do vídeo. Quem declara uma foto
 * de 1 MB e manda uma de 15 MB consegue — mídia da lista, nunca outro tipo, e
 * nunca acima do teto do vídeo. A rota exige a chave dos Tutoriais, então quem
 * pede é colaborador com permissão dada de propósito, não visitante. Amarrar o
 * tamanho exato é o caminho do B2, que põe o `content-length` na assinatura
 * (lib/armazenamento/privado.ts).
 */
export async function POST(req: NextRequest) {
  // Mesma chave da tela e de toda escrita da central (lib/tridiflow-tutoriais-db.ts).
  if (!(await getProfileForAnyModule("marketing", "tridiflow:tutoriais"))) {
    return NextResponse.json({ error: "Sua conta não tem acesso aos Tutoriais." }, { status: 403 });
  }
  const b = ((await req.json().catch(() => null)) ?? {}) as { mime?: unknown; tamanho?: unknown };
  const c = classificarMidiaTutorial(String(b.mime ?? ""), Number(b.tamanho ?? 0), "qualquer");
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: 400 });

  const caminho = caminhoMidiaTutorial(c.ext);
  const falhou = () =>
    NextResponse.json({ error: "Não deu pra preparar o envio agora. Tente de novo em instantes." }, { status: 502 });
  if (b2PublicoConfigurado()) {
    try {
      const { signedUrl, publicUrl } = await assinarEnvioPublico(caminho, Number(b.tamanho), BUCKET, String(b.mime));
      return NextResponse.json({ signedUrl, publicUrl, tipo: c.tipo });
    } catch { return falhou(); }
  }
  const db = createSupabaseAdminClient();
  // Sem a regra do bucket confirmada, a assinatura seria cheque em branco:
  // melhor a pessoa tentar de novo em instantes do que subir sem trava.
  if (!(await garantirBucket(db))) return falhou();
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error || !data) return falhou();
  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);
  return NextResponse.json({ signedUrl: data.signedUrl, publicUrl: pub.publicUrl, tipo: c.tipo });
}
