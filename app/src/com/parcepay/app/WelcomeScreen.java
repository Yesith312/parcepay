package com.parcepay.app;

import android.animation.ObjectAnimator;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Crear cuenta / Iniciar sesion. */
class WelcomeScreen extends Screen {
    ObjectAnimator f1, f2;
    View b1, b2;

    WelcomeScreen(MainActivity a) { super(a); }

    View build() {
        FrameLayout f = new FrameLayout(a);
        f.setBackground(Ui.grad(0));
        b1 = Ui.bubble(240);
        FrameLayout.LayoutParams l1 = (FrameLayout.LayoutParams) b1.getLayoutParams();
        l1.gravity = Gravity.TOP | Gravity.RIGHT;
        l1.topMargin = Ui.dp(-70);
        l1.rightMargin = Ui.dp(-80);
        b2 = Ui.bubble(190);
        FrameLayout.LayoutParams l2 = (FrameLayout.LayoutParams) b2.getLayoutParams();
        l2.gravity = Gravity.BOTTOM | Gravity.LEFT;
        l2.bottomMargin = Ui.dp(130);
        l2.leftMargin = Ui.dp(-70);
        f.addView(b1);
        f.addView(b2);

        LinearLayout p = Ui.page(false);
        p.setBackgroundColor(Color.TRANSPARENT);
        LinearLayout top = new LinearLayout(a);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setGravity(Gravity.CENTER);
        top.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
        top.addView(Ui.logo());
        TextView t = Ui.tv("Tu plata, tus bolsillos, a tu manera.", 15, 0xDDFFFFFF, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(10), 0, 0);
        top.addView(t);
        p.addView(top);
        p.addView(Ui.btn("Crear cuenta", Theme.WHITE, Theme.BLUE2, new View.OnClickListener() {
            public void onClick(View v) { a.go(new RegisterScreen(a), false); }
        }));
        Button o = Ui.btn("Iniciar sesi\u00f3n", 0, Theme.WHITE, new View.OnClickListener() {
            public void onClick(View v) { a.go(new LoginScreen(a), false); }
        });
        o.setBackground(Ui.stroke(0, 16, 2, 0x88FFFFFF));
        p.addView(o);
        f.addView(p, new FrameLayout.LayoutParams(-1, -1));
        return f;
    }

    void onShow() {
        f1 = ObjectAnimator.ofFloat(b1, "translationY", 0f, Ui.dp(24));
        f2 = ObjectAnimator.ofFloat(b2, "translationY", 0f, -Ui.dp(24));
        ObjectAnimator[] all = {f1, f2};
        for (ObjectAnimator x : all) {
            x.setDuration(3200);
            x.setRepeatCount(ObjectAnimator.INFINITE);
            x.setRepeatMode(ObjectAnimator.REVERSE);
            x.start();
        }
    }

    void onLeave() {
        if (f1 != null) f1.cancel();
        if (f2 != null) f2.cancel();
    }
}
