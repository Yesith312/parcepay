package com.parcepay.app;

import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.regex.Pattern;

/** Cambiar un dato del perfil. Siempre pide la clave actual para confirmar que eres tu. */
class EditProfileScreen extends Screen {
    static final int PHONE = 0, CC = 1, NAME = 2, PIN = 3;
    static final int PASS = InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD;
    final int kind;
    View view;
    EditText e1, e2, etK;
    TextView err;
    boolean busy = false;

    EditProfileScreen(MainActivity a, int kind) {
        super(a);
        this.kind = kind;
    }

    View build() {
        if (view != null) return view;
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        String[] titles = {"Cambiar celular", "Cambiar c\u00e9dula", "Cambiar nombres", "Cambiar clave"};
        p.addView(Ui.tv(titles[kind], 24, Theme.INK, true));
        TextView s = Ui.tv("Confirma con tu clave actual para guardar.", 15, Theme.MUT, false);
        s.setPadding(0, Ui.dp(4), 0, 0);
        p.addView(s);

        if (kind == PHONE) {
            p.addView(Ui.label("Nuevo celular"));
            e1 = Ui.edit("3001234567", InputType.TYPE_CLASS_NUMBER, 10);
            p.addView(e1);
        } else if (kind == CC) {
            p.addView(Ui.label("Nueva c\u00e9dula"));
            e1 = Ui.edit("", InputType.TYPE_CLASS_NUMBER, 10);
            p.addView(e1);
        } else if (kind == NAME) {
            p.addView(Ui.label("Nombres"));
            e1 = Ui.edit("", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, 60);
            e1.setText(Session.user.optString("n"));
            p.addView(e1);
            p.addView(Ui.label("Apellidos"));
            e2 = Ui.edit("", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, 60);
            e2.setText(Session.user.optString("a"));
            p.addView(e2);
        } else {
            p.addView(Ui.label("Clave nueva (4 n\u00fameros)"));
            e1 = Ui.edit("", PASS, 4);
            p.addView(e1);
            p.addView(Ui.label("Repite la clave nueva"));
            e2 = Ui.edit("", PASS, 4);
            p.addView(e2);
        }
        p.addView(Ui.label("Tu clave actual"));
        etK = Ui.edit("", PASS, 4);
        p.addView(etK);
        err = Ui.tv("", 14, Theme.RED, false);
        err.setPadding(0, Ui.dp(10), 0, Ui.dp(6));
        p.addView(err);
        p.addView(Ui.spacer());
        p.addView(Ui.btn("Guardar", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        }));
        ScrollView sc = new ScrollView(a);
        sc.setFillViewport(true);
        sc.setBackgroundColor(Theme.WHITE);
        sc.addView(p);
        view = sc;
        return sc;
    }

    void submit() {
        if (busy) return;
        String v1 = e1.getText().toString().trim();
        String v2 = e2 == null ? "" : e2.getText().toString().trim();
        String k = etK.getText().toString();
        String path;
        JSONObject body;
        if (kind == PHONE) {
            if (!Pattern.matches("3\\d{9}", v1)) { err.setText("El celular debe tener 10 n\u00fameros y empezar por 3."); return; }
            if (v1.equals(Session.user.optString("p"))) { err.setText("Ese ya es tu celular."); return; }
            path = "profile/phone";
            body = Api.obj("t", Session.token, "k", k, "v", v1);
        } else if (kind == CC) {
            if (!Pattern.matches("\\d{6,10}", v1)) { err.setText("La c\u00e9dula debe tener entre 6 y 10 n\u00fameros."); return; }
            path = "profile/cc";
            body = Api.obj("t", Session.token, "k", k, "v", v1);
        } else if (kind == NAME) {
            if (v1.length() == 0 || v2.length() == 0) { err.setText("Escribe tus nombres y apellidos."); return; }
            path = "profile/name";
            body = Api.obj("t", Session.token, "k", k, "n", v1, "a", v2);
        } else {
            if (!Pattern.matches("\\d{4}", v1)) { err.setText("La clave nueva debe tener 4 n\u00fameros."); return; }
            if (!v1.equals(v2)) { err.setText("Las claves nuevas no coinciden."); return; }
            path = "profile/pin";
            body = Api.obj("t", Session.token, "k", k, "v", v1);
        }
        if (!Pattern.matches("\\d{4}", k)) { err.setText("Escribe tu clave actual (4 n\u00fameros)."); return; }
        err.setText("");
        busy = true;
        Api.call(a, path, body, new Api.Cb() {
            public void on(JSONObject r) {
                busy = false;
                if (r.has("error")) {
                    String m = r.optString("error");
                    if (m.startsWith("Sesi")) { Session.clear(); a.go(a.entry(), true); return; }
                    err.setText(m);
                    return;
                }
                JSONObject u = r.optJSONObject("user");
                if (u != null) Session.user = u;
                String t = r.optString("token");
                if (t.length() > 0) Session.token = t;
                Session.save(Session.user.optString("p"));
                Toast.makeText(a, "Listo, datos actualizados.", Toast.LENGTH_LONG).show();
                a.go(new ProfileScreen(a), true);
            }
        });
    }

    boolean onBack() { a.go(new ProfileScreen(a), true); return true; }
}
