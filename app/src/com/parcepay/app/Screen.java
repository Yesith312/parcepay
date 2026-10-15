package com.parcepay.app;

import android.view.View;

/** Base de todas las pantallas. */
abstract class Screen {
    protected final MainActivity a;

    Screen(MainActivity a) { this.a = a; }

    /** Crea (o devuelve) la vista de la pantalla. */
    abstract View build();

    /** Se llama cuando la pantalla ya esta visible (aqui van las animaciones). */
    void onShow() { }

    /** Se llama cuando se va a cambiar de pantalla. */
    void onLeave() { }

    /** Devuelve true si la pantalla manejo el boton atras. */
    boolean onBack() { return false; }
}
