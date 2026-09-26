#!/usr/bin/env bash
# Instala o servidor dos chats (player do TridiFlow) num VPS Ubuntu novo.
#
#   sudo bash instalar-chats.sh gedux.com.br https://tridigaius.vercel.app
#
# Deixa o servidor SEM NENHUM SEGREDO: ele só mostra o chat e busca os dados no
# Gaius. Não guarda chave do banco nem token da Meta.
set -euo pipefail

DOMINIO="${1:-}"
GAIUS="${2:-}"
REPO="${REPO:-}"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
passo()    { printf '\n\033[1;35m→ %s\033[0m\n' "$*"; }

if [[ -z "$DOMINIO" || -z "$GAIUS" ]]; then
  vermelho "Faltou informação."
  echo "Uso:  sudo bash instalar-chats.sh SEU-DOMINIO ENDERECO-DO-GAIUS"
  echo "Ex.:  sudo bash instalar-chats.sh gedux.com.br https://tridigaius.vercel.app"
  exit 1
fi
[[ $EUID -eq 0 ]] || { vermelho "Rode com sudo."; exit 1; }

if [[ -z "$REPO" ]]; then
  vermelho "Falta dizer de onde baixar o código."
  echo "Rode assim (troque pela URL do seu repositório):"
  echo '  sudo REPO="git@github.com:sistemaempreendedores/dashvendas.git" bash instalar-chats.sh '"$DOMINIO $GAIUS"
  echo
  echo "Se usar SSH (recomendado), antes disso crie uma chave no servidor e"
  echo "cadastre em GitHub → repositório → Settings → Deploy keys:"
  echo '  ssh-keygen -t ed25519 -C chats -f /root/.ssh/id_ed25519 -N "" && cat /root/.ssh/id_ed25519.pub'
  exit 1
fi

APP=/opt/chats/app

passo "1/7 Instalando programas (Node, nginx, pm2)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx ufw >/dev/null
if ! command -v node >/dev/null || [[ "$(node -v | cut -c2-3)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
npm install -g pm2 --silent >/dev/null

passo "2/7 Baixando o código…"
id chats &>/dev/null || adduser --system --group --home /opt/chats chats
mkdir -p /opt/chats && chown chats:chats /opt/chats
if [[ -d "$APP/.git" ]]; then
  git -C "$APP" pull --ff-only
else
  git clone --depth 1 "$REPO" "$APP"
fi
chown -R chats:chats /opt/chats

passo "3/7 Configurando (sem segredos)…"
# APENAS_PLAYER: esta máquina só serve o chat — o resto do sistema responde 404.
# PLAYER_API_BASE: onde buscar os dados. É por isso que não precisa de senha aqui.
cat > "$APP/.env.production" <<EOF
APENAS_PLAYER=1
PLAYER_API_BASE=${GAIUS%/}
EOF
chown chats:chats "$APP/.env.production"
chmod 600 "$APP/.env.production"

passo "4/7 Compilando (demora alguns minutos)…"
cd "$APP"
sudo -u chats npm ci --silent
sudo -u chats npm run build

passo "5/7 Ligando o serviço…"
sudo -u chats pm2 delete chats &>/dev/null || true
sudo -u chats pm2 start npm --name chats -- start
sudo -u chats pm2 save
pm2 startup systemd -u chats --hp /opt/chats >/dev/null

passo "6/7 Publicando em $DOMINIO…"
cat > /etc/nginx/sites-available/chats <<EOF
server {
    listen 80;
    server_name $DOMINIO;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
EOF
ln -sf /etc/nginx/sites-available/chats /etc/nginx/sites-enabled/chats
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null && systemctl reload nginx

ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

passo "7/7 Cadeado de segurança (HTTPS)…"
apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos --register-unsafely-without-email --redirect \
  || vermelho "HTTPS falhou — normal se o domínio ainda não aponta pra cá. Rode depois: sudo certbot --nginx -d $DOMINIO"

passo "Conferindo se ficou seguro…"
sleep 3
IP=$(hostname -I | awk '{print $1}')
falhou=0
checar() { # url, esperado, descricao
  local got; got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $DOMINIO" "$1" || echo 000)
  if [[ "$got" == "$2" ]]; then verde "  ok   $3 ($got)"; else vermelho "  FALHA $3 — esperado $2, veio $got"; falhou=1; fi
}
checar "http://127.0.0.1:3000/painel"        404 "painel bloqueado"
checar "http://127.0.0.1:3000/login"         404 "login bloqueado"
checar "http://127.0.0.1:3000/administracao" 404 "administração bloqueada"
if grep -qE 'SUPABASE|SERVICE_ROLE|META_' "$APP/.env.production"; then
  vermelho "  FALHA há segredo no .env.production!"; falhou=1
else
  verde "  ok   nenhum segredo guardado no servidor"
fi

echo
if [[ $falhou -eq 0 ]]; then
  verde "PRONTO. Os chats estão em https://$DOMINIO/f/<nome-do-bot>"
  echo "O resto do sistema não existe neste servidor — nem pelo IP ($IP)."
else
  vermelho "Terminou COM FALHAS acima. Me mande esta tela antes de usar."
fi
echo "Atualizar depois:  sudo bash $APP/scripts/atualizar-chats.sh"
