// Bot de WhatsApp de ParcePay. Manda los codigos desde TU numero.
// Cada 3 s le pregunta al servidor de Render si hay mensajes pendientes y los envia.
// Uso: node bot.js   (o mejor: bash run.sh, que lo reinicia solo si se cae)
// BOT_NUMBER y BOT_KEY salen de bot_number.txt y bot_key.txt, o de variables de entorno.
const fs = require("fs"), path = require("path");
const baileys = require("@whiskeysockets/baileys");
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;
const pino = require("pino");

const read = f => { try { return fs.readFileSync(path.join(__dirname, f), "utf8").trim(); } catch (e) { return ""; } };
const SERVER = (process.env.PARCEPAY_URL || read("server_url.txt") || read("../server_url.txt")).replace(/\/+$/, "");
const KEY = process.env.BOT_KEY || read("bot_key.txt");
const NUM = (process.env.BOT_NUMBER || read("bot_number.txt")).replace(/\D/g, "");
if (!SERVER || !KEY || !NUM) {
  console.log("Falta algo. Necesito:\n - server_url.txt (o PARCEPAY_URL)\n - bot_key.txt (o BOT_KEY)\n - bot_number.txt (o BOT_NUMBER, con 57)");
  process.exit(1);
}

// Salidas: 1 = se cayo (run.sh lo reinicia) | 2 = WhatsApp cerro la sesion (hay que vincular de nuevo a mano)
process.on("unhandledRejection", e => console.log("Aviso:", e && e.message ? e.message : e));
process.on("uncaughtException", e => { console.log("Error grave:", e && e.message ? e.message : e); process.exit(1); });

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ": tiempo agotado")), ms))]);

async function api(ruta, body) {
  const r = await fetch(SERVER + "/api/bot/" + ruta, {
    method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ key: KEY }, body || {}))
  });
  return r.json();
}

let sock = null, ready = false, registered = false, lastReady = Date.now(), retries = 0;
// Mensajes enviados (en memoria): si WhatsApp pide reenviar uno porque el telefono no pudo abrirlo, se manda el mismo.
const sent = new Map();
const remember = (id, msg) => { sent.set(id, msg); if (sent.size > 200) sent.delete(sent.keys().next().value); };

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth"));
  const { version } = await fetchLatestBaileysVersion();
  registered = !!state.creds.registered;
  if (sock) { try { sock.ev.removeAllListeners(); sock.end(undefined); } catch (e) { /* ya estaba cerrado */ } }
  sock = makeWASocket({
    version, auth: state, logger: pino({ level: "silent" }),
    browser: Browsers ? Browsers.ubuntu("Chrome") : ["Ubuntu", "Chrome", "22.04.4"],
    markOnlineOnConnect: false, syncFullHistory: false,
    keepAliveIntervalMs: 25000, connectTimeoutMs: 60000, defaultQueryTimeoutMs: 60000,
    getMessage: async key => sent.get(key.id)
  });
  try { sock.ws.on("error", e => console.log("Aviso de red:", e && e.message)); } catch (e) { /* sin ws */ }
  sock.ev.on("creds.update", saveCreds);
  let asked = false;
  sock.ev.on("connection.update", async u => {
    // Primera vez: se vincula con un CODIGO (no hace falta escanear QR, sirve aunque sea el mismo celular)
    if (u.qr && !state.creds.registered && !asked) {
      asked = true;
      try {
        const code = await sock.requestPairingCode(NUM);
        console.log("\n=== CODIGO PARA VINCULAR: " + (code.match(/.{1,4}/g) || [code]).join("-") + " === (" + new Date().toLocaleTimeString() + ")");
        console.log("WhatsApp > Dispositivos vinculados > Vincular dispositivo > Vincular con el numero de telefono\n");
      } catch (e) { console.log("No pude pedir el codigo de vinculacion:", e.message); asked = false; }
    }
    if (u.connection === "open") {
      ready = true; registered = true; retries = 0; lastReady = Date.now();
      console.log("Bot conectado. Listo para enviar codigos.");
    }
    if (u.connection === "close") {
      ready = false;
      const err = u.lastDisconnect && u.lastDisconnect.error;
      const status = err && err.output && err.output.statusCode;
      if (status === DisconnectReason.loggedOut) {
        console.log("WhatsApp cerro la sesion del bot. Borra la carpeta auth y vuelve a vincular.");
        process.exit(2);
      }
      const wait = Math.min(30000, 3000 * ++retries);
      console.log("Conexion cerrada (codigo " + status + (err && err.message ? ": " + err.message : "") + "), reconectando en " + Math.round(wait / 1000) + " s...");
      setTimeout(() => start().catch(e => console.log("Error al reconectar:", e.message)), wait);
    }
  });
}

async function sendOne(m) {
  let jid = "57" + m.phone + "@s.whatsapp.net";
  try {
    const w = await withTimeout(sock.onWhatsApp(jid), 15000, "consulta");
    if (w && w[0] && w[0].exists === false) {
      console.log(m.phone + " no tiene WhatsApp: se descarta el mensaje");
      await api("done", { id: m.id });
      return;
    }
    if (w && w[0] && w[0].jid) jid = w[0].jid;
  } catch (e) { /* si falla la consulta, se intenta enviar igual */ }
  const res = await withTimeout(sock.sendMessage(jid, { text: m.text }), 30000, "envio");
  if (res && res.key && res.message) remember(res.key.id, res.message);
  await api("done", { id: m.id });
  console.log("Enviado a " + m.phone + " (" + (res && res.key ? res.key.id : "?") + ")");
}

async function loop() {
  for (;;) {
    try {
      if (ready) {
        lastReady = Date.now();
        const r = await api("pull");
        if (r.error) console.log("El servidor dijo: " + r.error);
        for (const m of r.msgs || []) {
          try { await sendOne(m); } catch (e) { console.log("No pude enviar a " + m.phone + ": " + e.message); }
        }
      }
    } catch (e) { console.log("Sin conexion con el servidor: " + e.message); }
    await new Promise(r => setTimeout(r, 3000));
  }
}

// Vigilante: si ya estaba vinculado y lleva 2 minutos sin WhatsApp, se reinicia limpio (run.sh lo vuelve a arrancar)
setInterval(() => {
  if (registered && !ready && Date.now() - lastReady > 120000) {
    console.log("Sin WhatsApp hace 2 minutos: reinicio el bot.");
    process.exit(1);
  }
}, 15000);

start().catch(e => { console.log("Error al iniciar:", e.message); process.exit(1); });
loop();
