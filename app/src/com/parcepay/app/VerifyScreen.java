package com.parcepay.app;

import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.regex.Pattern;

/** Crear cuenta, paso 2: confirmar el celular con el codigo que llega por WhatsApp. */
class VerifyScreen extends Screen {
    final Screen prev;
    final JSONObject data;
    final String phone;
    View view;
    EditText et;
    TextView err;
    boolean busy = false;

    VerifyScreen(MainActivity a, Screen prev, JSONObject data) {
        super(a);
        this.prev = prev;
        this.data = data;
        this.phone = data.optString("p");
    }

    View build() {
        if (view != null) return view;
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv("Confirma tu n\u00famero", 24, Theme.INK, true));
        TextView s = Ui.tv("Te mandamos un c\u00f3digo por WhatsApp al " + Session.pretty(phone) + ".", 15, Theme.MUT, false);
        s.setPadding(0, Ui.dp(4), 0, 0);
        p.addView(s);
        p.addView(Ui.label("C\u00f3digo (6 n\u00fameros)"));
        et = Ui.edit("123456", InputType.TYPE_CLASS_NUMBER, 6);
        p.addView(et);
        err = Ui.tv("", 14, Theme.RED, false);
        err.setPadding(0, Ui.dp(10), 0, 0);
        p.addView(err);
        TextView again = Ui.tv("\u00bfNo te lleg\u00f3? Enviar otro c\u00f3digo", 15, Theme.BLUE, true);
        again.setGravity(Gravity.CENTER);
        again.setPadding(0, Ui.dp(16), 0, Ui.dp(6));
        again.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { resend(); }
        });
        p.addView(again);
        p.addView(Ui.spacer());
        p.addView(Ui.btn("Verificar", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        }));
        view = p;
        return p;
    }

    void resend() {
        Api.call(a, "register/code", Api.obj("p", phone), new Api.Cb() {
            public void on(JSONObject r) {
                if (r.has("error")) { err.setText(r.optString("error")); return; }
                err.setText("");
                Toast.makeText(a, "C\u00f3digo enviado", Toast.LENGTH_SHORT).show();
            }
        });
    }

    void submit() {
        if (busy) return;
        final String c = et.getText().toString();
        if (!Pattern.matches("\\d{6}", c)) { err.setText("El c\u00f3digo tiene 6 n\u00fameros."); return; }
        err.setText("");
        busy = true;
        Api.call(a, "register/check", Api.obj("p", phone, "c", c), new Api.Cb() {
            public void on(JSONObject r) {
                busy = false;
                if (r.has("error")) { err.setText(r.optString("error")); return; }
                try { data.put("c", c); } catch (Exception e) { }
                a.go(new PinScreen(a, VerifyScreen.this, null, data), false);
            }
        });
    }

    boolean onBack() { a.go(prev, true); return true; }
}
