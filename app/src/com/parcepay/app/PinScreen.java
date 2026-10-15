package com.parcepay.app;

import android.animation.ObjectAnimator;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/** Clave de 4 digitos: sirve para entrar, crearla y confirmarla. */
class PinScreen extends Screen {
    static final int LOGIN = 0, CREATE = 1, CONFIRM = 2;
    final Screen prev;
    final String phone;
    final JSONObject pend;
    int mode;
    String pin = "", tmp = "";
    boolean busy = false;
    View[] dots = new View[4];
    LinearLayout dotsBox;
    TextView title, sub, err;

    /** Para entrar: phone con valor y pend null. Para crear cuenta: phone null y pend con los datos. */
    PinScreen(MainActivity a, Screen prev, String phone, JSONObject pend) {
        super(a);
        this.prev = prev;
        this.phone = phone;
        this.pend = pend;
        this.mode = pend == null ? LOGIN : CREATE;
    }

    View build() {
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        title = Ui.tv(mode == LOGIN ? "Pon tu clave" : "Crea tu clave", 24, Theme.INK, true);
        p.addView(title);
        sub = Ui.tv(mode == LOGIN ? "Son 4 n\u00fameros." : "Elige 4 n\u00fameros que recuerdes.", 15, Theme.MUT, false);
        sub.setPadding(0, Ui.dp(4), 0, 0);
        p.addView(sub);
        dotsBox = new LinearLayout(a);
        dotsBox.setGravity(Gravity.CENTER);
        for (int i = 0; i < 4; i++) {
            View d = new View(a);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(16), Ui.dp(16));
            lp.setMargins(Ui.dp(8), Ui.dp(28), Ui.dp(8), Ui.dp(8));
            d.setLayoutParams(lp);
            dots[i] = d;
            dotsBox.addView(d);
        }
        p.addView(dotsBox);
        err = Ui.tv("", 14, Theme.RED, false);
        err.setGravity(Gravity.CENTER);
        err.setPadding(0, Ui.dp(8), 0, 0);
        p.addView(err);
        p.addView(Ui.spacer());
        String[][] rows = {{"1", "2", "3"}, {"4", "5", "6"}, {"7", "8", "9"}, {"", "0", "\u232b"}};
        for (int r = 0; r < 4; r++) {
            LinearLayout row = new LinearLayout(a);
            for (int c = 0; c < 3; c++) {
                String k = rows[r][c];
                View v;
                if (k.length() == 0) {
                    v = new View(a);
                } else {
                    TextView t = Ui.tv(k, 24, Theme.INK, false);
                    t.setGravity(Gravity.CENTER);
                    t.setBackground(Ui.rr(Theme.SKY, 18));
                    t.setTag(k);
                    t.setOnClickListener(new View.OnClickListener() {
                        public void onClick(View x) { key((String) x.getTag()); }
                    });
                    Ui.press(t);
                    v = t;
                }
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, Ui.dp(60), 1f);
                lp.setMargins(Ui.dp(5), Ui.dp(5), Ui.dp(5), Ui.dp(5));
                v.setLayoutParams(lp);
                row.addView(v);
            }
            p.addView(row);
        }
        paint(false);
        return p;
    }

    void paint(boolean pulse) {
        for (int i = 0; i < 4; i++) dots[i].setBackground(Ui.oval(i < pin.length() ? Theme.BLUE : Theme.WHITE, true));
        if (pulse && pin.length() > 0) {
            View d = dots[pin.length() - 1];
            d.setScaleX(1.5f);
            d.setScaleY(1.5f);
            d.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
        }
    }

    void key(String k) {
        if (busy) return;
        if (k.equals("\u232b")) { if (pin.length() > 0) pin = pin.substring(0, pin.length() - 1); }
        else if (pin.length() < 4) pin += k;
        paint(true);
        if (pin.length() == 4) a.h.postDelayed(new Runnable() { public void run() { done(); } }, 180);
    }

    void shake(String msg) {
        err.setText(msg);
        pin = "";
        paint(false);
        ObjectAnimator.ofFloat(dotsBox, "translationX", 0, -24, 24, -16, 16, -8, 8, 0).setDuration(450).start();
    }

    void done() {
        if (pin.length() < 4 || busy) return;
        if (mode == LOGIN) {
            busy = true;
            Api.call(a, "login", Api.obj("p", phone, "k", pin), new Api.Cb() {
                public void on(JSONObject r) {
                    busy = false;
                    if (r.has("error")) { shake(r.optString("error")); return; }
                    Session.user = r.optJSONObject("user");
                    Session.token = r.optString("token");
                    a.go(new HomeScreen(a), false);
                }
            });
            return;
        }
        if (mode == CREATE) {
            tmp = pin;
            pin = "";
            paint(false);
            mode = CONFIRM;
            title.setText("Confirma tu clave");
            sub.setText("Escr\u00edbela otra vez.");
            err.setText("");
            return;
        }
        if (!pin.equals(tmp)) {
            mode = CREATE;
            tmp = "";
            title.setText("Crea tu clave");
            sub.setText("Elige 4 n\u00fameros que recuerdes.");
            shake("No coinciden. Empieza de nuevo.");
            return;
        }
        busy = true;
        try { pend.put("k", pin); } catch (Exception e) { }
        Api.call(a, "register", pend, new Api.Cb() {
            public void on(JSONObject r) {
                busy = false;
                if (r.has("error")) { pin = ""; paint(false); err.setText(r.optString("error")); return; }
                Session.user = r.optJSONObject("user");
                    Session.token = r.optString("token");
                a.go(new HomeScreen(a), false);
            }
        });
    }

    boolean onBack() { a.go(prev, true); return true; }
}
