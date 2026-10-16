package com.parcepay.app;

import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.regex.Pattern;

/** Cambiar la clave si se olvido o se bloqueo: cedula + codigo que llega por WhatsApp. */
class ResetScreen extends Screen {
    final Screen prev;
    final String phone;
    int step = 1;
    boolean busy = false;
    View view;
    TextView sub, err;
    EditText etCC, etC, etK1, etK2;
    LinearLayout g1, g2;
    Button go;

    ResetScreen(MainActivity a, Screen prev, String phone) {
        super(a);
        this.prev = prev;
        this.phone = phone;
    }

    View build() {
        if (view != null) return view;
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv("Cambiar mi clave", 24, Theme.INK, true));
        sub = Ui.tv("Escribe tu c\u00e9dula y te mandamos un c\u00f3digo por WhatsApp al " + Session.pretty(phone) + ".", 15, Theme.MUT, false);
        sub.setPadding(0, Ui.dp(4), 0, 0);
        p.addView(sub);

        g1 = new LinearLayout(a);
        g1.setOrientation(LinearLayout.VERTICAL);
        g1.addView(Ui.label("N\u00famero de c\u00e9dula"));
        etCC = Ui.edit("", android.text.InputType.TYPE_CLASS_NUMBER, 10);
        g1.addView(etCC);
        p.addView(g1);

        g2 = new LinearLayout(a);
        g2.setOrientation(LinearLayout.VERTICAL);
        g2.addView(Ui.label("C\u00f3digo de WhatsApp (6 n\u00fameros)"));
        etC = Ui.edit("", android.text.InputType.TYPE_CLASS_NUMBER, 6);
        g2.addView(etC);
        g2.addView(Ui.label("Clave nueva (4 n\u00fameros)"));
        etK1 = Ui.edit("", EditProfileScreen.PASS, 4);
        g2.addView(etK1);
        g2.addView(Ui.label("Repite la clave nueva"));
        etK2 = Ui.edit("", EditProfileScreen.PASS, 4);
        g2.addView(etK2);
        g2.setVisibility(View.GONE);
        p.addView(g2);

        err = Ui.tv("", 14, Theme.RED, false);
        err.setPadding(0, Ui.dp(10), 0, Ui.dp(6));
        p.addView(err);
        p.addView(Ui.spacer());
        go = Ui.btn("Enviarme el c\u00f3digo", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        });
        p.addView(go);
        ScrollView sc = new ScrollView(a);
        sc.setFillViewport(true);
        sc.setBackgroundColor(Theme.WHITE);
        sc.addView(p);
        view = sc;
        return sc;
    }

    void submit() {
        if (busy) return;
        if (step == 1) {
            String cc = etCC.getText().toString();
            if (!Pattern.matches("\\d{6,10}", cc)) { err.setText("La c\u00e9dula debe tener entre 6 y 10 n\u00fameros."); return; }
            err.setText("");
            busy = true;
            Api.call(a, "reset/request", Api.obj("p", phone, "cc", cc), new Api.Cb() {
                public void on(JSONObject r) {
                    busy = false;
                    if (r.has("error")) { err.setText(r.optString("error")); return; }
                    step = 2;
                    g1.setVisibility(View.GONE);
                    g2.setVisibility(View.VISIBLE);
                    sub.setText("Te mandamos un c\u00f3digo por WhatsApp. Escr\u00edbelo y elige tu clave nueva.");
                    go.setText("Cambiar clave");
                }
            });
            return;
        }
        String c = etC.getText().toString(), k1 = etK1.getText().toString(), k2 = etK2.getText().toString();
        if (!Pattern.matches("\\d{6}", c)) { err.setText("El c\u00f3digo tiene 6 n\u00fameros."); return; }
        if (!Pattern.matches("\\d{4}", k1)) { err.setText("La clave nueva debe tener 4 n\u00fameros."); return; }
        if (!k1.equals(k2)) { err.setText("Las claves nuevas no coinciden."); return; }
        err.setText("");
        busy = true;
        Api.call(a, "reset/confirm", Api.obj("p", phone, "c", c, "k", k1), new Api.Cb() {
            public void on(JSONObject r) {
                busy = false;
                if (r.has("error")) { err.setText(r.optString("error")); return; }
                Session.user = r.optJSONObject("user");
                Session.token = r.optString("token");
                Session.save(phone);
                Toast.makeText(a, "Clave cambiada", Toast.LENGTH_LONG).show();
                a.go(new HomeScreen(a), false);
            }
        });
    }

    boolean onBack() { a.go(prev, true); return true; }
}
