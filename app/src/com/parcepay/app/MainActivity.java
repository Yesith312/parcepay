package com.parcepay.app;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.view.View;
import android.view.WindowManager;
import org.json.JSONObject;
import android.widget.FrameLayout;

/** Contenedor: solo maneja la navegacion entre pantallas. */
public class MainActivity extends Activity {
    FrameLayout root;
    Handler h = new Handler();
    Screen current;
    /** true = no se puede hacer captura de pantalla ni grabar la app (ponlo en false para tomar capturas de promocion). */
    static final boolean SECURE = true;
    /** Si la app estuvo en segundo plano mas de esto, vuelve a pedir la clave. */
    static final long LOCK_MS = 180000;
    long pausedAt = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (SECURE) getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        Ui.init(this);
        Api.wake();
        getWindow().setStatusBarColor(Theme.BLUE);
        root = new FrameLayout(this);
        root.setBackgroundColor(Theme.WHITE);
        setContentView(root);
        go(new SplashScreen(this), false);
    }

    /** Celular con numero guardado -> clave directo. Celular nuevo -> Crear cuenta / Iniciar sesion. */
    Screen entry() {
        String p = Session.saved();
        if (Session.validPhone(p)) return new PinScreen(this, null, p, null);
        return new WelcomeScreen(this);
    }

    /** Abre una pagina del sitio de ParcePay (terminos, privacidad...) en el navegador. */
    void web(String ruta) {
        try {
            startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(Config.URL + ruta)));
        } catch (Exception e) { }
    }

    void go(Screen s, boolean back) {
        if (current != null) current.onLeave();
        current = s;
        View v = s.build();
        root.removeAllViews();
        root.addView(v, new FrameLayout.LayoutParams(-1, -1));
        v.setAlpha(0f);
        v.setTranslationX(Ui.dp(back ? -30 : 30));
        v.animate().alpha(1f).translationX(0f).setDuration(300).start();
        s.onShow();
    }

    @Override
    protected void onPause() {
        super.onPause();
        pausedAt = System.currentTimeMillis();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pausedAt > 0 && Session.token.length() > 0 && System.currentTimeMillis() - pausedAt > LOCK_MS) {
            Api.call(this, "logout", Api.obj("t", Session.token), new Api.Cb() {
                public void on(JSONObject r) { }
            });
            Session.clear();
            go(entry(), true);
        }
        pausedAt = 0;
    }

    @Override
    public void onBackPressed() {
        if (current == null || !current.onBack()) super.onBackPressed();
    }
}
