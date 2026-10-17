package com.parcepay.app;

import android.app.DatePickerDialog;
import android.text.InputType;
import android.view.View;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.regex.Pattern;

/** Crear cuenta: cedula, nombres, apellidos, nacimiento y celular. */
class RegisterScreen extends Screen {
    View view;
    EditText etCC, etN, etA, etP;
    TextView tvDate, err;
    String birth = "";
    /** Debe ser igual a LEGAL_VERSION de server.js: es la version de los textos legales que acepta la persona. */
    static final String LEGAL_V = "2026-10-17";
    android.widget.CheckBox chk;

    RegisterScreen(MainActivity a) { super(a); }

    View build() {
        if (view != null) return view;
        LinearLayout p = Ui.page(false);
        p.addView(Ui.back(new View.OnClickListener() {
            public void onClick(View v) { onBack(); }
        }));
        p.addView(Ui.tv("Crear cuenta", 24, Theme.INK, true));
        TextView s = Ui.tv("Llena tus datos.", 15, Theme.MUT, false);
        s.setPadding(0, Ui.dp(4), 0, 0);
        p.addView(s);
        p.addView(Ui.label("N\u00famero de c\u00e9dula"));
        etCC = Ui.edit("", InputType.TYPE_CLASS_NUMBER, 10);
        p.addView(etCC);
        p.addView(Ui.label("Nombres"));
        etN = Ui.edit("", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, 60);
        p.addView(etN);
        p.addView(Ui.label("Apellidos"));
        etA = Ui.edit("", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS, 60);
        p.addView(etA);
        p.addView(Ui.label("Fecha de nacimiento"));
        tvDate = Ui.tv("Elige la fecha", 16, 0xFF9AA9C9, false);
        tvDate.setBackground(Ui.stroke(Theme.WHITE, 14, 1, Theme.LINE));
        tvDate.setPadding(Ui.dp(14), Ui.dp(13), Ui.dp(14), Ui.dp(13));
        tvDate.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { pickDate(); }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = Ui.dp(6);
        tvDate.setLayoutParams(lp);
        p.addView(tvDate);
        p.addView(Ui.label("Celular"));
        etP = Ui.edit("3001234567", InputType.TYPE_CLASS_NUMBER, 10);
        p.addView(etP);
        chk = new android.widget.CheckBox(a);
        chk.setText("Acepto los T\u00e9rminos y Condiciones y autorizo el tratamiento de mis datos personales seg\u00fan la Pol\u00edtica de Privacidad.");
        chk.setTextSize(14);
        chk.setTextColor(Theme.INK);
        LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(-1, -2);
        cl.topMargin = Ui.dp(16);
        chk.setLayoutParams(cl);
        p.addView(chk);
        LinearLayout lk = new LinearLayout(a);
        lk.setPadding(Ui.dp(8), Ui.dp(2), 0, 0);
        TextView t1 = Ui.tv("Leer T\u00e9rminos", 14, Theme.BLUE, true);
        t1.setPadding(0, Ui.dp(6), Ui.dp(22), Ui.dp(6));
        t1.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { a.web("/terminos"); }
        });
        TextView t2 = Ui.tv("Leer Pol\u00edtica de Privacidad", 14, Theme.BLUE, true);
        t2.setPadding(0, Ui.dp(6), 0, Ui.dp(6));
        t2.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) { a.web("/privacidad"); }
        });
        lk.addView(t1);
        lk.addView(t2);
        p.addView(lk);
        err = Ui.tv("", 14, Theme.RED, false);
        err.setPadding(0, Ui.dp(10), 0, Ui.dp(6));
        p.addView(err);
        p.addView(Ui.btn("Continuar", Theme.BLUE, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { submit(); }
        }));
        ScrollView sc = new ScrollView(a);
        sc.setFillViewport(true);
        sc.addView(p);
        view = sc;
        return sc;
    }

    void pickDate() {
        Calendar c = Calendar.getInstance();
        DatePickerDialog dlg = new DatePickerDialog(a, new DatePickerDialog.OnDateSetListener() {
            public void onDateSet(DatePicker v, int y, int m, int d) {
                birth = y + "-" + (m + 1 < 10 ? "0" : "") + (m + 1) + "-" + (d < 10 ? "0" : "") + d;
                tvDate.setText(birth);
                tvDate.setTextColor(Theme.INK);
            }
        }, c.get(Calendar.YEAR) - 18, c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH));
        Calendar mx = Calendar.getInstance();
        mx.add(Calendar.YEAR, -18);
        dlg.getDatePicker().setMaxDate(mx.getTimeInMillis()); // solo mayores de 18
        dlg.show();
    }

    void submit() {
        String cc = etCC.getText().toString(), nom = etN.getText().toString().trim(),
                ape = etA.getText().toString().trim(), cel = etP.getText().toString();
        if (cc.length() < 6) { err.setText("La c\u00e9dula debe tener entre 6 y 10 n\u00fameros."); return; }
        if (nom.length() == 0 || ape.length() == 0) { err.setText("Escribe tus nombres y apellidos."); return; }
        if (birth.length() == 0) { err.setText("Elige tu fecha de nacimiento."); return; }
        if (!Pattern.matches("3\\d{9}", cel)) { err.setText("El celular debe tener 10 n\u00fameros y empezar por 3."); return; }
        if (!chk.isChecked()) { err.setText("Debes aceptar los T\u00e9rminos y la Pol\u00edtica de Privacidad para crear tu cuenta."); return; }
        err.setText("");
        final JSONObject data = Api.obj("cc", cc, "n", nom, "a", ape, "f", birth, "p", cel, "terms", Boolean.TRUE, "tv", LEGAL_V);
        Api.call(a, "exists", Api.obj("p", cel), new Api.Cb() {
            public void on(JSONObject r) {
                if (r.has("error")) { err.setText(r.optString("error")); return; }
                if (r.optBoolean("exists")) { err.setText("Ese n\u00famero ya tiene cuenta. Inicia sesi\u00f3n."); return; }
                // Manda el codigo de WhatsApp para confirmar el celular
                Api.call(a, "register/code", Api.obj("p", data.optString("p")), new Api.Cb() {
                    public void on(JSONObject r2) {
                        if (r2.has("error")) { err.setText(r2.optString("error")); return; }
                        if (r2.optBoolean("skip")) a.go(new PinScreen(a, RegisterScreen.this, null, data), false);
                        else a.go(new VerifyScreen(a, RegisterScreen.this, data), false);
                    }
                });
            }
        });
    }

    boolean onBack() { a.go(new WelcomeScreen(a), true); return true; }
}
