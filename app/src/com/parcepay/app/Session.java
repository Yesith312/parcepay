package com.parcepay.app;

import org.json.JSONObject;
import java.text.NumberFormat;
import java.util.Locale;

/** Datos de la sesion actual. */
final class Session {
    static JSONObject user;
    static String token = "";
    static boolean hidden = false;

    static String fmt(double v) {
        return "$" + NumberFormat.getInstance(new Locale("es", "CO")).format(Math.round(v));
    }

    static String money() { return fmt(user == null ? 0 : user.optDouble("s", 0)); }

    /** Cerrar sesion NO borra el numero guardado: la proxima vez sale directo la clave. */
    static void clear() { user = null; token = ""; hidden = false; }

    static String saved() {
        try { return Ui.c.getSharedPreferences("parcepay", 0).getString("phone", ""); }
        catch (Exception e) { return ""; }
    }

    static void save(String p) {
        try { Ui.c.getSharedPreferences("parcepay", 0).edit().putString("phone", p).apply(); }
        catch (Exception e) { }
    }

    static void forget() {
        try { Ui.c.getSharedPreferences("parcepay", 0).edit().remove("phone").apply(); }
        catch (Exception e) { }
    }

    static boolean validPhone(String p) { return p != null && p.matches("3\\d{9}"); }

    /** 3001234567 -> 300 123 4567 */
    static String pretty(String p) {
        if (!validPhone(p)) return p == null ? "" : p;
        return p.substring(0, 3) + " " + p.substring(3, 6) + " " + p.substring(6);
    }
}
