package com.parcepay.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.Locale;

/** Muestra el numero y el codigo para meter o sacar plata en la web. */
class CodeScreen extends Screen {
    final boolean deposit;
    final String code, phone;
    final long amount;
    final double startBal;
    final long end;
    TextView timer;
    boolean expired = false;
    Runnable tick, poll;

    CodeScreen(MainActivity a, boolean deposit, String code, String phone, long amount, int ttl) {
        super(a);
        this.deposit = deposit;
        this.code = code;
        this.phone = phone;
        this.amount = amount;
        this.startBal = Session.user.optDouble("s", 0);
        this.end = System.currentTimeMillis() + ttl * 1000L;
    }

    View build() {
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv(deposit ? "Meter plata" : "Sacar plata", 24, Theme.INK, true));
        TextView s = Ui.tv(deposit
                ? "Entra a la web de ParcePay y escribe estos datos."
                : "Escribe estos datos en el cajero de la web para sacar " + Session.fmt(amount) + ".", 15, Theme.MUT, false);
        s.setPadding(0, Ui.dp(4), 0, Ui.dp(18));
        p.addView(s);

        LinearLayout c = new LinearLayout(a);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(Ui.dp(24), Ui.dp(22), Ui.dp(24), Ui.dp(24));
        c.setBackground(Ui.grad(22));
        c.setElevation(Ui.dp(8));
        c.addView(Ui.tv("N\u00famero", 13, 0xCCFFFFFF, false));
        String ph = phone.length() == 10 ? phone.substring(0, 3) + " " + phone.substring(3, 6) + " " + phone.substring(6) : phone;
        c.addView(Ui.tv(ph, 22, Theme.WHITE, true));
        TextView l2 = Ui.tv("C\u00f3digo", 13, 0xCCFFFFFF, false);
        l2.setPadding(0, Ui.dp(16), 0, 0);
        c.addView(l2);
        String cd = code.length() == 6 ? code.substring(0, 3) + " " + code.substring(3) : code;
        boolean wa = code.length() == 0;
        TextView ct = wa ? Ui.tv("Te lo enviamos por WhatsApp", 20, Theme.WHITE, true) : Ui.tv(cd, 42, Theme.WHITE, true);
        if (!wa) ct.setLetterSpacing(.08f);
        c.addView(ct);
        p.addView(c);

        timer = Ui.tv("", 14, Theme.MUT, false);
        timer.setGravity(android.view.Gravity.CENTER);
        timer.setPadding(0, Ui.dp(16), 0, 0);
        p.addView(timer);
        p.addView(Ui.spacer());
        if (code.length() > 0) p.addView(Ui.btn("Copiar c\u00f3digo", Theme.SKY, Theme.BLUE2, new View.OnClickListener() {
            public void onClick(View v) {
                ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("codigo", code));
                Toast.makeText(a, "C\u00f3digo copiado", Toast.LENGTH_SHORT).show();
            }
        }));
        p.addView(Ui.btn("Listo", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        return p;
    }

    void onShow() {
        tick = new Runnable() {
            public void run() {
                long left = (end - System.currentTimeMillis()) / 1000;
                if (left <= 0) {
                    expired = true;
                    timer.setText("C\u00f3digo vencido. Genera uno nuevo.");
                    timer.setTextColor(Theme.RED);
                    return;
                }
                timer.setText("Vence en " + String.format(Locale.US, "%02d:%02d", left / 60, left % 60));
                a.h.postDelayed(this, 1000);
            }
        };
        tick.run();
        // Revisa cada 3 s si ya metieron o sacaron la plata en la web
        poll = new Runnable() {
            public void run() {
                if (expired || a.current != CodeScreen.this) return;
                Api.call(a, "me", Api.obj("t", Session.token), new Api.Cb() {
                    public void on(JSONObject r) {
                        if (a.current != CodeScreen.this) return;
                        JSONObject u = r.optJSONObject("user");
                        if (u != null && Math.abs(u.optDouble("s", 0) - startBal) > 0.5) {
                            boolean up = u.optDouble("s", 0) > startBal;
                            Session.user = u;
                            Toast.makeText(a, up ? "Recibiste plata" : "Retiro listo", Toast.LENGTH_LONG).show();
                            a.go(new HomeScreen(a), true);
                            return;
                        }
                        a.h.postDelayed(poll, 3000);
                    }
                });
            }
        };
        a.h.postDelayed(poll, 3000);
    }

    void onLeave() {
        if (tick != null) a.h.removeCallbacks(tick);
        if (poll != null) a.h.removeCallbacks(poll);
    }

    boolean onBack() { a.go(new HomeScreen(a), true); return true; }
}
