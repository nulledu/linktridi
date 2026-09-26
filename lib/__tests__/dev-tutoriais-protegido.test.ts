import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("prova da Central de Tutoriais", () => {
  it("tem as duas travas de desenvolvimento", () => {
    const raiz = process.cwd();
    expect(readFileSync(join(raiz, "middleware.ts"), "utf8")).toContain('"/dev-tutoriais"');
    expect(readFileSync(join(raiz, "app/dev-tutoriais/page.tsx"), "utf8")).toContain('if (process.env.NODE_ENV === "production") notFound();');
  });
});
