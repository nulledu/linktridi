#!/usr/bin/env bash
# Deixa um tablet do mercadinho em modo TOTEM: liga e cai direto no app, sem
# barra de navegação, sem sair pro Android.
#
# Rodar com o tablet conectado por USB e a Depuração USB autorizada:
#   ./scripts/tablet-kiosk.sh
#
# O que é feito e por quê:
#   1. DEVICE OWNER — é o que dá poder de kiosk de verdade (bloquear saída,
#      impedir desinstalação). Só pode ser definido em aparelho SEM conta
#      Google e sem usuário secundário; é uma trava do próprio Android, não do
#      script. Se falhar, o passo diz o que fazer.
#   2. APP COMO HOME — o botão home passa a abrir o mercadinho, e é isso que
#      faz "ligar o tablet e cair no app" (junto com o BootReceiver que o app
#      já tem).
#   3. LOCK TASK — autoriza o app a se fixar na tela.
#   4. Tela sempre acesa enquanto carregando, e depuração USB mantida ligada
#      pra este script poder rodar de novo depois.
set -uo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
PKG="com.tridi.market"
ADMIN="$PKG/.kiosk.MarketAdminReceiver"

ok()   { printf '  ✓ %s\n' "$1"; }
falha(){ printf '  ✗ %s\n' "$1"; }

if [ -z "$("$ADB" devices | tail -n +2 | grep -v '^$')" ]; then
  echo "Nenhum tablet no adb. Conecte o cabo e autorize a depuração USB."
  exit 1
fi

echo "→ Conta Google no aparelho (impede device owner):"
CONTAS=$("$ADB" shell dumpsys account 2>/dev/null | grep -c "Account {" || true)
[ "${CONTAS:-0}" -gt 0 ] && falha "$CONTAS conta(s) — remova em Configurações → Contas, ou faça reset de fábrica" || ok "nenhuma conta"

echo "→ Device owner:"
# Checa ANTES de tentar: `set-device-owner` falha quando JÁ está definido, e o
# script dizia "não definido" justamente no aparelho que estava certo.
if "$ADB" shell dumpsys device_policy 2>/dev/null | grep -q "$PKG"; then
  ok "já definido"
elif "$ADB" shell dpm set-device-owner "$ADMIN" 2>&1 | grep -qi "success"; then
  ok "definido"
else
  falha "não definido (veja a conta acima; em aparelho já usado costuma exigir reset)"
fi

echo "→ App como HOME (é o que faz ligar e cair no app):"
"$ADB" shell cmd package set-home-activity "$PKG/.MainActivity" >/dev/null 2>&1 \
  && ok "definido" || falha "não aceitou — escolha o TridiMarket como tela inicial na primeira vez que o Android perguntar"

echo "→ Lock task (fixar na tela):"
"$ADB" shell dpm set-lock-task-packages --user 0 "$PKG" >/dev/null 2>&1 \
  && ok "autorizado" || falha "precisa de device owner"

echo "→ Ajustes de totem:"
"$ADB" shell settings put global stay_on_while_plugged_in 3 >/dev/null 2>&1 && ok "tela não apaga no carregador"
"$ADB" shell settings put system screen_off_timeout 1800000 >/dev/null 2>&1 && ok "timeout de tela: 30 min"
"$ADB" shell settings put global adb_enabled 1 >/dev/null 2>&1 && ok "depuração USB mantida ligada"
# Assistente/atalhos que tirariam a pessoa do app
"$ADB" shell settings put secure assistant "" >/dev/null 2>&1
"$ADB" shell settings put global development_settings_enabled 1 >/dev/null 2>&1

echo "→ Abrindo o app:"
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null 2>&1 && ok "aberto"

echo
echo "Confira no aparelho: aperte HOME — deve voltar pro mercadinho."
