package com.parcepay.app;

import android.view.Gravity;
import android.view.View;
import android.view.animation.OvershootInterpolator;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Pantalla principal: nombre, saldo, meter/sacar y movimientos. */
class HomeScreen extends Screen {
    TextView saldo, eye;
    View card;
    LinearLayout movBox;

    HomeScreen(MainActivity a) { super(a); }

    View build() {
        String first = Session.user.optString("n").trim().split(" ")[0];
        LinearLayout p = Ui.page(false);

        LinearLayout hd = new LinearLayout(a);
        hd.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout nm = new LinearLayout(a);
        nm.setOrientation(LinearLayout.VERTICAL);
        nm.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
        nm.addView(Ui.tv("Hola,", 14, Theme.MUT, false));
        nm.addView(Ui.tv(first, 26, Theme.INK, true));
        hd.addView(nm);
        TextView av = Ui.tv(first.length() > 0 ? first.substring(0, 1).toUpperCase() : "P", 18, Theme.WHITE, true);
        av.setGravity(Gravity.CENTER);
        av.setBackground(Ui.oval(Theme.BLUE, false));
        av.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(44), Ui.dp(44)));
        av.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { a.go(new ProfileScreen(a), false); }
        });
        hd.addView(av);
        p.addView(hd);

        LinearLayout c = new LinearLayout(a);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(Ui.dp(22), Ui.dp(22), Ui.dp(22), Ui.dp(22));
        c.setBackground(Ui.grad(22));
        c.setElevation(Ui.dp(8));
        LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(-1, -2);
        cl.topMargin = Ui.dp(20);
        c.setLayoutParams(cl);
        c.addView(Ui.tv("Disponible", 14, 0xCCFFFFFF, false));
        saldo = Ui.tv("", 36, Theme.WHITE, true);
        c.addView(saldo);
        eye = Ui.tv("", 13, Theme.WHITE, true);
        eye.setBackground(Ui.rr(0x33FFFFFF, 12));
        eye.setPadding(Ui.dp(12), Ui.dp(6), Ui.dp(12), Ui.dp(6));
        eye.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { Session.hidden = !Session.hidden; refresh(); }
        });
        LinearLayout.LayoutParams el = new LinearLayout.LayoutParams(-2, -2);
        el.topMargin = Ui.dp(12);
        eye.setLayoutParams(el);
        c.addView(eye);
        p.addView(c);
        card = c;

        LinearLayout acts = new LinearLayout(a);
        Button b1 = Ui.btn("Meter plata", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { meter(); }
        });
        Button b2 = Ui.btn("Sacar", Theme.SKY, Theme.BLUE2, new View.OnClickListener() {
            public void onClick(View v) { a.go(new AmountScreen(a), false); }
        });
        LinearLayout.LayoutParams l1 = new LinearLayout.LayoutParams(0, Ui.dp(54), 1f);
        l1.setMargins(0, Ui.dp(16), Ui.dp(5), 0);
        b1.setLayoutParams(l1);
        LinearLayout.LayoutParams l2 = new LinearLayout.LayoutParams(0, Ui.dp(54), 1f);
        l2.setMargins(Ui.dp(5), Ui.dp(16), 0, 0);
        b2.setLayoutParams(l2);
        acts.addView(b1);
        acts.addView(b2);
        p.addView(acts);

        TextView mt = Ui.tv("Movimientos", 17, Theme.INK, true);
        mt.setPadding(0, Ui.dp(26), 0, Ui.dp(10));
        p.addView(mt);
        movBox = new LinearLayout(a);
        movBox.setOrientation(LinearLayout.VERTICAL);
        movBox.setBackground(Ui.stroke(Theme.WHITE, 16, 1, Theme.LINE));
        movBox.setPadding(Ui.dp(16), Ui.dp(6), Ui.dp(16), Ui.dp(6));
        p.addView(movBox);
        renderMovs();

        p.addView(Ui.spacer());
        Button perfil = Ui.btn("Mi perfil", Theme.SKY, Theme.BLUE2, new View.OnClickListener() {
            public void onClick(View v) { a.go(new ProfileScreen(a), false); }
        });
        LinearLayout.LayoutParams lpf = new LinearLayout.LayoutParams(-1, Ui.dp(54));
        lpf.topMargin = Ui.dp(26);
        perfil.setLayoutParams(lpf);
        p.addView(perfil);
        Button out = Ui.btn("Cerrar sesi\u00f3n", Theme.SKY, Theme.BLUE2, new View.OnClickListener() {
            public void onClick(View v) {
                Api.call(a, "logout", Api.obj("t", Session.token), new Api.Cb() {
                    public void on(JSONObject r) { }
                });
                Session.clear();
                a.go(a.entry(), true);
            }
        });
        LinearLayout.LayoutParams lo = new LinearLayout.LayoutParams(-1, Ui.dp(54));
        lo.topMargin = Ui.dp(10);
        out.setLayoutParams(lo);
        p.addView(out);

        Session.hidden = false;
        refresh();
        ScrollView sc = new ScrollView(a);
        sc.setFillViewport(true);
        sc.setBackgroundColor(Theme.WHITE);
        sc.addView(p);
        return sc;
    }

    void refresh() {
        saldo.setText(Session.hidden ? "$ \u2022\u2022\u2022\u2022\u2022\u2022" : Session.money());
        eye.setText(Session.hidden ? "Mostrar" : "Ocultar");
    }

    void renderMovs() {
        movBox.removeAllViews();
        JSONArray m = Session.user.optJSONArray("movs");
        if (m == null || m.length() == 0) {
            TextView e = Ui.tv("A\u00fan no tienes movimientos.\nToca Meter plata para empezar.", 14, Theme.MUT, false);
            e.setGravity(Gravity.CENTER);
            e.setPadding(0, Ui.dp(20), 0, Ui.dp(20));
            movBox.addView(e, new LinearLayout.LayoutParams(-1, -2));
            return;
        }
        SimpleDateFormat f = new SimpleDateFormat("d MMM, h:mm a", new Locale("es", "CO"));
        for (int i = 0; i < m.length(); i++) {
            JSONObject x = m.optJSONObject(i);
            if (x == null) continue;
            boolean in = x.optString("t").equals("in");
            LinearLayout row = new LinearLayout(a);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, Ui.dp(11), 0, Ui.dp(11));
            LinearLayout l = new LinearLayout(a);
            l.setOrientation(LinearLayout.VERTICAL);
            l.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
            l.addView(Ui.tv(x.optString("d"), 15, Theme.INK, true));
            l.addView(Ui.tv(f.format(new Date(x.optLong("f"))), 12, Theme.MUT, false));
            row.addView(l);
            row.addView(Ui.tv((in ? "+" : "-") + Session.fmt(x.optDouble("v")), 15, in ? Theme.GREEN : Theme.RED, true));
            movBox.addView(row);
        }
    }

    void meter() {
        Api.call(a, "deposit-code", Api.obj("t", Session.token), new Api.Cb() {
            public void on(JSONObject r) {
                if (r.has("error")) { Toast.makeText(a, r.optString("error"), Toast.LENGTH_LONG).show(); return; }
                a.go(new CodeScreen(a, true, r.optString("code"), r.optString("phone"), 0, r.optInt("ttl", 600)), false);
            }
        });
    }

    void onShow() {
        card.setScaleX(.9f);
        card.setScaleY(.9f);
        card.animate().scaleX(1f).scaleY(1f).setDuration(500).setInterpolator(new OvershootInterpolator()).start();
        // Trae el saldo y los movimientos actualizados del servidor
        Api.call(a, "me", Api.obj("t", Session.token), new Api.Cb() {
            public void on(JSONObject r) {
                if (a.current != HomeScreen.this) return;
                if (r.has("error")) {
                    if (r.optString("error").startsWith("Sesi")) { Session.clear(); a.go(a.entry(), true); }
                    return;
                }
                JSONObject u = r.optJSONObject("user");
                if (u == null) return;
                Session.user = u;
                refresh();
                renderMovs();
            }
        });
    }
}
