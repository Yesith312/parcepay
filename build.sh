#!/data/data/com.termux/files/usr/bin/bash
# Compila la app y deja ParcePay.apk en Descargas
# La direccion del servidor se lee de server_url.txt
set -e
cd "$(dirname "$0")"
for c in ecj dx aapt aapt2 apksigner keytool unzip curl; do
  command -v $c >/dev/null || { echo "Falta $c. Corre primero: bash setup.sh"; exit 1; }
done
tiene_res() { unzip -l "$1" 2>/dev/null | grep -q "resources.arsc"; }
B=build; rm -rf $B; mkdir -p $B/classes
JAR="$HOME/android-sdk.jar"
if [ -f "$JAR" ] && ! tiene_res "$JAR"; then rm -f "$JAR"; fi
if [ ! -f "$JAR" ]; then
  echo "Bajando android.jar oficial de Google (unos 60 MB)..."
  for z in platform-28_r06 platform-29_r05 platform-30_r03 platform-27_r03; do
    rm -rf "$HOME/plat" "$HOME/plat.zip"
    if curl -fL -o "$HOME/plat.zip" "https://dl.google.com/android/repository/$z.zip"; then
      unzip -j -o "$HOME/plat.zip" '*/android.jar' -d "$HOME/plat" || true
      [ -f "$HOME/plat/android.jar" ] && cp "$HOME/plat/android.jar" "$JAR"
      rm -rf "$HOME/plat" "$HOME/plat.zip"
      if [ -f "$JAR" ] && tiene_res "$JAR"; then break; fi
      rm -f "$JAR"
    fi
  done
fi
[ -f "$JAR" ] || { echo "No pude conseguir el android.jar oficial. Mandame esta pantalla."; exit 1; }
echo "Usando: $JAR"

# Direccion del servidor
URL=$(tr -d ' \r\n' < server_url.txt 2>/dev/null || true)
URL=${URL%/}
case "$URL" in
  ""|http://127.0.0.1*|http://localhost*)
    echo "Falta la direccion de Render en server_url.txt. Ejemplo:"
    echo '  echo "https://parcepay-xxxx.onrender.com" > server_url.txt'
    exit 1 ;;
esac
echo "Servidor: $URL"
mkdir -p $B/gen/com/parcepay/app
cat > $B/gen/com/parcepay/app/Config.java <<CFG
package com.parcepay.app;

final class Config {
    static final String URL = "$URL";
}
CFG

# Logo: logo_icon.png (192x192, icono) y logo_app.png (256x256, dentro de la app)
mkdir -p $B/assets
MAN=app/AndroidManifest.xml
RES=""
if [ -f logo_icon.png ] && [ -f logo_app.png ]; then
  echo "Logo: logo_icon.png y logo_app.png"
  mkdir -p $B/res/mipmap-xxxhdpi
  cp logo_icon.png $B/res/mipmap-xxxhdpi/ic_launcher.png
  cp logo_app.png $B/assets/logo.png
  aapt2 compile --dir $B/res -o $B/res.zip
  RES=$B/res.zip
  sed 's|<application |<application android:icon="@mipmap/ic_launcher" |' app/AndroidManifest.xml > $B/AndroidManifest.xml
  MAN=$B/AndroidManifest.xml
else
  echo "Sin logos: se usa el logo por defecto"
fi

echo "[1/5] Compilando Java"
ecj -source 1.7 -target 1.7 -nowarn -cp "$JAR" -d $B/classes $(find app/src $B/gen -name '*.java')
echo "[2/5] Creando classes.dex"
dx --dex --output=$B/classes.dex $B/classes
echo "[3/5] Empaquetando"
aapt2 link -o $B/unsigned.apk --manifest $MAN -I "$JAR" -A $B/assets \
  --min-sdk-version 21 --target-sdk-version 28 --version-code 1 --version-name 1.0 $RES
(cd $B && aapt add unsigned.apk classes.dex)
echo "[4/5] Firmando"
KS="$HOME/.parcepay.jks"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass parcepay -keypass parcepay -alias k -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=ParcePay"
fi
apksigner sign --ks "$KS" --ks-pass pass:parcepay --out $B/ParcePay.apk $B/unsigned.apk
echo "[5/5] Copiando a Descargas"
cp $B/ParcePay.apk /storage/emulated/0/Download/ParcePay.apk
echo "LISTO: instala /storage/emulated/0/Download/ParcePay.apk"
