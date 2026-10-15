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

    static void clear() { user = null; token = ""; hidden = false; }
}
