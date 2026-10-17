ParcePay (app Android + servidor en Render con PostgreSQL)

1) bash setup.sh      (una vez)
2) bash deploy.sh     (sube todo el proyecto a tu GitHub privado "parcepay")
3) En render.com: New > Blueprint > repo parcepay > Apply
4) Pon la URL que te da Render en server_url.txt  (ej: https://parcepay.onrender.com)
5) bash build.sh      (crea /storage/emulated/0/Download/ParcePay.apk, instalalo)

La web de recargas y el cajero estan en la misma URL de Render.
El dinero es simulado.

render.yaml                 debe estar en la raiz del repositorio
app/src/com/parcepay/app/   pantallas y logica de la app
server/                     server.js (API), web/index.html, package.json
server_url.txt              direccion de Render que usa la app (lo creas tu, ver paso 4)
logo.png, logo_icon.png, logo_app.png   logo (para cambiarlo reemplaza logo_icon.png 192x192 y logo_app.png 256x256)

BOT DE WHATSAPP (codigos de meter/sacar plata y cambio de clave)
1) En Render > tu servicio > Environment: copia el valor de BOT_KEY (si no existe, creala con cualquier texto largo).
2) En Termux:  pkg install nodejs git ; cd ParcePay/bot ; npm install
3) BOT_KEY=la_clave BOT_NUMBER=573001234567 node bot.js
   La primera vez sale un CODIGO: en WhatsApp > Dispositivos vinculados > Vincular con el numero de telefono.
Mientras el bot este apagado, la app avisa que el WhatsApp no esta disponible.

SEGURIDAD
- Render > Environment: SECRET, BOT_KEY y ADMIN_KEY deben existir y ser distintas. Guarda una copia de SECRET en un lugar seguro:
  sin ella no se pueden leer los datos cifrados ni los respaldos.
- Comandos de administrador (desbloquear, eliminar, respaldo) usan ADMIN_KEY, nunca BOT_KEY.
- La base gratis de Render se borra a los 30 dias y no tiene copias: pasa a un plan pago o haz respaldos con respaldo.sh.

PUNTOS DE RECARGA (cajeros con cuenta)
- La web (https://TU-APP.onrender.com) es el portal de los puntos: entran con usuario y clave, nunca el cliente.
- Crear un punto:  bash ~/punto.sh crear usuario "Nombre del punto"   (muestra la clave temporal una sola vez)
- Darle cupo:      bash ~/punto.sh cupo usuario 500000
- Meter plata: el cliente pide el codigo en la app (le llega por WhatsApp), se lo da al cajero en persona; el cajero
  escribe celular + codigo + efectivo recibido, verifica el nombre y confirma. El monto sale del cupo del punto.
- Sacar plata: el cliente elige el monto en la app y recibe el codigo; el cajero lo verifica, entrega el efectivo y el
  monto entra a su cupo.
