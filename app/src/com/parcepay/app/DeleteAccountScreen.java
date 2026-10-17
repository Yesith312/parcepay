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

/** Eliminar mi cuenta: clave, codigo por WhatsApp y la palabra ELIMINAR. Es definitivo. */
class DeleteAccountScreen extends Screen {
    int step = 1;
    boolean busy = false;
    View view;
    TextView sub, err;
    EditText etK, etC, etW;
    LinearLayout g1, g2;
    Button go;

    DeleteAccountScreen(MainActivity a) { super(a); }

    View build() {
        if (view != null) return view;
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv("Eliminar mi cuenta", 24, Theme.RED, true));
        sub = Ui.tv("Esta acci\u00f3n es definitiva. Se borrar\u00e1n tu cuenta, tus datos personales y tus movimientos, y perder\u00e1s tu saldo actual (" + Session.money()
                + "). Tu n\u00famero quedar\u00e1 libre para crear otra cuenta si quieres.", 15, Theme.MUT, false);
        sub.setPadding(0, Ui.dp(6), 0, 0);
        p.addView(sub);

        g1 = new LinearLayout(a);
        g1.setOrientation(LinearLayout.VERTICAL);
        g1.addView(Ui.label("Tu clave"));
        etK = Ui.edit("", EditProfileScreen.PASS, 4);
        g1.addView(etK);
        p.addView(g1);

        g2 = new LinearLayout(a);
        g2.setOrientation(LinearLayout.VERTICAL);
        g2.addView(Ui.label("C\u00f3digo de WhatsApp (6 n\u00fameros)"));
        etC = Ui.edit("", InputType.TYPE_CLASS_NUMBER, 6);
        g2.addView(etC);
        g2.addView(Ui.label("Escribe ELIMINAR para confirmar"));
        etW = Ui.edit("", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS, 8);
        g2.addView(etW);
        g2.setVisibility(View.GONE);
        p.addView(g2);

        err = Ui.tv("", 14, Theme.RED, false);
        err.setPadding(0, Ui.dp(10), 0, Ui.dp(6));
        p.addView(err);
        p.addView(Ui.spacer());
        go = Ui.btn("Enviarme el c\u00f3digo por WhatsApp", Theme.RED, Theme.WHITE, new View.OnClickListener() {
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
            String k = etK.getText().toString();
            if (!Pattern.matches("\\d{4}", k)) { err.setText("Escribe tu clave de 4 n\u00fameros."); return; }
            err.setText("");
            busy = true;
            Api.call(a, "profile/delete-code", Api.obj("t", Session.token, "k", k), new Api.Cb() {
                public void on(JSONObject r) {
                    busy = false;
                    if (r.has("error")) {
                        String m = r.optString("error");
                        if (m.startsWith("Sesi")) { Session.clear(); a.go(a.entry(), true); return; }
                        err.setText(m);
                        return;
                    }
                    // Sin bot de WhatsApp (solo pruebas) el codigo viene en la respuesta
                    if (r.optString("code").length() == 6) Toast.makeText(a, "C\u00f3digo de prueba: " + r.optString("code"), Toast.LENGTH_LONG).show();
                    step = 2;
                    g1.setVisibility(View.GONE);
                    g2.setVisibility(View.VISIBLE);
                    sub.setText("Te enviamos un c\u00f3digo por WhatsApp. Escr\u00edbelo y escribe ELIMINAR para borrar tu cuenta para siempre.");
                    go.setText("Eliminar mi cuenta definitivamente");
                }
            });
            return;
        }
        String c = etC.getText().toString();
        if (!Pattern.matches("\\d{6}", c)) { err.setText("El c\u00f3digo tiene 6 n\u00fameros."); return; }
        if (!"ELIMINAR".equals(etW.getText().toString().trim())) { err.setText("Escribe la palabra ELIMINAR para confirmar."); return; }
        err.setText("");
        busy = true;
        Api.call(a, "profile/delete", Api.obj("t", Session.token, "c", c), new Api.Cb() {
            public void on(JSONObject r) {
                busy = false;
                if (r.has("error")) {
                    String m = r.optString("error");
                    if (m.startsWith("Sesi")) { Session.clear(); a.go(a.entry(), true); return; }
                    err.setText(m);
                    return;
                }
                Session.forget();
                Session.clear();
                Toast.makeText(a, "Tu cuenta fue eliminada.", Toast.LENGTH_LONG).show();
                a.go(new WelcomeScreen(a), false);
            }
        });
    }

    boolean onBack() { a.go(new ProfileScreen(a), true); return true; }
}
