#!/data/data/com.termux/files/usr/bin/bash
for f in ~/server_url.txt ~/parcepay-bot/server_url.txt /storage/emulated/0/Download/ParcePay/server_url.txt; do
  [ -f "$f" ] && URL=$(tr -d " 
" < "$f") && break
done
KEY=${ADMIN_KEY:-$(tr -d " 
" < ~/admin_key.txt 2>/dev/null)}
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "Falta server_url.txt o la llave en ~/admin_key.txt"; exit 1; }
URL=${URL%/}
# Uso: bash ~/respaldo.sh   (guarda ~/respaldos/parcepay-AAAA-MM-DD.json, solo legible por ti)
mkdir -p ~/respaldos && chmod 700 ~/respaldos
OUT=~/respaldos/parcepay-$(date +%F).json
curl -s -X POST "$URL/api/admin/backup" -H "Content-Type: application/json" -d "{\"key\":\"$KEY\"}" -o "$OUT"
if head -c 30 "$OUT" | grep -q '"at"'; then
  chmod 600 "$OUT"; echo "Respaldo guardado: $OUT ($(wc -c < "$OUT") bytes)"
else
  echo "Fallo el respaldo:"; cat "$OUT"; echo; rm -f "$OUT"; exit 1
fi
