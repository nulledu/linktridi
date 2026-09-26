#!/usr/bin/env bash
# Atualiza o servidor dos chats com a última versão do código.
#   sudo bash /opt/chats/app/scripts/atualizar-chats.sh
set -euo pipefail
APP=/opt/chats/app
[[ $EUID -eq 0 ]] || { echo "Rode com sudo."; exit 1; }

cd "$APP"
sudo -u chats git pull --ff-only
sudo -u chats npm ci --silent
sudo -u chats npm run build
sudo -u chats pm2 restart chats
sleep 3

got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/painel || echo 000)
if [[ "$got" == "404" ]]; then
  printf '\033[32mAtualizado. Isolamento continua ok (painel → 404).\033[0m\n'
else
  printf '\033[31mATENÇÃO: /painel respondeu %s (era pra ser 404). Confira APENAS_PLAYER no .env.production.\033[0m\n' "$got"
fi
