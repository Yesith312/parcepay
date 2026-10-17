package com.parcepay.app;

import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Perfil: ver y cambiar celular, cedula, nombres y clave. */
class ProfileScreen extends Screen {
    ProfileScreen(MainActivity a) { super(a); }

    View build() {
        String full = (Session.user.optString("n") + " " + Session.user.optString("a")).trim();
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv("Mi perfil", 24, Theme.INK, true));
        TextView s = Ui.tv("Cambia tus datos cuando quieras.", 15, Theme.MUT, false);
        s.setPadding(0, Ui.dp(4), 0, Ui.dp(8));
        p.addView(s);
        p.addView(row("Celular", Session.pretty(Session.user.optString("p")), EditProfileScreen.PHONE));
        p.addView(row("C\u00e9dula", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", EditProfileScreen.CC));
        p.addView(row("Nombres y apellidos", full, EditProfileScreen.NAME));
        p.addView(row("Clave", "\u2022\u2022\u2022\u2022", EditProfileScreen.PIN));
        TextView l1 = Ui.tv("T\u00e9rminos y Condiciones", 15, Theme.BLUE, true);
        l1.setPadding(Ui.dp(4), Ui.dp(22), 0, Ui.dp(6));
        l1.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { a.web("/terminos"); }
        });
        p.addView(l1);
        TextView l2 = Ui.tv("Pol\u00edtica de Privacidad", 15, Theme.BLUE, true);
        l2.setPadding(Ui.dp(4), Ui.dp(8), 0, Ui.dp(6));
        l2.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { a.web("/privacidad"); }
        });
        p.addView(l2);
        TextView del = Ui.tv("Eliminar mi cuenta", 15, Theme.RED, true);
        del.setPadding(Ui.dp(4), Ui.dp(18), 0, Ui.dp(20));
        del.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { a.go(new DeleteAccountScreen(a), false); }
        });
        p.addView(del);
        ScrollView sc = new ScrollView(a);
        sc.setFillViewport(true);
        sc.setBackgroundColor(Theme.WHITE);
        sc.addView(p);
        return sc;
    }

    View row(String label, String value, final int kind) {
        LinearLayout r = new LinearLayout(a);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setBackground(Ui.stroke(Theme.WHITE, 16, 1, Theme.LINE));
        r.setPadding(Ui.dp(16), Ui.dp(14), Ui.dp(16), Ui.dp(14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = Ui.dp(10);
        r.setLayoutParams(lp);
        LinearLayout l = new LinearLayout(a);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1f));
        l.addView(Ui.tv(label, 12, Theme.MUT, false));
        l.addView(Ui.tv(value, 16, Theme.INK, true));
        r.addView(l);
        r.addView(Ui.tv("Cambiar", 14, Theme.BLUE, true));
        r.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { a.go(new EditProfileScreen(a, kind), false); }
        });
        Ui.press(r);
        return r;
    }

    boolean onBack() { a.go(new HomeScreen(a), true); return true; }
}
