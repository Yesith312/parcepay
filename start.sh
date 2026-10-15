#!/data/data/com.termux/files/usr/bin/bash
# Prende el servidor de ParcePay (dejalo abierto mientras uses la app)
#   bash start.sh        -> la web solo se abre en este celular
#   bash start.sh red    -> la web tambien se abre desde otro equipo del mismo WiFi
cd "$(dirname "$0")/server"
termux-wake-lock
export HOST=127.0.0.1
if [ "$1" = "red" ]; then
  export HOST=0.0.0.0
  IP=$(ip -4 addr show wlan0 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2)
  [ -n "$IP" ] && echo "Desde otro equipo abre: http://$IP:3000"
fi
node server.js
