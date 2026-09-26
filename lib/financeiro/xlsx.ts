// ── Planilha .xlsx sem biblioteca ────────────────────────────────────────────
// Um .xlsx é um ZIP com meia dúzia de XMLs. Este escritor faz o mínimo que o
// Excel, o Numbers e o Google Planilhas abrem sem reclamar: uma aba, células
// de texto (inlineStr) e de número, sem estilo. Entradas "stored" (sem
// compressão) com CRC-32 — o formato aceita, e assim não há dependência.
//
// Existe porque a folha precisa sair em Excel ("exportar em CSV ou xlsx") e
// puxar uma biblioteca de 1 MB pra escrever vinte linhas por mês não se paga.
// Pura, coberta em lib/__tests__/xlsx.test.ts.

export type CelulaXLSX = string | number | null | undefined;

export interface ColunaXLSX<T> {
  cabecalho: string;
  valor: (linha: T) => CelulaXLSX;
}

const XML = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "A", "B", …, "Z", "AA", … */
export function letraDaColuna(indice: number): string {
  let n = indice + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** O XML da aba: cabeçalho em negrito não existe (sem estilos), só dados. */
export function xmlDaAba<T>(linhas: T[], colunas: ColunaXLSX<T>[]): string {
  const celula = (ref: string, v: CelulaXLSX) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${XML(String(v))}</t></is></c>`;
  };
  const linha = (n: number, valores: CelulaXLSX[]) =>
    `<row r="${n}">${valores.map((v, i) => celula(`${letraDaColuna(i)}${n}`, v)).join("")}</row>`;
  const corpo = [
    linha(1, colunas.map((c) => c.cabecalho)),
    ...linhas.map((l, i) => linha(i + 2, colunas.map((c) => c.valor(l)))),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${corpo}</sheetData></worksheet>`;
}

// ── ZIP (stored) ─────────────────────────────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStored(arquivos: { nome: string; conteudo: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = enc.encode(a.conteudo);
    const crc = crc32(dados);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nome.length), ...u16(0),
      ...nome, ...dados,
    ]);
    const central = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nome.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nome,
    ]);
    locais.push(local); centrais.push(central);
    offset += local.length;
  }
  const tamCentral = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(arquivos.length), ...u16(arquivos.length),
    ...u32(tamCentral), ...u32(offset), ...u16(0),
  ]);
  const total = offset + tamCentral + fim.length;
  const saida = new Uint8Array(total);
  let p = 0;
  for (const b of [...locais, ...centrais, fim]) { saida.set(b, p); p += b.length; }
  return saida;
}

/** O arquivo inteiro, pronto pra virar Blob. `aba` é o nome da planilha. */
export function montarXLSX<T>(linhas: T[], colunas: ColunaXLSX<T>[], aba = "Folha"): Uint8Array {
  const nomeAba = XML(aba.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return zipStored([
    { nome: "[Content_Types].xml", conteudo:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      + `</Types>` },
    { nome: "_rels/.rels", conteudo:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>` },
    { nome: "xl/workbook.xml", conteudo:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheets><sheet name="${nomeAba}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nome: "xl/_rels/workbook.xml.rels", conteudo:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
      + `</Relationships>` },
    { nome: "xl/worksheets/sheet1.xml", conteudo: xmlDaAba(linhas, colunas) },
  ]);
}
