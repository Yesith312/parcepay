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
