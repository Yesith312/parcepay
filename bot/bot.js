// Bot de WhatsApp de ParcePay. Manda los codigos desde TU numero.
// Cada 3 s le pregunta al servidor de Render si hay mensajes pendientes y los envia.
//
// Uso:   BOT_KEY=la_clave BOT_NUMBER=573001234567 node bot.js
// (o guarda la clave en bot/bot_key.txt y el numero en bot/bot_number.txt)
// La direccion del servidor se lee de ../server_url.txt (la misma que usa la app).
const fs = require("fs"), path = require("path");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");

const read = f => { try { return fs.readFileSync(path.join(__dirname, f), "utf8").trim(); } catch (e) { return ""; } };
const SERVER = (process.env.PARCEPAY_URL || read("../server_url.txt")).replace(/\/+$/, "");
const KEY = process.env.BOT_KEY || read("bot_key.txt");
const NUM = (process.env.BOT_NUMBER || read("bot_number.txt")).replace(/\D/g, "");
if (!SERVER || !KEY || !NUM) {
  console.log("Falta algo. Necesito:\n - server_url.txt en la carpeta de ParcePay\n - BOT_KEY (la sacas de Render > Environment)\n - BOT_NUMBER (tu numero con 57, ej: 573001234567)");
  process.exit(1);
}

async function api(ruta, body) {
  const r = await fetch(SERVER + "/api/bot/" + ruta, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ key: KEY }, body || {}))
  });
  return r.json();
}

let sock = null, ready = false;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth"));
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: state, logger: pino({ level: "silent" }), browser: ["ParcePay", "Chrome", "1.0"], markOnlineOnConnect: false });
  sock.ev.on("creds.update", saveCreds);
  let asked = false;
  sock.ev.on("connection.update", async u => {
    // Primera vez: se vincula con un CODIGO (no hace falta escanear QR, sirve aunque sea el mismo celular)
    if (u.qr && !state.creds.registered && !asked) {
      asked = true;
      try {
        const code = await sock.requestPairingCode(NUM);
        console.log("\n=== CODIGO PARA VINCULAR: " + (code.match(/.{1,4}/g) || [code]).join("-") + " ===");
        console.log("WhatsApp > Dispositivos vinculados > Vincular dispositivo > Vincular con el numero de telefono\n");
      } catch (e) { console.log("No pude pedir el codigo de vinculacion:", e.message); asked = false; }
    }
    if (u.connection === "open") { ready = true; console.log("Bot conectado. Listo para enviar codigos."); }
    if (u.connection === "close") {
      ready = false;
      const err = u.lastDisconnect && u.lastDisconnect.error;
      const status = err && err.output && err.output.statusCode;
      if (status === DisconnectReason.loggedOut) {
        console.log("Se cerro la sesion de WhatsApp. Borra la carpeta bot/auth y vuelve a vincular.");
        process.exit(1);
      }
      console.log("Conexion cerrada, reconectando...");
      setTimeout(start, 3000);
    }
  });
}

async function loop() {
  for (;;) {
    try {
      if (ready) {
        const r = await api("pull");
        for (const m of r.msgs || []) {
          try {
            await sock.sendMessage("57" + m.phone + "@s.whatsapp.net", { text: m.text });
            await api("done", { id: m.id });
            console.log("Enviado a " + m.phone);
          } catch (e) { console.log("No pude enviar a " + m.phone + ": " + e.message); }
        }
      }
    } catch (e) { console.log("Sin conexion con el servidor: " + e.message); }
    await new Promise(r => setTimeout(r, 3000));
  }
}

start().catch(e => { console.log("Error al iniciar:", e.message); process.exit(1); });
loop();
