// Pruebas de las reglas de Firestore contra el emulador.
//
// Por qué existen: entre el 8 y el 9 de septiembre de 2026 se cambiaron las
// reglas seis veces en un día, cerrando agujeros reales — matches fabricados,
// la edad que se podía cambiar, el local visible después de salir. Cada uno se
// verificó leyendo el código y desplegando. Ninguno se probó ejecutándolo.
//
// Leer una regla y creer que hace lo que dice es exactamente cómo llegaron
// esos agujeros ahí en primer lugar: el comentario de `tieneConexionCon` decía
// que servía para el punto de "en línea", y no lo usaba nadie.
//
// Cada prueba de acá abajo corresponde a un hallazgo concreto. Si alguna falla
// en el futuro, es que ese agujero se volvió a abrir.
//
// Se corre con:  npm run probar    (desde pruebas-reglas/)

import { test, before, after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import {
  doc, setDoc, getDoc, updateDoc, addDoc, collection, getDocs, query, where,
} from 'firebase/firestore'

const ANA = 'uid-ana'
const BETO = 'uid-beto'
const CARLA = 'uid-carla'
const LUGAR = 'lugar-galpon'

let entorno

before(async () => {
  entorno = await initializeTestEnvironment({
    projectId: 'demo-aquimatch',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8') },
  })
})

after(async () => entorno?.cleanup())

const como = (uid) => entorno.authenticatedContext(uid).firestore()

// Antes de cada prueba: base limpia y las tres personas con su documento de
// usuario creado.
//
// Los perfiles hacen falta SIEMPRE, aunque la prueba no los mire. Varias
// reglas leen el documento del usuario para ver si está suspendido o si hay un
// bloqueo (estaSuspendido, meBloqueo, yoBloquee), y `get()` sobre un documento
// inexistente no devuelve vacío: da error, y la regla deniega. La primera
// versión de estas pruebas fallaba entera por eso — no por un agujero, sino
// por probar un estado que en producción no existe: todo usuario tiene su
// documento desde que se registra.
beforeEach(async () => {
  await entorno.clearFirestore()
  await Promise.all([perfil(ANA), perfil(BETO), perfil(CARLA)])
})

// Deja a alguien activado en un lugar, como lo haría el servidor: pasando por
// encima de las reglas, que es lo que hace el Admin SDK en activarEnLugar.
async function activar(uid, { placeId = LUGAR, activa = true, modo = 'participar', hace = 0 } = {}) {
  await entorno.withSecurityRulesDisabled(async (contexto) => {
    await setDoc(doc(contexto.firestore(), 'activaciones', uid), {
      uid, placeId, activa, modo,
      placeName: 'Galpón Italia',
      iniciadaEn: new Date(Date.now() - hace),
      actualizadaEn: new Date(),
      verificadaEnServidor: true,
    })
  })
}

async function perfil(uid, campos = {}) {
  await entorno.withSecurityRulesDisabled(async (contexto) => {
    await setDoc(doc(contexto.firestore(), 'usuarios', uid), {
      nombre: 'Alguien', perfilCompleto: true, estadoVerificacion: 'aprobado',
      fechaNacimiento: '1990-5-10', ...campos,
    })
  })
}

const idInteres = (desde, hacia, placeId = LUGAR) => `${placeId}_${desde}_${hacia}`

// ---------------------------------------------------------------------------

describe('Intereses: el nombre del documento tiene que corresponder con su contenido', () => {
  // Hallazgo del 2026-09-08. Sin esto, el "match mutuo" se fabricaba solo:
  // se guardaba un documento LLAMADO lugar_VICTIMA_ATACANTE con datos
  // {desde: ATACANTE}, y quien comprobaba el match solo miraba si el nombre
  // existía.
  test('el propio interés, bien nombrado, se puede guardar', async () => {
    await assertSucceeds(setDoc(doc(como(ANA), 'intereses', idInteres(ANA, BETO)), {
      desde: ANA, hacia: BETO, placeId: LUGAR, creadoEn: new Date(),
    }))
  })

  test('NO se puede guardar un interés con nombre de otra persona', async () => {
    // Ana intenta hacer pasar su interés por el de Beto hacia ella.
    await assertFails(setDoc(doc(como(ANA), 'intereses', idInteres(BETO, ANA)), {
      desde: ANA, hacia: BETO, placeId: LUGAR, creadoEn: new Date(),
    }))
  })

  test('NO se puede guardar un interés a nombre de otra persona', async () => {
    await assertFails(setDoc(doc(como(ANA), 'intereses', idInteres(BETO, ANA)), {
      desde: BETO, hacia: ANA, placeId: LUGAR, creadoEn: new Date(),
    }))
  })
})

describe('Conexiones: hace falta interés mutuo de verdad', () => {
  const idConexion = [ANA, BETO].sort().join('_')

  test('con los dos intereses, la conexión se crea', async () => {
    await setDoc(doc(como(ANA), 'intereses', idInteres(ANA, BETO)), {
      desde: ANA, hacia: BETO, placeId: LUGAR, creadoEn: new Date(),
    })
    await setDoc(doc(como(BETO), 'intereses', idInteres(BETO, ANA)), {
      desde: BETO, hacia: ANA, placeId: LUGAR, creadoEn: new Date(),
    })
    await assertSucceeds(setDoc(doc(como(ANA), 'conexiones', idConexion), {
      usuarios: [ANA, BETO].sort(), placeId: LUGAR, creadaEn: new Date(), deshecho: false,
    }))
  })

  test('con un interés unilateral, NO se crea', async () => {
    await setDoc(doc(como(ANA), 'intereses', idInteres(ANA, BETO)), {
      desde: ANA, hacia: BETO, placeId: LUGAR, creadoEn: new Date(),
    })
    await assertFails(setDoc(doc(como(ANA), 'conexiones', idConexion), {
      usuarios: [ANA, BETO].sort(), placeId: LUGAR, creadaEn: new Date(), deshecho: false,
    }))
  })

  test('un tercero NO puede crear una conexión entre otros dos', async () => {
    await setDoc(doc(como(ANA), 'intereses', idInteres(ANA, BETO)), {
      desde: ANA, hacia: BETO, placeId: LUGAR, creadoEn: new Date(),
    })
    await setDoc(doc(como(BETO), 'intereses', idInteres(BETO, ANA)), {
      desde: BETO, hacia: ANA, placeId: LUGAR, creadoEn: new Date(),
    })
    await assertFails(setDoc(doc(como(CARLA), 'conexiones', idConexion), {
      usuarios: [ANA, BETO].sort(), placeId: LUGAR, creadaEn: new Date(), deshecho: false,
    }))
  })
})

describe('Chat deshecho: no se escribe, y no se revive con intereses viejos', () => {
  const idConexion = [ANA, BETO].sort().join('_')

  async function conexionDeshecha({ interesesNuevos = false } = {}) {
    const cuando = new Date()
    await entorno.withSecurityRulesDisabled(async (contexto) => {
      const bd = contexto.firestore()
      await setDoc(doc(bd, 'conexiones', idConexion), {
        usuarios: [ANA, BETO].sort(), placeId: LUGAR, creadaEn: new Date(),
        deshecho: true, deshechoEn: cuando,
      })
      const creadoEn = interesesNuevos
        ? new Date(cuando.getTime() + 60_000)
        : new Date(cuando.getTime() - 60_000)
      await setDoc(doc(bd, 'intereses', idInteres(ANA, BETO)), {
        desde: ANA, hacia: BETO, placeId: LUGAR, creadoEn,
      })
      await setDoc(doc(bd, 'intereses', idInteres(BETO, ANA)), {
        desde: BETO, hacia: ANA, placeId: LUGAR, creadoEn,
      })
    })
  }

  test('con el match deshecho NO se puede mandar un mensaje', async () => {
    await conexionDeshecha()
    await assertFails(addDoc(collection(como(BETO), 'conexiones', idConexion, 'mensajes'), {
      autorUid: BETO, texto: 'hola', creadoEn: new Date(),
    }))
  })

  test('NO se puede reactivar con los intereses ANTERIORES a la separación', async () => {
    await conexionDeshecha({ interesesNuevos: false })
    await assertFails(updateDoc(doc(como(BETO), 'conexiones', idConexion), { deshecho: false }))
  })

  test('sí se puede reactivar si los dos volvieron a mostrar interés después', async () => {
    await conexionDeshecha({ interesesNuevos: true })
    await assertSucceeds(updateDoc(doc(como(BETO), 'conexiones', idConexion), { deshecho: false }))
  })
})

describe('Edad: terminar el registro es un camino de ida', () => {
  test('NO se puede cambiar la fecha de nacimiento con el perfil completo', async () => {
    await perfil(ANA)
    await assertFails(updateDoc(doc(como(ANA), 'usuarios', ANA), { fechaNacimiento: '2010-1-1' }))
  })

  test('NO se puede apagar perfilCompleto para desbloquear la fecha', async () => {
    await perfil(ANA)
    await assertFails(updateDoc(doc(como(ANA), 'usuarios', ANA), { perfilCompleto: false }))
  })

  test('sin el registro terminado, la fecha todavía se puede corregir', async () => {
    await perfil(ANA, { perfilCompleto: false })
    await assertSucceeds(updateDoc(doc(como(ANA), 'usuarios', ANA), { fechaNacimiento: '1995-3-3' }))
  })

  test('nadie puede aprobarse su propia verificación', async () => {
    await perfil(ANA, { estadoVerificacion: 'rechazado' })
    await assertFails(updateDoc(doc(como(ANA), 'usuarios', ANA), { estadoVerificacion: 'aprobado' }))
  })
})

describe('Activaciones: solo ves el local donde estás, mientras estés', () => {
  test('estando los dos en el mismo local, se lee la activación del otro', async () => {
    await activar(ANA)
    await activar(BETO)
    await assertSucceeds(getDoc(doc(como(ANA), 'activaciones', BETO)))
  })

  test('desde otro local, NO se lee', async () => {
    await activar(ANA, { placeId: 'lugar-otro' })
    await activar(BETO)
    await assertFails(getDoc(doc(como(ANA), 'activaciones', BETO)))
  })

  // Hallazgo del 2026-09-09: al salir de un lugar el documento no se borra, se
  // marca activa: false. Antes eso seguía dando acceso a la gente de ese bar
  // para siempre.
  test('después de salir del local, NO se lee', async () => {
    await activar(ANA, { activa: false })
    await activar(BETO)
    await assertFails(getDoc(doc(como(ANA), 'activaciones', BETO)))
  })

  test('con una activación de hace ocho horas, NO se lee', async () => {
    await activar(ANA, { hace: 8 * 60 * 60 * 1000 })
    await activar(BETO)
    await assertFails(getDoc(doc(como(ANA), 'activaciones', BETO)))
  })

  test('sin estar activado en ninguna parte, NO se lee', async () => {
    await activar(BETO)
    await assertFails(getDoc(doc(como(CARLA), 'activaciones', BETO)))
  })

  // El candado de agosto: la activación solo la crea el servidor, porque es
  // quien comprueba por GPS que estabas ahí.
  test('el cliente NO puede crear su propia activación', async () => {
    await assertFails(setDoc(doc(como(ANA), 'activaciones', ANA), {
      uid: ANA, placeId: LUGAR, activa: true, modo: 'participar',
    }))
  })

  test('el cliente NO puede cambiarse de local', async () => {
    await activar(ANA)
    await assertFails(updateDoc(doc(como(ANA), 'activaciones', ANA), { placeId: 'lugar-otro' }))
  })

  // Salir tiene que ser una puerta de una sola dirección. Si el cliente pudiera
  // volver a encender `activa`, salir del local no revocaría nada: bastaría con
  // encenderla de nuevo para seguir leyendo a la gente de ahí, sin volver a
  // pasar por la comprobación de GPS.
  test('salir del local sí se puede', async () => {
    await activar(ANA)
    await assertSucceeds(updateDoc(doc(como(ANA), 'activaciones', ANA), { activa: false }))
  })

  test('pero volver a entrar solo NO: hay que pasar de nuevo por el servidor', async () => {
    await activar(ANA, { activa: false })
    await assertFails(updateDoc(doc(como(ANA), 'activaciones', ANA), { activa: true }))
  })

  test('y habiendo salido, ya no se lee a la gente del local', async () => {
    await activar(ANA, { activa: false })
    await activar(BETO)
    await assertFails(getDoc(doc(como(ANA), 'activaciones', BETO)))
  })

  test('el latido normal sigue funcionando sin tocar activa', async () => {
    await activar(ANA)
    await assertSucceeds(updateDoc(doc(como(ANA), 'activaciones', ANA), { actualizadaEn: new Date() }))
  })
})

describe('Lo que el cliente no puede tocar', () => {
  test('los contadores de los locales no se pueden escribir', async () => {
    await assertFails(setDoc(doc(como(ANA), 'estadisticasLugar', 'x'), { total: 9999 }))
  })

  test('los escaneos de QR no se pueden escribir', async () => {
    await assertFails(setDoc(doc(como(ANA), 'escaneosLugar', 'x'), { total: 9999 }))
  })

  test('los avisos de los locales no se pueden escribir', async () => {
    await assertFails(setDoc(doc(como(ANA), 'avisos', 'x'), { texto: 'falso' }))
  })

  test('no se puede recorrer la lista de usuarios', async () => {
    await perfil(ANA)
    await perfil(BETO)
    await assertFails(getDocs(collection(como(CARLA), 'usuarios')))
  })

  test('los contadores de límites de uso no se pueden tocar', async () => {
    await assertFails(setDoc(doc(como(ANA), 'limites', ANA), { verificaciones: 0 }))
  })
})

// ---------------------------------------------------------------------------
// PENDIENTE CONOCIDO — hallazgo A4, todavía sin cerrar.
//
// Esta prueba documenta un agujero que sigue abierto a propósito: la regla no
// exige todavía modo == 'participar', porque las versiones 26 y anteriores de
// la app consultan sin ese filtro y apretarla ahora les dejaría Descubrir en
// blanco (las reglas de Firestore no filtran, exigen).
//
// Cuando la 27 esté distribuida y se agregue la condición, esta prueba va a
// fallar. ESO ES LA SEÑAL: hay que darla vuelta a assertFails y borrar este
// comentario.
// ---------------------------------------------------------------------------
describe('Explorar (pendiente de cerrar)', () => {
  test('hoy TODAVÍA se puede leer la activación de alguien en modo explorar', async () => {
    await activar(ANA)
    await activar(BETO, { modo: 'explorar' })
    await assertSucceeds(getDoc(doc(como(ANA), 'activaciones', BETO)))
  })

  test('la consulta que hace la app sí los excluye', async () => {
    await activar(ANA)
    await activar(BETO, { modo: 'explorar' })
    await activar(CARLA, { modo: 'participar' })
    const resultado = await getDocs(query(
      collection(como(ANA), 'activaciones'),
      where('placeId', '==', LUGAR),
      where('activa', '==', true),
      where('modo', '==', 'participar')
    ))
    const uids = resultado.docs.map((d) => d.id).sort()
    assert.deepEqual(uids, [ANA, CARLA].sort(), 'solo deben venir los de modo participar')
  })
})
