import { describe, it, expect } from "vitest";
import { fotoDoNossoBucket } from "../foto-aberta";

/**
 * Trava da ferramenta TEMPORÁRIA de faxina de fotos (/fotos-mercadinho e
 * /fotos-estoque).
 *
 * Aquelas telas são abertas a QUALQUER PESSOA LOGADA no Gaius — sem exigir a
 * área do mercadinho nem a do estoque. Foi uma escolha consciente: a faxina é
 * mutirão, e distribuir acesso ao mercadinho pra quem só vai fotografar
 * prateleira dá muito mais poder do que a tarefa pede.
 *
 * O que segura a abertura é a ESTREITEZA da rota: ela grava uma coluna só
 * (`imagem_url`) e o valor tem que ser uma URL do nosso Storage. Sem essa
 * segunda parte, "trocar a foto" viraria "apontar a foto do produto pra
 * qualquer endereço da internet" — e um endereço de fora pode mudar de
 * conteúdo DEPOIS de alguém aprovar a imagem.
 *
 * É um teste e não um comentário na rota porque a checagem é uma linha só: ela
 * cai fora numa refatoração distraída sem nada quebrar visivelmente, e o
 * estrago só apareceria no catálogo, semanas depois.
 */

const BASE = "https://exemplo.supabase.co";
const NOSSA = `${BASE}/storage/v1/object/public/photos/mercadinho/produtos/789.jpg`;

describe("faxina de fotos: só grava imagem do nosso bucket", () => {
  it("aceita a URL que o upload e a cópia do banco aberto produzem", () => {
    expect(fotoDoNossoBucket(NOSSA, BASE)).toEqual({ ok: true, url: NOSSA });
  });

  it("aceita tirar a foto (null e string vazia)", () => {
    expect(fotoDoNossoBucket(null, BASE)).toEqual({ ok: true, url: null });
    expect(fotoDoNossoBucket("", BASE)).toEqual({ ok: true, url: null });
  });

  it("recusa link de fora — é o ponto todo da trava", () => {
    for (const fora of [
      "https://site-qualquer.com/foto.jpg",
      "http://exemplo.supabase.co/storage/v1/object/public/photos/x.jpg",   // http, não https
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
    ]) {
      expect(fotoDoNossoBucket(fora, BASE), fora).toEqual({ ok: false });
    }
  });

  it("recusa um domínio que só COMEÇA parecido", () => {
    // `startsWith` num prefixo sem a barra final deixaria passar
    // "https://exemplo.supabase.co.invasor.com/…". A barra é o que fecha.
    expect(fotoDoNossoBucket(`${BASE}.invasor.com/storage/v1/object/public/x.jpg`, BASE)).toEqual({ ok: false });
  });

  it("recusa o que nem é texto", () => {
    for (const lixo of [123, {}, [], true, undefined]) {
      expect(fotoDoNossoBucket(lixo, BASE)).toEqual({ ok: false });
    }
  });

  it("sem base configurada NADA passa — não grava às cegas", () => {
    expect(fotoDoNossoBucket(NOSSA, "")).toEqual({ ok: false });
    // Tirar a foto continua valendo: não depende de saber qual é o bucket.
    expect(fotoDoNossoBucket(null, "")).toEqual({ ok: true, url: null });
  });
});
