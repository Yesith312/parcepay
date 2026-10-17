// Servidor de ParcePay para Render: Node + PostgreSQL (sin framework).
// Variables: DATABASE_URL (la pone Render), SECRET (la pone Render), PORT (la pone Render)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), util = require("util");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("Falta la variable DATABASE_URL"); process.exit(1); }
const pool = new Pool({
  connectionString: DB_URL,
  ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false },
  max: 5
});
const SECRET = process.env.SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SECRET && process.env.RENDER) { console.error("Falta la variable SECRET"); process.exit(1); }
const WEB = path.join(__dirname, "web", "index.html");
const CODE_TTL = 600; // segundos que dura un codigo

// ---------- utilidades ----------
const money = v => "$" + Math.round(v).toLocaleString("es-CO");
const phoneOk = p => /^3\d{9}$/.test(p);
// ==crypto==
const scryptP = util.promisify(crypto.scrypt);
// Claves derivadas de SECRET (SECRET vive solo en Render, nunca en la base de datos)
const sub = x => crypto.createHmac("sha256", SECRET).update("parcepay:" + x).digest();
const PEPPER = sub("pin"), PII = sub("pii");
const hash = async (k, salt) => (await scryptP(String(k), salt, 32)).toString("hex");   // formato viejo (v1)
const pinHash = async (k, salt) =>                                                       // formato nuevo (v2): con pimienta
  (await scryptP(crypto.createHmac("sha256", PEPPER).update(String(k)).digest(), salt, 32)).toString("hex");
// Datos personales cifrados en la base (AES-256-GCM)
const enc = t => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", PII, iv);
  const ct = Buffer.concat([c.update(String(t), "utf8"), c.final()]);
  return "e1:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
};
const encIf = t => String(t).startsWith("e1:") ? String(t) : enc(t);
const dec = t => {
  if (typeof t !== "string" || !t.startsWith("e1:")) return t;
  try {
    const b = Buffer.from(t.slice(3), "base64"), d = crypto.createDecipheriv("aes-256-gcm", PII, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch (e) { return ""; }
};
// ==/crypto==
const hmac = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const genCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const NOAUTH = [401, { error: "Sesi\u00f3n vencida. Entra de nuevo." }];

// Sesiones: token firmado (HMAC) con la "version" del usuario. Al cambiar la clave, bloquear o cerrar sesion
// la version sube y los tokens viejos dejan de servir.
const TOKEN_MS = 2 * 3600e3;
async function sign(p) {
  const r = (await pool.query("select tv from users where phone=$1", [p])).rows[0];
  const body = Buffer.from(JSON.stringify({ p, v: r ? r.tv : 0, exp: Date.now() + TOKEN_MS })).toString("base64url");
  return body + "." + hmac(body);
}
async function auth(d) {
  const t = String(d.t || "").split(".");
  if (t.length !== 2) return null;
  const sig = hmac(t[0]);
  if (sig.length !== t[1].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(t[1]))) return null;
  let x;
  try { x = JSON.parse(Buffer.from(t[0], "base64url").toString()); } catch (e) { return null; }
  if (x.k || !(x.exp > Date.now())) return null;
  const r = (await pool.query("select tv from users where phone=$1", [x.p])).rows[0];
  return r && r.tv === x.v ? x.p : null;
}

// Sesion de los puntos de recarga (cajeros): token aparte, dura 1 hora
const TOKEN_PT_MS = 3600e3;
async function signPunto(id) {
  const r = (await pool.query("select tv from puntos where id=$1", [id])).rows[0];
  const body = Buffer.from(JSON.stringify({ p: id, k: "pt", v: r ? r.tv : 0, exp: Date.now() + TOKEN_PT_MS })).toString("base64url");
  return body + "." + hmac(body);
}
// Devuelve la fila del punto si el token es valido, el punto esta activo y la version coincide
async function authPunto(d) {
  const t = String(d.t || "").split(".");
  if (t.length !== 2) return null;
  const sig = hmac(t[0]);
  if (sig.length !== t[1].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(t[1]))) return null;
  let x;
  try { x = JSON.parse(Buffer.from(t[0], "base64url").toString()); } catch (e) { return null; }
  if (x.k !== "pt" || !(x.exp > Date.now())) return null;
  const r = (await pool.query("select id, nombre, saldo, activo, cambiar, tv from puntos where id=$1", [x.p])).rows[0];
  return r && r.activo && r.tv === x.v ? r : null;
}

// Limite de intentos fallidos (en memoria)
const fails = {};
const locked = k => !!(fails[k] && fails[k].until > Date.now());
function fail(k) {
  const f = fails[k] || { c: 0, until: 0, t: 0 }, now = Date.now();
  if (now - f.t > 600000) f.c = 0; // los fallos viejos se olvidan a los 10 min
  f.t = now;
  if (++f.c >= 5) { f.c = 0; f.until = now + 60000; }
  fails[k] = f;
}
// Limite por ventana: true si en los ultimos ms ya hubo mas de max pedidos con esa llave
const hits = {};
function rate(key, max, ms) {
  const now = Date.now(), a = (hits[key] || []).filter(t => now - t < ms);
  a.push(now); hits[key] = a;
  return a.length > max;
}
const clear = k => { delete fails[k]; };

const SEC = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains", "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()"
};
function send(res, c, o) {
  res.writeHead(c, Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, SEC));
  res.end(JSON.stringify(o));
}

