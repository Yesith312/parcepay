package com.parcepay.app;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.view.View;
import android.widget.FrameLayout;

/** Contenedor: solo maneja la navegacion entre pantallas. */
public class MainActivity extends Activity {
    FrameLayout root;
    Handler h = new Handler();
    Screen current;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.init(this);
        Api.wake();
        getWindow().setStatusBarColor(Theme.BLUE);
        root = new FrameLayout(this);
        root.setBackgroundColor(Theme.WHITE);
        setContentView(root);
        go(new SplashScreen(this), false);
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
    public void onBackPressed() {
        if (current == null || !current.onBack()) super.onBackPressed();
    }
}
