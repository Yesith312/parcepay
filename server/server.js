// Servidor de ParcePay para Render: Node + PostgreSQL (sin framework).
// Variables: DATABASE_URL (la pone Render), SECRET (la pone Render), PORT (la pone Render)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
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
const WEB = path.join(__dirname, "web", "index.html");
const CODE_TTL = 600; // segundos que dura un codigo

// ---------- utilidades ----------
const money = v => "$" + Math.round(v).toLocaleString("es-CO");
const phoneOk = p => /^3\d{9}$/.test(p);
const hash = (k, salt) => crypto.scryptSync(k, salt, 32).toString("hex");
const hmac = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
const genCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const NOAUTH = [401, { error: "Sesi\u00f3n vencida. Entra de nuevo." }];

// Sesiones sin estado: el token va firmado, asi sobrevive a los reinicios de Render
function sign(p) {
  const body = Buffer.from(JSON.stringify({ p, exp: Date.now() + 12 * 3600e3 })).toString("base64url");
  return body + "." + hmac(body);
}
function auth(d) {
  const t = String(d.t || "").split(".");
  if (t.length !== 2) return null;
  const sig = hmac(t[0]);
  if (sig.length !== t[1].length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(t[1]))) return null;
  try { const x = JSON.parse(Buffer.from(t[0], "base64url").toString()); return x.exp > Date.now() ? x.p : null; }
  catch (e) { return null; }
}

// Limite de intentos fallidos (en memoria)
const fails = {};
const locked = k => !!(fails[k] && fails[k].until > Date.now());
function fail(k) { const f = fails[k] || { c: 0, until: 0 }; if (++f.c >= 5) { f.c = 0; f.until = Date.now() + 60000; } fails[k] = f; }
const clear = k => { delete fails[k]; };

