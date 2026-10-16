#!/data/data/com.termux/files/usr/bin/bash
for f in ~/server_url.txt ~/parcepay-bot/server_url.txt /storage/emulated/0/Download/ParcePay/server_url.txt; do
  [ -f "$f" ] && URL=$(tr -d " 
" < "$f") && break
done
KEY=${ADMIN_KEY:-$(tr -d " 
" < ~/admin_key.txt 2>/dev/null)}
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "Falta server_url.txt o la llave en ~/admin_key.txt"; exit 1; }
URL=${URL%/}
# Comprueba que el servidor ve tu IP REAL aunque mandes encabezados falsos.
echo "IP falsa que mando: 1.2.3.4 (CF-Connecting-IP) y 5.6.7.8 (X-Forwarded-For)"
curl -s -X POST "$URL/api/admin/ip" -H "Content-Type: application/json" -H "CF-Connecting-IP: 1.2.3.4" -H "X-Forwarded-For: 5.6.7.8" -d "{\"key\":\"$KEY\"}"
echo
echo "Tu IP real publica es:"; curl -s https://api.ipify.org; echo
echo "El campo \"ip\" de arriba debe ser IGUAL a tu IP real. Si sale 1.2.3.4 o 5.6.7.8, avisame."
