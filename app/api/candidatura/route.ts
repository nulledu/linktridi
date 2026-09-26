import { NextResponse } from "next/server";
import { b2Configurado, existePrivado } from "@/lib/armazenamento/privado";
import { areaDaChave, chaveValida, urlPrivada } from "@/lib/armazenamento/referencia";
import {
  configCrua, enviouRecentemente, lerFormulario, listarVagas, receberCandidato, registrarErroDeRecepcao,
} from "@/lib/rh/curriculos/dados";
import {
  JANELA_REENVIO_H, limparRespostas, pendenciaDoEnvio, perfilDoCandidato, respostasLegiveis, rotuloDe, soDigitos,
  type Pergunta,
} from "@/lib/rh/curriculos/formulario";
import { inicioValido } from "@/lib/rh/curriculos/token";
import type { CurriculoAnexo } from "@/lib/rh/curriculos/tipos";

export const dynamic = "force-dynamic";

// PÚBLICO — o envio final do formulário de candidatura (/candidatura).
// POST { inicio, respostas: { [pergunta]: string | string[] }, arquivos: { [pergunta]: { chave, nome } }, vaga_id? }
//
// A config do formulário é lida AQUI, do banco, e a validação é a mesma
// função do navegador (`pendenciaDoEnvio`) — com as condições: a pergunta de
// estudo só é exigida de quem disse que estuda. Resposta de pergunta
// escondida é descartada (`limparRespostas`). Cada arquivo é conferido no B2
// (HEAD) antes de ser gravado: link pra arquivo que não existe não entra.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  if (!inicioValido(corpo.inicio)) return NextResponse.json({ erro: "Sua sessão expirou. Recarregue a página e envie de novo." }, { status: 403 });

  const [{ dados: cfgIntegracao }, { dados: form }, { dados: vagas }] = await Promise.all([configCrua(), lerFormulario(), listarVagas()]);
  if (cfgIntegracao && cfgIntegracao.formulario_ativo === false) return NextResponse.json({ erro: "O formulário está fechado no momento." }, { status: 503 });
  const cfg = form.config;

  // Vaga: a do link (/candidatura?vaga=…), se estiver aberta; senão a padrão.
  // As perguntas da vaga só valem quando ela veio pelo link.
  let vaga_id: string | null = cfgIntegracao?.vaga_padrao_id ?? null;
  let daVaga: Pergunta[] = [];
  if (typeof corpo.vaga_id === "string" && UUID.test(corpo.vaga_id)) {
    const v = vagas.find((x) => x.id === corpo.vaga_id && x.status === "aberta");
    if (v) { vaga_id = v.id; daVaga = v.perguntas ?? []; }
  }
  const tituloVaga = vagas.find((v) => v.id === vaga_id)?.titulo ?? null;

  // Os arquivos viram a resposta das perguntas de upload (a chave do B2).
  const arquivosBrutos = (corpo.arquivos && typeof corpo.arquivos === "object" ? corpo.arquivos : {}) as Record<string, unknown>;
  const brutas = { ...((corpo.respostas && typeof corpo.respostas === "object" ? corpo.respostas : {}) as Record<string, unknown>) };
  const nomes: Record<string, string> = {};
  for (const [id, a] of Object.entries(arquivosBrutos)) {
    const x = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    if (typeof x.chave === "string") brutas[id] = x.chave;
    if (typeof x.nome === "string") nomes[id] = x.nome.slice(0, 200);
  }

  const r = limparRespostas(cfg, brutas, daVaga);
  const pendencia = pendenciaDoEnvio(cfg, r, daVaga);
  if (pendencia) return NextResponse.json({ erro: pendencia }, { status: 400 });

  const nome = String(r.nome ?? "").trim();
  const email = String(r.email ?? "").trim().toLowerCase();
  const telefone = soDigitos(String(r.telefone ?? ""));
  const cidade = String(r.cidade ?? "").trim() || null;

  // Uma candidatura por pessoa a cada 24 h. O mesmo e-mail ou WhatsApp de
  // novo dentro da janela é reenvio, não candidato novo.
  if (await enviouRecentemente(email || null, telefone || null, JANELA_REENVIO_H)) {
    return NextResponse.json({ erro: `Já recebemos a sua candidatura. Espere ${JANELA_REENVIO_H} horas para enviar outra.`, repetida: true }, { status: 429 });
  }

  // Arquivos: chave da área `curriculos`, existente no B2.
  if (!b2Configurado()) return NextResponse.json({ erro: "Armazenamento indisponível. Tente mais tarde." }, { status: 503 });
  const uploads = [...cfg.perguntas, ...daVaga].filter((p) => p.tipo === "upload" && typeof r[p.id] === "string");
  let curriculo: CurriculoAnexo | null = null;
  const anexos: CurriculoAnexo[] = [];
  for (const p of uploads) {
    const chave = String(r[p.id]);
    if (!chaveValida(chave) || areaDaChave(chave) !== "curriculos") return NextResponse.json({ erro: `${p.titulo}: envie o arquivo antes de concluir.` }, { status: 400 });
    const existe = await existePrivado(chave).catch(() => null);
    if (!existe) return NextResponse.json({ erro: `${p.titulo}: o arquivo não chegou. Tente enviar de novo.` }, { status: 400 });
    const anexo: CurriculoAnexo = {
      chave, url: urlPrivada(chave), nome: nomes[p.id] || chave.split("/").pop()!,
      tipo: existe.mime || "application/octet-stream", tamanho: existe.tamanho || 0, enviado_em: new Date().toISOString(),
    };
    if (p.id === "curriculo") curriculo = anexo; else anexos.push(anexo);
  }

  const perguntaDe = (id: string) => [...cfg.perguntas, ...daVaga].find((p) => p.id === id);
  const rot = (id: string) => { const p = perguntaDe(id); return p ? rotuloDe(p, r[id]) || null : null; };

  const gravado = await receberCandidato({
    nome, email: email || null, telefone: telefone || null, cidade, vaga_id,
    origem: "tridiflow",
    origem_detalhe: { fonte: "formulario", formulario: "candidatura-tridi", versao: 2 },
    externo_id: null,
    respostas: respostasLegiveis(cfg, r, daVaga, nomes),
    curriculo,
    // As respostas cruas (valor, não rótulo) ficam em `dados`: é o que deixa
    // refazer a triagem se as regras mudarem.
    dados: {
      respostas: r,
      ...(anexos.length ? { anexos } : {}),
      como_conheceu: rot("como_conheceu"),
      conhece_alguem: r.conhece_alguem === "sim" ? String(r.conhece_quem ?? "") || "sim" : null,
    },
    perfil: perfilDoCandidato(cfg, r, { daVaga, vaga: tituloVaga, temCurriculo: !!curriculo }),
    recebido_em: new Date().toISOString(),
  }, "formulário de candidatura");

  if ("erro" in gravado) {
    await registrarErroDeRecepcao(`formulário: ${gravado.erro}`);
    return NextResponse.json({ erro: "Não foi possível gravar sua candidatura. Tente de novo em instantes." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