function send(res, c, o) {
  res.writeHead(c, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
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
}

async function pub(p) {
  const u = (await pool.query("select nombres, apellidos, saldo from users where phone=$1", [p])).rows[0];
  if (!u) return null;
  const m = (await pool.query(
    "select tipo, monto, detalle, (extract(epoch from created_at)*1000)::bigint as f from movs where phone=$1 order by id desc limit 15", [p])).rows;
  return { n: u.nombres, a: u.apellidos, s: Number(u.saldo), p,
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
const BAD_CODE = [400, { error: "N\u00famero o c\u00f3digo incorrecto, o el c\u00f3digo ya venci\u00f3." }];

// ---------- rutas ----------
const H = {
  "/api/exists": async d => {
    const p = String(d.p || "");
    return [200, { exists: (await pool.query("select 1 from users where phone=$1", [p])).rowCount > 0 }];
  },

  "/api/register": async d => {
    const p = String(d.p || ""), cc = String(d.cc || ""), k = String(d.k || "");
    const n = String(d.n || "").trim().slice(0, 60), a = String(d.a || "").trim().slice(0, 60), f = String(d.f || "").slice(0, 10);
    if (!phoneOk(p)) return [400, { error: "Celular inv\u00e1lido" }];
    if (!/^\d{6,10}$/.test(cc) || !n || !a || !f || !/^\d{4}$/.test(k)) return [400, { error: "Datos incompletos." }];
    const salt = crypto.randomBytes(16).toString("hex");
    try {
      // La cedula se guarda como huella (no en texto plano)
      await pool.query("insert into users(phone, cc, nombres, apellidos, nacimiento, salt, hash) values($1,$2,$3,$4,$5,$6,$7)",
        [p, hmac("cc:" + cc), n, a, f, salt, hash(k, salt)]);
    } catch (e) {
      if (e.code === "23505") return [400, { error: "Ese n\u00famero ya tiene cuenta." }];
      throw e;
    }
    return [200, { user: await pub(p), token: sign(p) }];
  },

  "/api/login": async (d, ip) => {
    const p = String(d.p || "");
    if (!phoneOk(p)) return [400, { error: "Celular inv\u00e1lido" }];
    if (locked("l:" + p) || locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    const u = (await pool.query("select salt, hash from users where phone=$1", [p])).rows[0];
    if (!u) return [400, { error: "Ese n\u00famero no tiene cuenta." }];
    const ok = crypto.timingSafeEqual(Buffer.from(hash(String(d.k || ""), u.salt)), Buffer.from(u.hash));
    if (!ok) { fail("l:" + p); fail("i:" + ip); return [400, { error: "Clave incorrecta. Intenta de nuevo." }]; }
    clear("l:" + p);
    return [200, { user: await pub(p), token: sign(p) }];
  },

  "/api/me": async d => {
    const p = auth(d); if (!p) return NOAUTH;
    const u = await pub(p);
    return u ? [200, { user: u }] : NOAUTH;
  },

  // La app pide un codigo para RECIBIR plata (se usa en la web)
  "/api/deposit-code": async d => {
    const p = auth(d); if (!p) return NOAUTH;
    return [200, { code: await setCode(p, "in", 0), phone: p, ttl: CODE_TTL }];
  },

  // La app pide un codigo para SACAR plata (se usa en el cajero de la web)
  "/api/withdraw-code": async d => {
    const p = auth(d); if (!p) return NOAUTH;
    const v = Math.floor(Number(d.v));
    if (!(v > 0 && v <= 10000000)) return [400, { error: "Monto inv\u00e1lido." }];
    const u = (await pool.query("select saldo from users where phone=$1", [p])).rows[0];
    if (!u) return NOAUTH;
    if (v > Number(u.saldo)) return [400, { error: "No te alcanza. Disponible: " + money(Number(u.saldo)) }];
    return [200, { code: await setCode(p, "out", v), phone: p, ttl: CODE_TTL, v }];
  },

  // Web: meter plata con celular + codigo + monto
  "/api/web/deposit": async (d, ip) => {
    const p = String(d.p || ""), c = String(d.c || ""), m = Math.floor(Number(d.m));
    if (locked("w:" + p) || locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    if (!(m > 0 && m <= 10000000)) return [400, { error: "El monto debe estar entre $1 y $10.000.000." }];
    const r = await tx(async db => {
      const e = (await db.query("select code from codes where phone=$1 and tipo='in' and expires_at > now() for update", [p])).rows[0];
      if (!phoneOk(p) || !e || e.code !== c) return null;
      await db.query("update users set saldo = saldo + $2 where phone=$1", [p, m]);
      await db.query("insert into movs(phone, tipo, monto, detalle) values($1,'in',$2,'Recarga en la web')", [p, m]);
      await db.query("delete from codes where phone=$1 and tipo='in'", [p]);
      return (await db.query("select nombres from users where phone=$1", [p])).rows[0].nombres.split(" ")[0];
    });
    if (!r) { fail("w:" + p); fail("i:" + ip); return BAD_CODE; }
    clear("w:" + p); clear("i:" + ip);
    return [200, { ok: true, v: m, n: r }];
  },

  // Web (cajero): sacar plata con celular + codigo
  "/api/web/withdraw": async (d, ip) => {
    const p = String(d.p || ""), c = String(d.c || "");
    if (locked("w:" + p) || locked("i:" + ip)) return [429, { error: "Muchos intentos. Espera 1 minuto." }];
    const r = await tx(async db => {
      const e = (await db.query("select code, monto from codes where phone=$1 and tipo='out' and expires_at > now() for update", [p])).rows[0];
      if (!phoneOk(p) || !e || e.code !== c) return { bad: true };
      const v = Number(e.monto);
      const u = await db.query("update users set saldo = saldo - $2 where phone=$1 and saldo >= $2 returning nombres", [p, v]);
      if (u.rowCount === 0) return { err: "La cuenta ya no tiene saldo suficiente." };
      await db.query("insert into movs(phone, tipo, monto, detalle) values($1,'out',$2,'Retiro en cajero web')", [p, v]);
      await db.query("delete from codes where phone=$1 and tipo='out'", [p]);
      return { v, n: u.rows[0].nombres.split(" ")[0] };
    });
    if (r.bad) { fail("w:" + p); fail("i:" + ip); return BAD_CODE; }
    if (r.err) return [400, { error: r.err }];
    clear("w:" + p); clear("i:" + ip);
    return [200, { ok: true, v: r.v, n: r.n }];
  }
};

// ---------- servidor HTTP ----------
const server = http.createServer((req, res) => {
  const ip = (String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
  const url = req.url.split("?")[0];
  if (req.method === "GET") {
    if (url === "/health") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
    if (url === "/" || url === "/index.html") {
      return fs.readFile(WEB, (e, b) => {
        if (e) { res.writeHead(404); return res.end("Falta web/index.html"); }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(b);
      });
    }
    res.writeHead(404); return res.end();
  }
  if (req.method === "OPTIONS") return send(res, 200, {});
  if (req.method !== "POST") return send(res, 404, { error: "No existe" });
  let b = ""; req.on("data", c => { b += c; if (b.length > 1e4) req.destroy(); });
  req.on("end", () => {
    let d; try { d = JSON.parse(b); } catch (e) { return send(res, 400, { error: "Datos inv\u00e1lidos" }); }
    const h = H[url];
    if (!h) return send(res, 404, { error: "No existe" });
    Promise.resolve().then(() => h(d, ip))
      .then(r => send(res, r[0], r[1]))
      .catch(e => { console.error(e); send(res, 500, { error: "Error del servidor" }); });
  });
});

init()
  .then(() => server.listen(PORT, HOST, () => console.log("ParcePay listo en el puerto " + PORT)))
  .catch(e => { console.error("No pude conectar con la base de datos:", e.message); process.exit(1); });
