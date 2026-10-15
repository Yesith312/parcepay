package com.parcepay.app;

import android.app.Activity;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Comunicacion con el servidor (Render). La direccion viene de server_url.txt (Config.URL). */
final class Api {
    static final String BASE = Config.URL + "/api/";

    interface Cb { void on(JSONObject r); }

    static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception e) { }
        return o;
    }

    /** Despierta el servidor (Render lo duerme tras 15 min sin uso). */
    static void wake() {
        new Thread(new Runnable() {
            public void run() {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(Config.URL + "/health").openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(90000);
                    c.getResponseCode();
                    c.disconnect();
                } catch (Exception e) { }
            }
        }).start();
    }

    static void call(final Activity act, final String path, final JSONObject body, final Cb cb) {
        new Thread(new Runnable() {
            public void run() {
                JSONObject r;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(BASE + path).openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(80000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    OutputStream o = c.getOutputStream();
                    o.write(body.toString().getBytes("UTF-8"));
                    o.close();
                    InputStream in = c.getResponseCode() >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[1024];
                    int n;
                    while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                    in.close();
                    r = new JSONObject(bo.toString("UTF-8"));
                } catch (Exception e) {
                    r = obj("error", "No hay conexi\u00f3n con el servidor. Revisa tu internet y vuelve a intentar.");
                }
                final JSONObject f = r;
                act.runOnUiThread(new Runnable() { public void run() { cb.on(f); } });
            }
        }).start();
    }
}
