#!/data/data/com.termux/files/usr/bin/bash
# Se corre UNA vez: instala todo lo necesario
termux-setup-storage
echo "deb https://packages.termux.dev/apt/termux-main stable main" > "$PREFIX/etc/apt/sources.list"
pkg update -y
for p in openjdk-17 aapt aapt2 apksigner dx ecj curl git gh; do
  pkg install -y "$p" || echo "FALLO instalando: $p"
done
echo "---- Revision ----"
FALTA=0
for c in keytool aapt aapt2 apksigner dx ecj curl git gh; do
  if command -v "$c" >/dev/null 2>&1; then echo "OK  $c"; else echo "FALTA  $c"; FALTA=1; fi
done
if [ "$FALTA" = "0" ]; then echo "Todo listo."; else echo "Faltan herramientas. Mandame esta pantalla."; fi
