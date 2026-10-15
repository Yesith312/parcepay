package com.parcepay.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputFilter;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Piezas de interfaz reutilizables. */
final class Ui {
    static Context c;

    static void init(Context x) { c = x; }

    static int dp(int v) { return (int) (v * c.getResources().getDisplayMetrics().density + .5f); }

    static GradientDrawable rr(int color, int r) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(r));
        return g;
    }

    static GradientDrawable stroke(int color, int r, int w, int sc) {
        GradientDrawable g = rr(color, r);
        g.setStroke(dp(w), sc);
        return g;
    }

    static GradientDrawable oval(int fill, boolean ring) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(fill);
        if (ring) g.setStroke(dp(2), Theme.BLUE);
        return g;
    }

    static GradientDrawable grad(int r) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{Theme.BLUE, Theme.BLUE2});
        g.setCornerRadius(dp(r));
        return g;
    }

    static TextView tv(String t, int sp, int color, boolean bold) {
        TextView x = new TextView(c);
        x.setText(t);
        x.setTextSize(sp);
        x.setTextColor(color);
        if (bold) x.setTypeface(Typeface.DEFAULT_BOLD);
        return x;
    }

    /** Efecto de "hundir" al tocar. */
    static void press(View v) {
        v.setOnTouchListener(new View.OnTouchListener() {
            public boolean onTouch(View x, MotionEvent e) {
                int a = e.getAction();
                if (a == MotionEvent.ACTION_DOWN) x.animate().scaleX(.95f).scaleY(.95f).setDuration(80).start();
                else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL)
                    x.animate().scaleX(1f).scaleY(1f).setDuration(120).start();
                return false;
            }
        });
    }

    static Button btn(String t, int bg, int fg, View.OnClickListener l) {
        Button b = new Button(c);
        b.setText(t);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(fg);
        b.setBackground(rr(bg, 16));
        b.setStateListAnimator(null);
        b.setOnClickListener(l);
        press(b);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(54));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    static void enable(Button b, boolean on) {
        b.setEnabled(on);
        b.setBackground(rr(on ? Theme.BLUE : Theme.LINE, 16));
        b.setTextColor(on ? Theme.WHITE : 0xFF8FA0C4);
    }

    static LinearLayout page(boolean blue) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(22), dp(24), dp(22), dp(24));
        if (blue) l.setBackground(grad(0)); else l.setBackgroundColor(Theme.WHITE);
        return l;
    }

    static View spacer() {
        View v = new View(c);
        v.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
        return v;
    }

    static TextView back(View.OnClickListener l) {
        TextView t = tv("\u2039 Volver", 16, Theme.BLUE, true);
        t.setPadding(0, dp(6), dp(20), dp(14));
        t.setOnClickListener(l);
        return t;
    }

    static TextView label(String s) {
        TextView t = tv(s, 14, Theme.MUT, false);
        t.setPadding(0, dp(14), 0, 0);
        return t;
    }

    static EditText edit(String hint, int type, int max) {
        EditText e = new EditText(c);
        e.setHint(hint);
        e.setInputType(type);
        e.setTextSize(16);
        e.setTextColor(Theme.INK);
        e.setHintTextColor(0xFF9AA9C9);
        e.setSingleLine(true);
        e.setFilters(new InputFilter[]{new InputFilter.LengthFilter(max)});
        e.setBackground(stroke(Theme.WHITE, 14, 1, Theme.LINE));
        e.setPadding(dp(14), dp(13), dp(14), dp(13));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(6);
        e.setLayoutParams(lp);
        return e;
    }

    static View logo() {
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        final TextView coin = tv("P", 34, Theme.BLUE, true);
        coin.setGravity(Gravity.CENTER);
        coin.setBackground(oval(Theme.WHITE, false));
        coin.setElevation(dp(6));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(74), dp(74));
        lp.bottomMargin = dp(14);
        coin.setLayoutParams(lp);
        coin.setRotationY(540f);
        coin.post(new Runnable() { public void run() { coin.animate().rotationY(0f).setDuration(1100).start(); } });
        box.addView(coin);
        LinearLayout row = new LinearLayout(c);
        row.addView(tv("Parce", 40, Theme.WHITE, true));
        row.addView(tv("Pay", 40, 0xFFBFD3FF, true));
        box.addView(row);
        return box;
    }

    /** Circulo translucido decorativo. */
    static View bubble(int size) {
        View v = new View(c);
        v.setBackground(oval(0x14FFFFFF, false));
        v.setLayoutParams(new android.widget.FrameLayout.LayoutParams(dp(size), dp(size)));
        return v;
    }
}