// ---------- base de datos ----------
async function init() {
  await pool.query(`
    create table if not exists users(
      phone text primary key, cc text not null, nombres text not null, apellidos text not null,
      nacimiento text not null, salt text not null, hash text not null,
      saldo bigint not null default 0 check (saldo >= 0), created_at timestamptz not null default now());
    create table if not exists movs(
      id bigserial primary key, phone text not null references users(phone), tipo text not null,
      monto bigint not null, detalle text not null, created_at timestamptz not null default now());
    create index if not exists movs_phone_id on movs(phone, id desc);
    create table if not exists codes(
      phone text not null, tipo text not null, code text not null, monto bigint not null default 0,
      expires_at timestamptz not null, primary key(phone, tipo));
  `);
  await pool.query(`
    alter table users add column if not exists intentos int not null default 0;
    alter table users add column if not exists bloqueada boolean not null default false;
    create table if not exists outbox(
      id bigserial primary key, phone text not null, text text not null,
      tries int not null default 0, claimed_at timestamptz, created_at timestamptz not null default now());
    alter table users add column if not exists hv int not null default 1;
    alter table users add column if not exists tv int not null default 0;
    create table if not exists audit(
      id bigserial primary key, at timestamptz not null default now(), phone text, ev text not null, ip text);
    create index if not exists audit_phone on audit(phone, id desc);
    create table if not exists puntos(
      id text primary key, nombre text not null, salt text not null, hash text not null, hv int not null default 2,
      saldo bigint not null default 0 check (saldo >= 0), activo boolean not null default true,
      intentos int not null default 0, bloqueado boolean not null default false,
      cambiar boolean not null default true, tv int not null default 0, created_at timestamptz not null default now());
    create table if not exists punto_movs(
      id bigserial primary key, punto text not null references puntos(id), tipo text not null,
      monto bigint not null, cliente text, saldo_despues bigint, created_at timestamptz not null default now());
    create index if not exists punto_movs_punto on punto_movs(punto, id desc);
  `);
  await migratePII();
}

// Cifra nombres, apellidos y nacimiento de las cuentas que aun estan en texto plano
async function migratePII() {
  const r = await pool.query("select phone, nombres, apellidos, nacimiento from users where left(nombres,3) <> 'e1:' or left(apellidos,3) <> 'e1:' or left(nacimiento,3) <> 'e1:'");
  for (const u of r.rows)
    await pool.query("update users set nombres=$2, apellidos=$3, nacimiento=$4 where phone=$1", [u.phone, encIf(u.nombres), encIf(u.apellidos), encIf(u.nacimiento)]);
  if (r.rowCount) console.log("Datos personales cifrados en " + r.rowCount + " cuentas");
}

async function pub(p) {
  const u = (await pool.query("select nombres, apellidos, saldo from users where phone=$1", [p])).rows[0];
  if (!u) return null;
  const m = (await pool.query(
    "select tipo, monto, detalle, (extract(epoch from created_at)*1000)::bigint as f from movs where phone=$1 order by id desc limit 15", [p])).rows;
  return { n: dec(u.nombres), a: dec(u.apellidos), s: Number(u.saldo), p,
    movs: m.map(x => ({ t: x.tipo, v: Number(x.monto), d: x.detalle, f: Number(x.f) })) };
}

async function setCode(p, tipo, monto) {
  const code = genCode();
  await pool.query(
    `insert into codes(phone, tipo, code, monto, expires_at) values($1,$2,$3,$4, now() + interval '${CODE_TTL} seconds')
     on conflict (phone, tipo) do update set code=excluded.code, monto=excluded.monto, expires_at=excluded.expires_at`,
    [p, tipo, code, monto]);
  return code;
}

// Ejecuta fn dentro de una transaccion
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query("begin"); const r = await fn(c); await c.query("commit"); return r; }
  catch (e) { try { await c.query("rollback"); } catch (x) {} throw e; }
  finally { c.release(); }
}
// Confirma la clave. A los 5 fallos seguidos la clave se bloquea hasta que se cambie con el codigo de WhatsApp.
const MAX_TRIES = 5;
async function verifyPin(p, k, ip) {
  if (locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
  const u = (await pool.query("select salt, hash, hv, bloqueada, intentos from users where phone=$1", [p])).rows[0];
  if (!u) return [400, { error: "Ese n\u00famero no tiene cuenta." }];
  if (u.bloqueada) return [423, { locked: true, error: "Tu clave est\u00e1 bloqueada. Toca \u00bfOlvidaste tu clave? para cambiarla." }];
  const ok = /^\d{4}$/.test(k) &&
    crypto.timingSafeEqual(Buffer.from(u.hv >= 2 ? await pinHash(k, u.salt) : await hash(k, u.salt)), Buffer.from(u.hash));
  if (ok) {
    // Cuentas viejas: al entrar bien, su clave pasa al formato con pimienta
    if (u.hv < 2) await pool.query("update users set hash=$2, hv=2, intentos=0 where phone=$1", [p, await pinHash(k, u.salt)]);
    else if (u.intentos > 0) await pool.query("update users set intentos=0 where phone=$1", [p]);
    return null;
  }
  fail("i:" + ip);
  const r = (await pool.query(
    "update users set intentos = intentos + 1, bloqueada = (intentos + 1 >= $2), tv = tv + (case when intentos + 1 >= $2 then 1 else 0 end) where phone=$1 returning intentos, bloqueada",
    [p, MAX_TRIES])).rows[0];
  audit(r.bloqueada ? "clave_bloqueada" : "clave_incorrecta", p, ip);
  if (r.bloqueada) {
    alertWA(p, "ParcePay: bloqueamos tu clave por 5 intentos fallidos. Si fuiste t\u00fa, toca \u00bfOlvidaste tu clave? en la app. Si no fuiste t\u00fa, no compartas ning\u00fan c\u00f3digo con nadie.");
    return [423, { locked: true, error: "Fallaste 5 veces y bloqueamos tu clave por seguridad. Toca \u00bfOlvidaste tu clave? para cambiarla." }];
  }
  const left = MAX_TRIES - r.intentos;
  return [400, { error: "Clave incorrecta. " + (left === 1 ? "Te queda 1 intento." : "Te quedan " + left + " intentos.") }];
}
const pinCheck = verifyPin;

// ---------- WhatsApp (bot) ----------
// El bot (carpeta bot/) pregunta cada pocos segundos si hay mensajes y los manda desde tu numero.
const BOT_KEY = process.env.BOT_KEY || "";
let botSeen = 0;
const botUp = () => Date.now() - botSeen < 60000;
const botKeyOk = k => !!BOT_KEY && k.length === BOT_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(BOT_KEY));
const queueWA = (p, text) => pool.query("insert into outbox(phone, text) values($1,$2)", [p, text]);
// Alerta de seguridad al dueno de la cuenta (si el bot esta configurado)
const alertWA = (p, text) => { if (BOT_KEY) queueWA(p, text).catch(() => {}); };
// Registro de eventos de seguridad (quien, que, desde donde)
const audit = (ev, p, ip) => pool.query("insert into audit(phone, ev, ip) values($1,$2,$3)", [p || null, ev, ip || null]).catch(() => {});
// Llave de administrador: distinta a la del bot. Sin ADMIN_KEY las rutas de admin no existen.
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const adminKeyOk = k => !!ADMIN_KEY && k.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(ADMIN_KEY));
function adminGate(d, ip) {
  if (!ADMIN_KEY) return [404, { error: "No existe" }];
  if (locked("a:" + ip)) return [429, { error: "Espera." }];
  if (!adminKeyOk(String(d.key || ""))) { fail("a:" + ip); return [401, { error: "No autorizado" }]; }
  return null;
}
const NOBOT = [503, { error: "El WhatsApp de ParcePay no est\u00e1 disponible ahora. Intenta en un minuto." }];
// Sin BOT_KEY (bot sin configurar) el codigo sigue saliendo en la app como antes.
async function giveCode(p, tipo, monto, msg) {
  if (!BOT_KEY) return { code: await setCode(p, tipo, monto) };
  if (!botUp()) return null;
  const code = await setCode(p, tipo, monto);
  await queueWA(p, msg(code));
  return { wa: true };
}

