package com.parcepay.app;

import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/** Sacar plata, paso 1: elegir el monto. */
class AmountScreen extends Screen {
    EditText et;
    TextView err;
    Button go;

    AmountScreen(MainActivity a) { super(a); }

    View build() {
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv("Sacar plata", 24, Theme.INK, true));
        TextView s = Ui.tv("\u00bfCu\u00e1nto quieres sacar?", 15, Theme.MUT, false);
        s.setPadding(0, Ui.dp(4), 0, Ui.dp(6));
        p.addView(s);
        p.addView(Ui.tv("Disponible: " + Session.money(), 14, Theme.BLUE, true));
        et = Ui.edit("0", InputType.TYPE_CLASS_NUMBER, 9);
        et.setTextSize(24);
        p.addView(et);

        LinearLayout chips = new LinearLayout(a);
        long[] vals = {20000, 50000, 100000};
        for (int i = 0; i < 3; i++) {
            final long v = vals[i];
            TextView c = Ui.tv(Session.fmt(v), 14, Theme.BLUE2, true);
            c.setGravity(Gravity.CENTER);
            c.setBackground(Ui.rr(Theme.SKY, 12));
            c.setPadding(0, Ui.dp(11), 0, Ui.dp(11));
            c.setOnClickListener(new View.OnClickListener() {
                public void onClick(View x) { et.setText(String.valueOf(v)); et.setSelection(et.getText().length()); }
            });
            Ui.press(c);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1f);
            lp.setMargins(i == 0 ? 0 : Ui.dp(4), Ui.dp(8), i == 2 ? 0 : Ui.dp(4), 0);
            c.setLayoutParams(lp);
            chips.addView(c);
        }
        p.addView(chips);

        err = Ui.tv("", 14, Theme.RED, false);
        err.setPadding(0, Ui.dp(12), 0, 0);
        p.addView(err);
        p.addView(Ui.spacer());
        go = Ui.btn("Generar c\u00f3digo", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        });
        Ui.enable(go, false);
        p.addView(go);
        et.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence st, int x, int y, int z) { }
            public void onTextChanged(CharSequence st, int x, int y, int z) { }
            public void afterTextChanged(Editable e) { Ui.enable(go, val() > 0); err.setText(""); }
        });
        return p;
    }

    long val() {
        try { return Long.parseLong(et.getText().toString()); } catch (Exception e) { return 0; }
    }

    void submit() {
        final long v = val();
        if (v > Session.user.optDouble("s", 0)) { err.setText("No te alcanza. Disponible: " + Session.money()); return; }
        Api.call(a, "withdraw-code", Api.obj("t", Session.token, "v", v), new Api.Cb() {
            public void on(JSONObject r) {
                if (r.has("error")) { err.setText(r.optString("error")); return; }
                a.go(new CodeScreen(a, false, r.optString("code"), r.optString("phone"), v, r.optInt("ttl", 600)), false);
            }
        });
    }

    boolean onBack() { a.go(new HomeScreen(a), true); return true; }
}
