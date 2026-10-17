#!/data/data/com.termux/files/usr/bin/bash
for f in ~/server_url.txt ~/parcepay-bot/server_url.txt /storage/emulated/0/Download/ParcePay/server_url.txt; do
  [ -f "$f" ] && URL=$(tr -d " \r\n" < "$f") && break
done
KEY=${ADMIN_KEY:-$(tr -d " \r\n" < ~/admin_key.txt 2>/dev/null)}
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "Falta server_url.txt o la llave en ~/admin_key.txt"; exit 1; }
URL=${URL%/}
call() { curl -s -X POST "$URL/api/admin/$1" -H "Content-Type: application/json" -d "$2"; echo; }
case "$1" in
  crear)    [ -n "$2" ] && [ -n "$3" ] || { echo 'Uso: bash ~/punto.sh crear usuario "Nombre del punto"'; exit 1; }
            call punto-crear "{\"key\":\"$KEY\",\"u\":\"$2\",\"nombre\":\"$3\"}" ;;
  cupo)     [ -n "$2" ] && [ -n "$3" ] || { echo "Uso: bash ~/punto.sh cupo usuario 500000   (negativo para restar)"; exit 1; }
            call punto-cupo "{\"key\":\"$KEY\",\"u\":\"$2\",\"v\":$3}" ;;
  clave)    [ -n "$2" ] || { echo "Uso: bash ~/punto.sh clave usuario   (da clave temporal y desbloquea)"; exit 1; }
            call punto-clave "{\"key\":\"$KEY\",\"u\":\"$2\"}" ;;
  apagar)   [ -n "$2" ] || { echo "Uso: bash ~/punto.sh apagar usuario"; exit 1; }
            call punto-estado "{\"key\":\"$KEY\",\"u\":\"$2\",\"activo\":false}" ;;
  prender)  [ -n "$2" ] || { echo "Uso: bash ~/punto.sh prender usuario"; exit 1; }
            call punto-estado "{\"key\":\"$KEY\",\"u\":\"$2\",\"activo\":true}" ;;
  lista)    call punto-lista "{\"key\":\"$KEY\"}" ;;
  *) cat <<'USO'
Puntos de recarga:
  bash ~/punto.sh crear usuario "Nombre del punto"   crea el punto y muestra su clave temporal (una sola vez)
  bash ~/punto.sh cupo usuario 500000                suma cupo (con signo menos, resta)
  bash ~/punto.sh clave usuario                      clave temporal nueva; tambien desbloquea
  bash ~/punto.sh apagar usuario | prender usuario   desactiva o activa el punto
  bash ~/punto.sh lista                              puntos, cupos y estados
USO
  ;;
esac
