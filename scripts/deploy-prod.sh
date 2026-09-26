#!/usr/bin/env bash
# Deploy de produção MANUAL — só roda quando o dono pede.
#
# O push na `main` não publica mais (vercel.json → git.deploymentEnabled.main
# = false): em set/2026 cada push virava um build de ~200 páginas e o Build CPU
# Minutes sozinho passou do crédito do mês. Aqui o build roda NESTA máquina e a
# Vercel só recebe o resultado pronto (--prebuilt), então não cobra build.
#
#   npm run deploy:prod            # testa, compila local e publica
#   npm run deploy:prod -- --remoto  # compila na Vercel (1 build cobrado)
#
# Primeira vez: `npx vercel login` + `npx vercel link` na conta
# sistemaempreendedores (projeto do ERP, não o do linktridi).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .vercel/project.json ]; then
  echo "Projeto não vinculado. Rode: npx vercel login && npx vercel link" >&2
  exit 1
fi

echo "› testes e tipos"
npm test
npx tsc --noEmit

if [ "${1:-}" = "--remoto" ]; then
  echo "› deploy com build na Vercel"
  npx vercel deploy --prod --archive=tgz
  exit 0
fi

echo "› variáveis de produção"
npx vercel pull --yes --environment=production
# Variável "Sensitive" na Vercel desce VAZIA no pull. Build local com ela vazia
# grava NEXT_PUBLIC_SUPABASE_URL="" no bundle e TODA rota do banco dá 500
# ("Invalid supabaseUrl") — foi o que derrubou produção em 24/09/2026.
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if ! grep -qE "^$v=\"?[^\"[:space:]]" .vercel/.env.production.local 2>/dev/null; then
    echo "✗ $v veio vazia do vercel pull (variável Sensitive?). Build local sairia quebrado." >&2
    echo "  Use: npm run deploy:prod -- --remoto" >&2
    exit 1
  fi
done
echo "› build local"
npx vercel build --prod
echo "› publicando o build pronto"
npx vercel deploy --prebuilt --prod
