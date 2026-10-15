package com.parcepay.app;

import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.regex.Pattern;

/** Paso 1 del login: el numero de celular. */
class LoginScreen extends Screen {
    View view;
    EditText et;
    TextView err;
    Button go;

    LoginScreen(MainActivity a) { super(a); }

    View build() {
        if (view != null) return view;
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv("Iniciar sesi\u00f3n", 24, Theme.INK, true));
        TextView s = Ui.tv("Escribe tu n\u00famero de celular.", 15, Theme.MUT, false);
        s.setPadding(0, Ui.dp(4), 0, Ui.dp(10));
        p.addView(s);
        p.addView(Ui.label("Celular"));
        et = Ui.edit("3001234567", InputType.TYPE_CLASS_NUMBER, 10);
        p.addView(et);
        err = Ui.tv("", 14, Theme.RED, false);
        err.setPadding(0, Ui.dp(10), 0, 0);
        p.addView(err);
        p.addView(Ui.spacer());
        go = Ui.btn("Entrar", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        });
        Ui.enable(go, false);
        p.addView(go);
        et.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence st, int x, int y, int z) { }
            public void onTextChanged(CharSequence st, int x, int y, int z) { }
            public void afterTextChanged(Editable e) {
                Ui.enable(go, Pattern.matches("3\\d{9}", e.toString()));
                err.setText("");
            }
        });
        view = p;
        return p;
    }

    void submit() {
        final String ph = et.getText().toString();
        Api.call(a, "exists", Api.obj("p", ph), new Api.Cb() {
            public void on(JSONObject r) {
                if (r.has("error")) { err.setText(r.optString("error")); return; }
                if (!r.optBoolean("exists")) { err.setText("Ese n\u00famero no tiene cuenta. Crea una primero."); return; }
                a.go(new PinScreen(a, LoginScreen.this, ph, null), false);
            }
        });
    }

    boolean onBack() { a.go(new WelcomeScreen(a), true); return true; }
}
