package com.parcepay.app;

import android.view.Gravity;
import android.view.View;
import android.view.animation.OvershootInterpolator;
import android.widget.LinearLayout;

/** Pantalla de inicio con animacion. */
class SplashScreen extends Screen {
    View logo;

    SplashScreen(MainActivity a) { super(a); }

    View build() {
        LinearLayout p = Ui.page(true);
        p.setGravity(Gravity.CENTER);
        logo = Ui.logo();
        logo.setAlpha(0f);
        logo.setScaleX(.5f);
        logo.setScaleY(.5f);
        p.addView(logo);
        return p;
    }

    void onShow() {
        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(900).setInterpolator(new OvershootInterpolator()).start();
        a.h.postDelayed(new Runnable() {
            public void run() { if (a.current == SplashScreen.this) a.go(a.entry(), false); }
        }, 1900);
    }
}
