#!/data/data/com.termux/files/usr/bin/bash
for f in ~/server_url.txt ~/parcepay-bot/server_url.txt /storage/emulated/0/Download/ParcePay/server_url.txt; do
  [ -f "$f" ] && URL=$(tr -d " 
" < "$f") && break
done
KEY=${ADMIN_KEY:-$(tr -d " 
" < ~/admin_key.txt 2>/dev/null)}
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "Falta server_url.txt o la llave en ~/admin_key.txt"; exit 1; }
URL=${URL%/}
# Uso: bash ~/eliminar.sh 3001234567
[ -n "$1" ] || { echo "Uso: bash ~/eliminar.sh 3001234567"; exit 1; }
post() { curl -s -X POST "$URL/api/admin/delete" -H "Content-Type: application/json" -d "$1"; }
R=$(post "{\"key\":\"$KEY\",\"p\":\"$1\",\"dry\":true}")
echo "$R"
case "$R" in *'"dry":true'*) ;; *) exit 1 ;; esac
printf "Escribe ELIMINAR para borrar esta cuenta para siempre: "
read X
[ "$X" = "ELIMINAR" ] || { echo "Cancelado."; exit 0; }
post "{\"key\":\"$KEY\",\"p\":\"$1\"}"
echo
