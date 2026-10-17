#!/data/data/com.termux/files/usr/bin/bash
# Mantiene el bot de WhatsApp prendido: si se cae, lo arranca de nuevo solo.
#   Prender:  nohup bash ~/parcepay-bot/run.sh > /dev/null 2>&1 &
#   Ver:      tail -f ~/parcepay-bot/bot.log
#   Apagar:   pkill -f run.sh ; pkill -f bot.js
cd "$(dirname "$0")" || exit 1
if [ -f run.pid ] && kill -0 "$(cat run.pid)" 2>/dev/null; then
  echo "El bot ya esta corriendo (apagalo antes con: pkill -f run.sh ; pkill -f bot.js)"; exit 1
fi
echo $$ > run.pid
trap 'rm -f run.pid' EXIT
termux-wake-lock 2>/dev/null
while true; do
  node bot.js >> bot.log 2>&1
  code=$?
  if [ "$code" = "2" ]; then
    echo "$(date) WhatsApp cerro la sesion: borra la carpeta auth y vincula de nuevo (node bot.js)." >> bot.log
    exit 2
  fi
  echo "$(date) El bot se detuvo (codigo $code). Reinicio en 5 s..." >> bot.log
  [ "$(wc -c < bot.log)" -gt 1000000 ] && { tail -n 300 bot.log > bot.log.tmp; mv bot.log.tmp bot.log; }
  sleep 5
done
