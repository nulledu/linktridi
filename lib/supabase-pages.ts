export interface SupabasePage<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** Lê respostas PostgREST além do teto padrão de 1.000 linhas. */
export async function readSupabasePages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<SupabasePage<T>>,
  maxRows: number,
  pageSize = 1_000,
): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const data: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(maxRows - 1, from + pageSize - 1);
    const page = await fetchPage(from, to);
    if (page.error) return { data, error: page.error, truncated: false };
    const rows = page.data ?? [];
    data.push(...rows);
    if (rows.length < to - from + 1) return { data, error: null, truncated: false };
  }
  return { data, error: null, truncated: true };
}
