// ── Config do Design (Supabase novo, tabela design_config id=1, jsonb data).
// Guarda quais TIPOS de item podem aparecer na tela de "não aprovadas" — ou seja,
// o que é personalizável (passa por arte/vetor e pode ser reprovado). Editável só
// pelo admin. Tolerante à ausência da tabela (cai no padrão).

import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Todos os tipos que o classificador (lib/logistica tipoItem) reconhece.
export const TODOS_TIPOS = [
  "Carimbo", "Chancela", "Sinete", "Clichê", "Letreiro 3D", "Logo Iluminada",
  "Placa Pix", "Rede social", "Decorativo", "Almofada", "Tinta", "Etiqueta", "Brinde", "Outro",
];

// Padrão: só o que realmente tem arte pra personalizar (e portanto reprovar).
export const DEFAULT_TIPOS_PERSONALIZAVEIS = [
  "Carimbo", "Chancela", "Sinete", "Clichê", "Letreiro 3D", "Logo Iluminada", "Placa Pix", "Rede social",
];

export interface DesignConfig { tiposPersonalizaveis: string[] }

export async function getDesignConfig(): Promise<DesignConfig> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("design_config").select("data").eq("id", 1).maybeSingle();
    const d = (data?.data as Partial<DesignConfig>) || {};
    const list = Array.isArray(d.tiposPersonalizaveis)
      ? d.tiposPersonalizaveis.filter((x): x is string => typeof x === "string")
      : null;
    return { tiposPersonalizaveis: list && list.length ? list : [...DEFAULT_TIPOS_PERSONALIZAVEIS] };
  } catch {
    return { tiposPersonalizaveis: [...DEFAULT_TIPOS_PERSONALIZAVEIS] };
  }
}

export async function setDesignConfig(cfg: DesignConfig): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("design_config").upsert({ id: 1, data: cfg });
  if (error) throw new Error(error.message);
}