// ---------- puntos de recarga ----------
const MUSTCHANGE = [403, { cambiar: true, error: "Debes cambiar tu clave antes de operar." }];
const PASS_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
function tempPass() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz", N = "23456789", pick = x => x[crypto.randomInt(x.length)];
  const a = [];
  for (let i = 0; i < 8; i++) a.push(pick(L));
  for (let i = 0; i < 4; i++) a.push(pick(N));
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.join("");
}
// Verifica usuario + clave del punto. Mismo mensaje exista o no el usuario. 5 fallos = cuenta bloqueada (la desbloquea el administrador).
async function puntoVerify(id, k, ip) {
  if (locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
  const BAD = [400, { error: "Usuario o clave incorrectos." }];
  if (!/^[a-z0-9_-]{3,24}$/.test(id) || k.length < 1 || k.length > 100) return BAD;
  const u = (await pool.query("select hash, salt, activo, bloqueado, intentos from puntos where id=$1", [id])).rows[0];
  if (!u) { fail("i:" + ip); await pinHash(k, "00".repeat(16)); return BAD; }
  if (u.bloqueado) return [423, { locked: true, error: "Esta cuenta est\u00e1 bloqueada. Contacta al administrador de ParcePay." }];
  if (!u.activo) return [403, { error: "Esta cuenta est\u00e1 desactivada. Contacta al administrador de ParcePay." }];
  const ok = crypto.timingSafeEqual(Buffer.from(await pinHash(k, u.salt)), Buffer.from(u.hash));
  if (ok) {
    if (u.intentos > 0) await pool.query("update puntos set intentos=0 where id=$1", [id]);
    return null;
  }
  fail("i:" + ip);
  const r = (await pool.query(
    "update puntos set intentos = intentos + 1, bloqueado = (intentos + 1 >= $2), tv = tv + (case when intentos + 1 >= $2 then 1 else 0 end) where id=$1 returning bloqueado",
    [id, MAX_TRIES])).rows[0];
  audit(r.bloqueado ? "punto_bloqueado" : "punto_clave_incorrecta", id, ip);
  if (r.bloqueado) return [423, { locked: true, error: "Fallaste 5 veces y la cuenta se bloque\u00f3. Contacta al administrador de ParcePay." }];
  return BAD;
}
async function puntoView(id) {
  const u = (await pool.query("select id, nombre, saldo, cambiar from puntos where id=$1", [id])).rows[0];
  const m = (await pool.query("select tipo, monto, cliente, (extract(epoch from created_at)*1000)::bigint as f from punto_movs where punto=$1 order by id desc limit 20", [id])).rows;
  const t = (await pool.query(
    `select count(*)::int as n, coalesce(sum(case when tipo='in' then monto end),0) as i, coalesce(sum(case when tipo='out' then monto end),0) as o
       from punto_movs where punto=$1 and tipo in ('in','out')
        and created_at >= (date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota')`, [id])).rows[0];
  return { id: u.id, nombre: u.nombre, saldo: Number(u.saldo), cambiar: u.cambiar,
    hoy: { n: t.n, i: Number(t.i), o: Number(t.o) },
    movs: m.map(x => ({ t: x.tipo, v: Number(x.monto), c: x.cliente ? "***" + x.cliente.slice(-4) : "", f: Number(x.f) })) };
}

const BAD_CODE = [400, { error: "N\u00famero o c\u00f3digo incorrecto, o el c\u00f3digo ya venci\u00f3." }];

// ---------- rutas ----------
const H = {
  "/api/exists": async (d, ip) => {
    if (rate("ex:" + ip, 20, 60000)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    const p = String(d.p || "");
    return [200, { exists: (await pool.query("select 1 from users where phone=$1", [p])).rowCount > 0 }];
  },

  "/api/register": async (d, ip) => {
    const p = String(d.p || ""), cc = String(d.cc || ""), k = String(d.k || "");
    const n = String(d.n || "").trim().slice(0, 60), a = String(d.a || "").trim().slice(0, 60), f = String(d.f || "").slice(0, 10);
    if (!phoneOk(p)) return [400, { error: "Celular inv\u00e1lido" }];
    if (!/^\d{6,10}$/.test(cc) || !n || !a || !f || !/^\d{4}$/.test(k)) return [400, { error: "Datos incompletos." }];
    if (BOT_KEY) {
      // Con el bot activo, la cuenta solo se crea con el codigo que llego por WhatsApp
      const c = String(d.c || "");
      if (!/^\d{6}$/.test(c)) return [400, { error: "Falta el c\u00f3digo de WhatsApp." }];
      if (locked("g:" + p)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
      const used = await pool.query("delete from codes where phone=$1 and tipo='reg' and code=$2 and expires_at > now()", [p, c]);
      if (used.rowCount === 0) { fail("g:" + p); return BAD_CODE; }
      clear("g:" + p);
    }
    const salt = crypto.randomBytes(16).toString("hex");
    try {
      // La cedula se guarda como huella (no en texto plano)
      await pool.query("insert into users(phone, cc, nombres, apellidos, nacimiento, salt, hash, hv) values($1,$2,$3,$4,$5,$6,$7,2)",
        [p, hmac("cc:" + cc), enc(n), enc(a), enc(f), salt, await pinHash(k, salt)]);
    } catch (e) {
      if (e.code === "23505") return [400, { error: "Ese n\u00famero ya tiene cuenta." }];
      throw e;
    }
    audit("registro", p, ip);
    return [200, { user: await pub(p), token: await sign(p) }];
  },

  "/api/login": async (d, ip) => {
    const p = String(d.p || "");
    if (!phoneOk(p)) return [400, { error: "Celular inv\u00e1lido" }];
    const bad = await verifyPin(p, String(d.k || ""), ip); if (bad) return bad;
    audit("login", p, ip);
    return [200, { user: await pub(p), token: await sign(p) }];
  },

  "/api/me": async d => {
    const p = await auth(d); if (!p) return NOAUTH;
    const u = await pub(p);
    return u ? [200, { user: u }] : NOAUTH;
  },

  // ---------- perfil (todos piden la clave actual en d.k) ----------
  "/api/profile/phone": async (d, ip) => {
    const p = await auth(d); if (!p) return NOAUTH;
    const np = String(d.v || "");
    if (!phoneOk(np)) return [400, { error: "Celular inv\u00e1lido" }];
    if (np === p) return [400, { error: "Ese ya es tu celular." }];
    const bad = await pinCheck(p, String(d.k || ""), ip); if (bad) return bad;
    try {
      // movs.phone apunta a users.phone: se crea la fila nueva, se pasan los movimientos y se borra la vieja
      await tx(async db => {
        await db.query("select 1 from users where phone=$1 for update", [p]);
        await db.query(
          `insert into users(phone, cc, nombres, apellidos, nacimiento, salt, hash, hv, tv, saldo, created_at)
           select $2::text, cc, nombres, apellidos, nacimiento, salt, hash, hv, tv + 1, saldo, created_at from users where phone=$1`, [p, np]);
        await db.query("update movs set phone=$2 where phone=$1", [p, np]);
        await db.query("delete from codes where phone=$1", [p]);
        await db.query("delete from users where phone=$1", [p]);
      });
    } catch (e) {
      if (e.code === "23505") return [400, { error: "Ese n\u00famero ya tiene cuenta." }];
      throw e;
    }
    audit("celular_cambiado", np, ip);
    alertWA(p, "ParcePay: el celular de tu cuenta se cambi\u00f3 a ***" + np.slice(-4) + ". Si no fuiste t\u00fa, contacta a soporte de inmediato.");
    return [200, { user: await pub(np), token: await sign(np) }];
  },

  "/api/profile/cc": async (d, ip) => {
    const p = await auth(d); if (!p) return NOAUTH;
    const cc = String(d.v || "");
    if (!/^\d{6,10}$/.test(cc)) return [400, { error: "La c\u00e9dula debe tener entre 6 y 10 n\u00fameros." }];
    const bad = await pinCheck(p, String(d.k || ""), ip); if (bad) return bad;
    await pool.query("update users set cc=$2 where phone=$1", [p, hmac("cc:" + cc)]);
    audit("cedula_cambiada", p, ip);
    return [200, { user: await pub(p), token: await sign(p) }];
  },

  "/api/profile/name": async (d, ip) => {
    const p = await auth(d); if (!p) return NOAUTH;
    const n = String(d.n || "").trim().slice(0, 60), a = String(d.a || "").trim().slice(0, 60);
    if (!n || !a) return [400, { error: "Escribe tus nombres y apellidos." }];
    const bad = await pinCheck(p, String(d.k || ""), ip); if (bad) return bad;
    await pool.query("update users set nombres=$2, apellidos=$3 where phone=$1", [p, enc(n), enc(a)]);
    return [200, { user: await pub(p), token: await sign(p) }];
  },

  "/api/profile/pin": async (d, ip) => {
    const p = await auth(d); if (!p) return NOAUTH;
    const nk = String(d.v || "");
    if (!/^\d{4}$/.test(nk)) return [400, { error: "La clave nueva debe tener 4 n\u00fameros." }];
    const bad = await pinCheck(p, String(d.k || ""), ip); if (bad) return bad;
    const salt = crypto.randomBytes(16).toString("hex");
    await pool.query("update users set salt=$2, hash=$3, hv=2, tv=tv+1 where phone=$1", [p, salt, await pinHash(nk, salt)]);
    audit("clave_cambiada", p, ip);
    alertWA(p, "ParcePay: se cambi\u00f3 la clave de tu cuenta. Si no fuiste t\u00fa, contacta a soporte de inmediato.");
    return [200, { user: await pub(p), token: await sign(p) }];
  },

  // ---------- olvide / bloqueo de clave: cedula + codigo por WhatsApp ----------
  "/api/reset/request": async (d, ip) => {
    const p = String(d.p || ""), cc = String(d.cc || "");
    if (!phoneOk(p) || !/^\d{6,10}$/.test(cc)) return [400, { error: "Datos inv\u00e1lidos." }];
    if (locked("r:" + p) || locked("ri:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    const u = (await pool.query("select cc from users where phone=$1", [p])).rows[0];
    const want = hmac("cc:" + cc);
    if (!u || u.cc.length !== want.length || !crypto.timingSafeEqual(Buffer.from(u.cc), Buffer.from(want))) {
      fail("r:" + p); fail("ri:" + ip);
      return [400, { error: "La c\u00e9dula no coincide con esa cuenta." }];
    }
    if (!BOT_KEY || !botUp()) return NOBOT;
    const recent = await pool.query("select 1 from codes where phone=$1 and tipo='reset' and expires_at > now() + interval '" + (CODE_TTL - 60) + " seconds'", [p]);
    if (recent.rowCount > 0) return [429, { error: "Ya te mandamos un c\u00f3digo. Espera un minuto para pedir otro." }];
    const code = await setCode(p, "reset", 0);
    await queueWA(p, "ParcePay: tu c\u00f3digo para cambiar la clave es " + code + ". Vence en 10 minutos. Si no fuiste t\u00fa, ignora este mensaje y no lo compartas.");
    return [200, { ok: true, ttl: CODE_TTL }];
  },

  "/api/reset/confirm": async (d, ip) => {
    const p = String(d.p || ""), c = String(d.c || ""), k = String(d.k || "");
    if (!phoneOk(p) || !/^\d{6}$/.test(c) || !/^\d{4}$/.test(k)) return [400, { error: "Datos inv\u00e1lidos." }];
    if (locked("r:" + p) || locked("ri:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    const salt = crypto.randomBytes(16).toString("hex");
    const ok = await tx(async db => {
      const e = (await db.query("select code from codes where phone=$1 and tipo='reset' and expires_at > now() for update", [p])).rows[0];
      if (!e || e.code !== c) return false;
      await db.query("update users set salt=$2, hash=$3, hv=2, tv=tv+1, intentos=0, bloqueada=false where phone=$1", [p, salt, await pinHash(k, salt)]);
      await db.query("delete from codes where phone=$1 and tipo='reset'", [p]);
      return true;
    });
    if (!ok) { fail("r:" + p); fail("ri:" + ip); return BAD_CODE; }
    clear("r:" + p); clear("ri:" + ip);
    audit("clave_restablecida", p, ip);
    alertWA(p, "ParcePay: se cambi\u00f3 la clave de tu cuenta con el c\u00f3digo de WhatsApp. Si no fuiste t\u00fa, contacta a soporte de inmediato.");
    return [200, { user: await pub(p), token: await sign(p) }];
  },

  // ---------- el bot de WhatsApp ----------
  "/api/bot/pull": async (d, ip) => {
    if (locked("b:" + ip)) return [429, { error: "Espera." }];
    if (!botKeyOk(String(d.key || ""))) { fail("b:" + ip); return [401, { error: "No autorizado" }]; }
    botSeen = Date.now();
    if (Math.random() < 0.05) await pool.query("delete from outbox where created_at < now() - interval '10 minutes'");
    const r = await pool.query(
      `update outbox set tries = tries + 1, claimed_at = now() where id in (
         select id from outbox where tries < 3 and created_at > now() - interval '10 minutes'
           and (claimed_at is null or claimed_at < now() - interval '30 seconds')
         order by id limit 10 for update skip locked) returning id, phone, text`);
    return [200, { msgs: r.rows }];
  },

  "/api/bot/done": async (d, ip) => {
    if (locked("b:" + ip)) return [429, { error: "Espera." }];
    if (!botKeyOk(String(d.key || ""))) { fail("b:" + ip); return [401, { error: "No autorizado" }]; }
    await pool.query("delete from outbox where id=$1", [Number(d.id) || 0]);
    return [200, { ok: true }];
  },

  // ---------- crear cuenta: codigo por WhatsApp ----------
  "/api/register/code": async (d, ip) => {
    const p = String(d.p || "");
    if (!phoneOk(p)) return [400, { error: "Celular inv\u00e1lido" }];
    if (!BOT_KEY) return [200, { skip: true }];
    if (locked("gi:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    fail("gi:" + ip); // cada pedido cuenta, para que nadie use el bot para llenar de mensajes a otros numeros
    if ((await pool.query("select 1 from users where phone=$1", [p])).rowCount > 0) return [400, { error: "Ese n\u00famero ya tiene cuenta. Inicia sesi\u00f3n." }];
    if (!botUp()) return NOBOT;
    const recent = await pool.query("select 1 from codes where phone=$1 and tipo='reg' and expires_at > now() + interval '" + (CODE_TTL - 60) + " seconds'", [p]);
    if (recent.rowCount > 0) return [429, { error: "Ya te mandamos un c\u00f3digo. Espera un minuto para pedir otro." }];
    const code = await setCode(p, "reg", 0);
    await queueWA(p, "ParcePay: tu c\u00f3digo para crear tu cuenta es " + code + ". Vence en 10 minutos. Si no fuiste t\u00fa, ignora este mensaje.");
    return [200, { ok: true }];
  },

  "/api/register/check": async d => {
    const p = String(d.p || ""), c = String(d.c || "");
    if (!BOT_KEY) return [200, { ok: true }];
    if (!phoneOk(p) || !/^\d{6}$/.test(c)) return BAD_CODE;
    if (locked("g:" + p)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    const e = await pool.query("select 1 from codes where phone=$1 and tipo='reg' and code=$2 and expires_at > now()", [p, c]);
    if (e.rowCount === 0) { fail("g:" + p); return BAD_CODE; }
    return [200, { ok: true }];
  },

  // Cerrar sesion: invalida el token (y cualquier otro de esa cuenta)
  "/api/logout": async d => {
    const p = await auth(d);
    if (p) await pool.query("update users set tv = tv + 1 where phone=$1", [p]);
    return [200, { ok: true }];
  },

  // ---------- administracion (solo con ADMIN_KEY) ----------
  "/api/admin/unlock": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const p = String(d.p || "");
    const r = await pool.query("update users set intentos=0, bloqueada=false where phone=$1", [p]);
    if (!r.rowCount) return [400, { error: "Ese numero no tiene cuenta." }];
    audit("admin_desbloqueo", p, ip);
    return [200, { ok: true }];
  },

  // Eliminar una cuenta. Con dry:true solo muestra de quien es.
  "/api/admin/delete": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const p = String(d.p || "");
    const u = (await pool.query("select nombres, apellidos, saldo from users where phone=$1", [p])).rows[0];
    if (!u) return [400, { error: "Ese numero no tiene cuenta." }];
    const info = { nombre: dec(u.nombres) + " " + dec(u.apellidos), saldo: Number(u.saldo) };
    if (d.dry) return [200, Object.assign({ dry: true }, info)];
    await tx(async db => {
      await db.query("delete from movs where phone=$1", [p]);
      await db.query("delete from codes where phone=$1", [p]);
      await db.query("delete from outbox where phone=$1", [p]);
      await db.query("delete from audit where phone=$1", [p]);
      await db.query("update punto_movs set cliente=null where cliente=$1", [p]);
      await db.query("delete from users where phone=$1", [p]);
    });
    audit("admin_cuenta_eliminada", null, ip);
    return [200, Object.assign({ ok: true }, info)];
  },

  // Que IP esta viendo el servidor (para comprobar que nadie puede falsificarla)
  "/api/admin/ip": async (d, ip, req) => {
    const g = adminGate(d, ip); if (g) return g;
    return [200, { ip, cf: req.headers["cf-connecting-ip"] || "", xff: req.headers["x-forwarded-for"] || "" }];
  },

  // Copia de seguridad (datos personales y claves siguen cifrados; solo sirve con el mismo SECRET)
  "/api/admin/backup": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const users = (await pool.query("select * from users order by created_at")).rows;
    const movs = (await pool.query("select * from movs order by id")).rows;
    const puntos = (await pool.query("select * from puntos order by created_at")).rows;
    const punto_movs = (await pool.query("select * from punto_movs order by id")).rows;
    audit("admin_respaldo", null, ip);
    return [200, { at: new Date().toISOString(), users, movs, puntos, punto_movs }];
  },

  // La app pide un codigo para RECIBIR plata (se usa en la web)
  "/api/deposit-code": async d => {
    const p = await auth(d); if (!p) return NOAUTH;
    const g = await giveCode(p, "in", 0, c => "ParcePay: tu c\u00f3digo para meter plata es " + c + ". D\u00e1selo solo al cajero de un punto ParcePay, en persona. Vence en 10 minutos. Nadie m\u00e1s debe pedirtelo.");
    if (!g) return NOBOT;
    return [200, Object.assign({ phone: p, ttl: CODE_TTL }, g)];
  },

  // La app pide un codigo para SACAR plata (se usa en el cajero de la web)
  "/api/withdraw-code": async d => {
    const p = await auth(d); if (!p) return NOAUTH;
    const v = Math.floor(Number(d.v));
    if (!(v > 0 && v <= 10000000)) return [400, { error: "Monto inv\u00e1lido." }];
    const u = (await pool.query("select saldo from users where phone=$1", [p])).rows[0];
    if (!u) return NOAUTH;
    if (v > Number(u.saldo)) return [400, { error: "No te alcanza. Disponible: " + money(Number(u.saldo)) }];
    const g = await giveCode(p, "out", v, c => "ParcePay: tu c\u00f3digo para sacar " + money(v) + " en un punto ParcePay es " + c + ". D\u00e1selo solo al cajero, en persona. Vence en 10 minutos. Nadie m\u00e1s debe pedirtelo.");
    if (!g) return NOBOT;
    return [200, Object.assign({ phone: p, ttl: CODE_TTL, v }, g)];
  },

  // ======================= PUNTOS DE RECARGA (cajeros con cuenta) =======================
  // Cada punto tiene un CUPO: al meter plata a un cliente se le descuenta del cupo; al entregar un retiro, se le suma.
  // Asi nadie puede crear dinero de la nada.
  "/api/punto/login": async (d, ip) => {
    const id = String(d.u || "").trim().toLowerCase(), k = String(d.k || "");
    const bad = await puntoVerify(id, k, ip); if (bad) return bad;
    audit("punto_login", id, ip);
    const u = (await pool.query("select cambiar from puntos where id=$1", [id])).rows[0];
    return [200, { token: await signPunto(id), cambiar: u.cambiar }];
  },

  "/api/punto/me": async d => {
    const pt = await authPunto(d); if (!pt) return NOAUTH;
    return [200, await puntoView(pt.id)];
  },

  "/api/punto/logout": async d => {
    const pt = await authPunto(d);
    if (pt) await pool.query("update puntos set tv = tv + 1 where id=$1", [pt.id]);
    return [200, { ok: true }];
  },

  "/api/punto/clave": async (d, ip) => {
    const pt = await authPunto(d); if (!pt) return NOAUTH;
    const k = String(d.k || ""), nk = String(d.nk || "");
    if (!PASS_RE.test(nk)) return [400, { error: "La clave nueva debe tener m\u00ednimo 8 caracteres, con letras y n\u00fameros." }];
    if (nk === k) return [400, { error: "La clave nueva debe ser distinta a la actual." }];
    const bad = await puntoVerify(pt.id, k, ip);
    if (bad) return bad[0] === 400 ? [400, { error: "Tu clave actual no es correcta." }] : bad;
    const salt = crypto.randomBytes(16).toString("hex");
    await pool.query("update puntos set salt=$2, hash=$3, hv=2, cambiar=false, tv=tv+1 where id=$1", [pt.id, salt, await pinHash(nk, salt)]);
    audit("punto_clave_cambiada", pt.id, ip);
    return [200, { ok: true, token: await signPunto(pt.id) }];
  },

  // Paso 1: el cajero escribe celular + codigo; se le muestra QUIEN es (y el monto del retiro) sin gastar el codigo
  "/api/punto/check": async (d, ip) => {
    const pt = await authPunto(d); if (!pt) return NOAUTH;
    if (pt.cambiar) return MUSTCHANGE;
    const p = String(d.p || ""), c = String(d.c || ""), tipo = d.tipo === "out" ? "out" : "in";
    if (rate("pt:" + pt.id, 40, 60000)) return [429, { error: "Demasiadas operaciones seguidas. Espera un momento." }];
    if (locked("w:" + p) || locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    if (!phoneOk(p) || !/^\d{6}$/.test(c)) { fail("i:" + ip); return BAD_CODE; }
    const e = (await pool.query(
      "select c.monto, u.nombres, u.apellidos, u.saldo from codes c join users u on u.phone = c.phone where c.phone=$1 and c.tipo=$2 and c.code=$3 and c.expires_at > now()",
      [p, tipo, c])).rows[0];
    if (!e) { fail("w:" + p); fail("i:" + ip); return BAD_CODE; }
    if (tipo === "out" && Number(e.saldo) < Number(e.monto)) return [400, { error: "La cuenta ya no tiene saldo suficiente." }];
    const nombre = dec(e.nombres).split(" ")[0] + " " + dec(e.apellidos).slice(0, 1) + ".";
    return [200, { n: nombre, p: "***" + p.slice(-4), v: tipo === "out" ? Number(e.monto) : null }];
  },

  // Paso 2a: meter plata. El cliente entrega efectivo; sale del cupo del punto y entra a su cuenta.
  "/api/punto/deposit": async (d, ip) => {
    const pt = await authPunto(d); if (!pt) return NOAUTH;
    if (pt.cambiar) return MUSTCHANGE;
    const p = String(d.p || ""), c = String(d.c || ""), m = Math.floor(Number(d.m));
    if (rate("pt:" + pt.id, 40, 60000)) return [429, { error: "Demasiadas operaciones seguidas. Espera un momento." }];
    if (locked("w:" + p) || locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    if (!(m > 0 && m <= 10000000)) return [400, { error: "El monto debe estar entre $1 y $10.000.000." }];
    const r = await tx(async db => {
      const a = (await db.query("select saldo from puntos where id=$1 for update", [pt.id])).rows[0];
      const e = (await db.query("select code from codes where phone=$1 and tipo='in' and expires_at > now() for update", [p])).rows[0];
      if (!phoneOk(p) || !e || e.code !== c) return { bad: true };
      if (Number(a.saldo) < m) return { err: "Tu punto no tiene cupo suficiente. Cupo disponible: " + money(Number(a.saldo)) + "." };
      const cupo = (await db.query("update puntos set saldo = saldo - $2 where id=$1 returning saldo", [pt.id, m])).rows[0].saldo;
      const u = await db.query("update users set saldo = saldo + $2 where phone=$1 returning nombres, saldo", [p, m]);
      await db.query("insert into movs(phone, tipo, monto, detalle) values($1,'in',$2,$3)", [p, m, "Recarga en " + pt.nombre]);
      await db.query("insert into punto_movs(punto, tipo, monto, cliente, saldo_despues) values($1,'in',$2,$3,$4)", [pt.id, m, p, cupo]);
      await db.query("delete from codes where phone=$1 and tipo='in'", [p]);
      return { n: dec(u.rows[0].nombres).split(" ")[0], s: Number(u.rows[0].saldo), cupo: Number(cupo) };
    });
    if (r.bad) { fail("w:" + p); fail("i:" + ip); return BAD_CODE; }
    if (r.err) return [400, { error: r.err }];
    clear("w:" + p); clear("i:" + ip);
    audit("punto_deposito", pt.id, ip);
    alertWA(p, "ParcePay: se metieron " + money(m) + " a tu cuenta en " + pt.nombre + ". Tu saldo ahora es " + money(r.s) + ". Si no fuiste t\u00fa, contacta a soporte de inmediato.");
    return [200, { ok: true, v: m, n: r.n, cupo: r.cupo }];
  },

  // Paso 2b: retiro. Sale de la cuenta del cliente; el cajero entrega el efectivo y el monto entra a su cupo.
  "/api/punto/withdraw": async (d, ip) => {
    const pt = await authPunto(d); if (!pt) return NOAUTH;
    if (pt.cambiar) return MUSTCHANGE;
    const p = String(d.p || ""), c = String(d.c || "");
    if (rate("pt:" + pt.id, 40, 60000)) return [429, { error: "Demasiadas operaciones seguidas. Espera un momento." }];
    if (locked("w:" + p) || locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    const r = await tx(async db => {
      await db.query("select 1 from puntos where id=$1 for update", [pt.id]);
      const e = (await db.query("select code, monto from codes where phone=$1 and tipo='out' and expires_at > now() for update", [p])).rows[0];
      if (!phoneOk(p) || !e || e.code !== c) return { bad: true };
      const v = Number(e.monto);
      const u = await db.query("update users set saldo = saldo - $2 where phone=$1 and saldo >= $2 returning nombres, saldo", [p, v]);
      if (u.rowCount === 0) return { err: "La cuenta ya no tiene saldo suficiente." };
      const cupo = (await db.query("update puntos set saldo = saldo + $2 where id=$1 returning saldo", [pt.id, v])).rows[0].saldo;
      await db.query("insert into movs(phone, tipo, monto, detalle) values($1,'out',$2,$3)", [p, v, "Retiro en " + pt.nombre]);
      await db.query("insert into punto_movs(punto, tipo, monto, cliente, saldo_despues) values($1,'out',$2,$3,$4)", [pt.id, v, p, cupo]);
      await db.query("delete from codes where phone=$1 and tipo='out'", [p]);
      return { v, n: dec(u.rows[0].nombres).split(" ")[0], s: Number(u.rows[0].saldo), cupo: Number(cupo) };
    });
    if (r.bad) { fail("w:" + p); fail("i:" + ip); return BAD_CODE; }
    if (r.err) return [400, { error: r.err }];
    clear("w:" + p); clear("i:" + ip);
    audit("punto_retiro", pt.id, ip);
    alertWA(p, "ParcePay: retiraste " + money(r.v) + " en " + pt.nombre + ". Tu saldo ahora es " + money(r.s) + ". Si no fuiste t\u00fa, contacta a soporte de inmediato.");
    return [200, { ok: true, v: r.v, n: r.n, cupo: r.cupo }];
  },

  // ---------- administracion de puntos (ADMIN_KEY) ----------
  "/api/admin/punto-crear": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const id = String(d.u || "").trim().toLowerCase(), nombre = String(d.nombre || "").trim().slice(0, 40);
    if (!/^[a-z0-9_-]{3,24}$/.test(id) || nombre.length < 2) return [400, { error: "Usuario: 3 a 24 letras, numeros, _ o -. Nombre: minimo 2 letras." }];
    const temp = tempPass(), salt = crypto.randomBytes(16).toString("hex");
    try {
      await pool.query("insert into puntos(id, nombre, salt, hash, hv, cambiar) values($1,$2,$3,$4,2,true)", [id, nombre, salt, await pinHash(temp, salt)]);
    } catch (e) {
      if (e.code === "23505") return [400, { error: "Ese usuario ya existe." }];
      throw e;
    }
    audit("admin_punto_creado", id, ip);
    return [200, { u: id, nombre, clave_temporal: temp }];
  },

  // Suma (o resta, con numero negativo) cupo a un punto
  "/api/admin/punto-cupo": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const id = String(d.u || "").trim().toLowerCase(), v = Math.trunc(Number(d.v));
    if (!Number.isFinite(v) || v === 0 || Math.abs(v) > 1e9) return [400, { error: "Valor invalido." }];
    const r = await tx(async db => {
      const u = await db.query("update puntos set saldo = saldo + $2 where id=$1 and saldo + $2 >= 0 returning saldo", [id, v]);
      if (u.rowCount === 0) return null;
      await db.query("insert into punto_movs(punto, tipo, monto, saldo_despues) values($1,'cupo',$2,$3)", [id, v, u.rows[0].saldo]);
      return Number(u.rows[0].saldo);
    });
    if (r === null) return [400, { error: "Ese punto no existe, o el cupo quedaria negativo." }];
    audit("admin_punto_cupo", id, ip);
    return [200, { u: id, cupo: r }];
  },

  // Clave temporal nueva (tambien desbloquea y cierra sus sesiones)
  "/api/admin/punto-clave": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const id = String(d.u || "").trim().toLowerCase(), temp = tempPass(), salt = crypto.randomBytes(16).toString("hex");
    const r = await pool.query("update puntos set salt=$2, hash=$3, hv=2, cambiar=true, intentos=0, bloqueado=false, tv=tv+1 where id=$1", [id, salt, await pinHash(temp, salt)]);
    if (!r.rowCount) return [400, { error: "Ese punto no existe." }];
    audit("admin_punto_clave", id, ip);
    return [200, { u: id, clave_temporal: temp }];
  },

  "/api/admin/punto-estado": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const id = String(d.u || "").trim().toLowerCase(), on = d.activo === true;
    const r = await pool.query("update puntos set activo=$2, tv=tv+1 where id=$1", [id, on]);
    if (!r.rowCount) return [400, { error: "Ese punto no existe." }];
    audit(on ? "admin_punto_activado" : "admin_punto_desactivado", id, ip);
    return [200, { u: id, activo: on }];
  },

  "/api/admin/punto-lista": async (d, ip) => {
    const g = adminGate(d, ip); if (g) return g;
    const r = await pool.query("select id, nombre, saldo, activo, bloqueado, cambiar from puntos order by id");
    return [200, { puntos: r.rows.map(x => ({ u: x.id, nombre: x.nombre, cupo: Number(x.saldo), activo: x.activo, bloqueado: x.bloqueado, clave_temporal: x.cambiar })) }];
  }
};

// ---------- servidor HTTP ----------
// Pagina web: CSP con la huella de sus scripts/estilos (no se permite nada mas)
let WEB_HTML = null, CSP = "";
function loadWeb() {
  try {
    WEB_HTML = fs.readFileSync(WEB);
    const t = WEB_HTML.toString("utf8");
    const h = re => Array.from(t.matchAll(re)).map(m => "'sha256-" + crypto.createHash("sha256").update(m[1]).digest("base64") + "'").join(" ");
    CSP = "default-src 'none'; script-src " + h(/<script>([\s\S]*?)<\/script>/g) + "; style-src " + h(/<style>([\s\S]*?)<\/style>/g) +
      "; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
  } catch (e) { WEB_HTML = null; }
}

// IP real del cliente. Render agrega a X-Forwarded-For sin borrar lo que mande el cliente, asi que el primer valor
// se puede falsificar: se usa el encabezado que pone Cloudflare y, si no esta, el penultimo de X-Forwarded-For.
function clientIp(req) {
  const cf = String(req.headers["cf-connecting-ip"] || "").trim();
  if (cf) return cf;
  const xs = String(req.headers["x-forwarded-for"] || "").split(",").map(x => x.trim()).filter(Boolean);
  if (xs.length >= 2) return xs[xs.length - 2];
  return xs[0] || req.socket.remoteAddress || "?";
}

const server = http.createServer((req, res) => {
  const ip = clientIp(req);
  const url = req.url.split("?")[0];
  if (req.method === "GET") {
    if (url === "/health") { res.writeHead(200, Object.assign({ "Content-Type": "text/plain" }, SEC)); return res.end("ok"); }
    if (url === "/" || url === "/index.html") {
      if (!WEB_HTML) { res.writeHead(404); return res.end("Falta web/index.html"); }
      res.writeHead(200, Object.assign({ "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP, "Cache-Control": "no-cache" }, SEC));
      return res.end(WEB_HTML);
    }
    res.writeHead(404, SEC); return res.end();
  }
  if (req.method === "OPTIONS") { res.writeHead(204, SEC); return res.end(); }
  if (req.method !== "POST") return send(res, 404, { error: "No existe" });
  if (rate("gl:" + ip, 240, 60000)) return send(res, 429, { error: "Muchas solicitudes. Espera un momento." });
  let b = ""; req.on("data", c => { b += c; if (b.length > 1e4) req.destroy(); });
  req.on("end", () => {
    let d; try { d = JSON.parse(b); } catch (e) { return send(res, 400, { error: "Datos inv\u00e1lidos" }); }
    if (d === null || typeof d !== "object") return send(res, 400, { error: "Datos inv\u00e1lidos" });
    const h = H[url];
    if (!h) return send(res, 404, { error: "No existe" });
    Promise.resolve().then(() => h(d, ip, req))
      .then(r => send(res, r[0], r[1]))
      .catch(e => { console.error(e); send(res, 500, { error: "Error del servidor" }); });
  });
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 65000;
process.on("unhandledRejection", e => console.error("unhandledRejection:", e && e.message));

// Limpieza periodica: memoria de limites, codigos vencidos y bitacora vieja (180 dias)
setInterval(() => {
  const now = Date.now();
  for (const k in fails) if (fails[k].until < now && now - fails[k].t > 600000) delete fails[k];
  for (const k in hits) { hits[k] = hits[k].filter(t => now - t < 120000); if (!hits[k].length) delete hits[k]; }
  pool.query("delete from codes where expires_at < now()").catch(() => {});
  pool.query("delete from audit where at < now() - interval '180 days'").catch(() => {});
}, 300000).unref();

loadWeb();
init()
  .then(() => server.listen(PORT, HOST, () => console.log("ParcePay listo en el puerto " + PORT)))
  .catch(e => { console.error("No pude conectar con la base de datos:", e.message); process.exit(1); });
