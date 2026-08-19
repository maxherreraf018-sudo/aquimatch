import { Capacitor } from '@capacitor/core'

export const esIOS = Capacitor.getPlatform() === 'ios'

// ---------------------------------------------------------------------------
// Gold escondido en iOS — 2026-08-19
//
// La pantalla de Gold anuncia funciones que todavía no existen ("Todavía no
// puedes activarlo") y muestra precios sin que haya nada que comprar. La regla
// 2.1 de Apple rechaza justamente eso: funciones presentadas como
// "próximamente" dentro de una app que se envía como versión terminada.
//
// Con la app ya rechazada una vez por la regla 4.3, el próximo revisor no
// llega neutral, y no conviene darle nada más que mirar.
//
// Esconderla hoy no cuesta nada: sin la app publicada no hay usuarios, así que
// el contador de interesados marcaría cero de todos modos. En Android queda
// visible, que es donde va a haber gente primero y donde el experimento de
// precio sí puede correr.
//
// PARA REACTIVARLA: cambiar esta constante a `false` en la primera
// actualización después de que Apple apruebe la app. Una actualización se
// revisa con mucho menos rigor que una primera publicación.
// ---------------------------------------------------------------------------
export const GOLD_OCULTO = esIOS
