#!/usr/bin/env bash
# Sai do modo TOTEM de um tablet do mercadinho. É a contraparte de
# tablet-kiosk.sh, e a ÚNICA saída — pelo cabo, deste Mac.
#
#   ./scripts/tablet-destravar.sh            solta a tela (continua device owner)
#   ./scripts/tablet-destravar.sh --owner    solta E abre mão do device owner
#
# Sem --owner: o app continua sendo a tela inicial e volta ao ligar; serve pra
# mexer um instante no Android (Wi-Fi, ajustes). Basta reabrir o app pra ele se
# prender de novo.
#
# Com --owner: o app deixa de ser device owner. Pra voltar ao modo totem é
# preciso rodar tablet-kiosk.sh outra vez — e `set-device-owner` só é aceito em
# aparelho SEM conta cadastrada.
#
# NÃO faça reset de fábrica pra sair do totem: o tablet guarda compras feitas
# offline que ainda não subiram, e o reset apagaria essas vendas.
set -uo pipefail

ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
PKG="com.tridi.market"
TOKEN="tridi-market-destravar"   # igual ao DestravarReceiver.TOKEN

if [ -z "$("$ADB" devices | tail -n +2 | grep -v '^$')" ]; then
  echo "Nenhum tablet no adb. Conecte o cabo e autorize a depuração USB."
  exit 1
fi

EXTRA=""
if [ "${1:-}" = "--owner" ]; then
  EXTRA="--ez remover_owner true"
  echo "→ Destravando E removendo device owner."
else
  echo "→ Destravando a tela (device owner mantido)."
fi

# shellcheck disable=SC2086
"$ADB" shell am broadcast -a com.tridi.market.DESTRAVAR \
  -n "$PKG/.kiosk.DestravarReceiver" --es token "$TOKEN" $EXTRA >/dev/null 2>&1 \
  && echo "  ✓ pedido enviado" || { echo "  ✗ falhou"; exit 1; }

sleep 2
echo "→ Estado agora:"
"$ADB" shell dumpsys activity 2>/dev/null | grep -m1 -i "mLockTaskModeState" | sed 's/^/  /'
"$ADB" shell dumpsys device_policy 2>/dev/null | grep -m1 -i "Device Owner" | sed 's/^/  /' || true

echo
echo "A tela está solta. Pra voltar ao totem: abra o app (ou ./scripts/tablet-kiosk.sh)."
