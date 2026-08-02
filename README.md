# AquiMatch — MVP (Fase 1: Onboarding + Fase 2: Activación sin QR)

Este es el arranque real de la app: registro, login, creación de perfil, y ahora la
activación por GPS + Google Maps (sin QR ni participación de locales asociados).

## Qué incluye esta fase

- Pantalla de bienvenida
- Registro / login (correo y contraseña + Google)
- Crear perfil (nombre, fecha de nacimiento, foto, con validación de edad 25+)
- Completar perfil (preferencia de género, selfie de verificación)
- **Activación por GPS**: detecta lugares cercanos (bares, cafés, restaurantes) con Google
  Places, el usuario confirma dónde está, y se activa su participación — sin QR.
- **Ver quién más está activo** en el mismo lugar, en tiempo real.
- Salida automática (si te alejas del lugar) o manual (botón "Salir de este lugar").
- Guardado real en Firestore + Firebase Storage
- Rutas protegidas (no puedes crear perfil sin sesión iniciada)

## 1. Instalar dependencias

Necesitas [Node.js](https://nodejs.org) instalado (versión 18 o superior). Luego, en la carpeta del proyecto:

```bash
npm install
```

## 2. Conectar tu proyecto de Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com) → tu proyecto → ⚙️ Configuración del proyecto → baja hasta "Tus apps" → selecciona o crea una app web.
2. Copia los valores de `firebaseConfig`.
3. Pégalos en `src/firebase/config.js`, reemplazando los valores `TU_...`.

### Activa estos servicios en la consola de Firebase:

- **Authentication** → Sign-in method → activa "Correo/contraseña" y "Google".
- **Firestore Database** → crear base de datos (modo producción).
- **Storage** → activar (para fotos de perfil y selfies).

### Reglas mínimas de Firestore (Firestore → Reglas), para desarrollo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### Reglas mínimas de Storage (Storage → Reglas):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**}/{uid}/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 3. Conectar Google Places (para detectar el lugar sin QR)

Este paso es nuevo y necesario para que funcione la activación por GPS.

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) y selecciona el **mismo
   proyecto** que usaste en Firebase (todo proyecto de Firebase es también un proyecto de
   Google Cloud, aparece con el mismo nombre).
2. En el buscador de arriba, escribe "Places API (New)" y entra a esa página. Haz clic en
   **Habilitar**.
3. Ve a "APIs y servicios" → "Credenciales" → "Crear credenciales" → "Clave de API".
4. Copia la clave que se genera.
5. **Importante:** Google requiere una cuenta de facturación (tarjeta) asociada al proyecto
   para usar esta API, aunque incluye un crédito mensual gratuito que normalmente cubre de
   sobra el uso de un MVP. Si no tienes facturación activada, Google te lo va a pedir en este
   paso.
6. (Recomendado) Restringe la clave: en la misma pantalla de la credencial, en "Restricciones
   de la API", selecciona solo "Places API (New)". En "Restricciones de aplicación", puedes
   restringirla a tu dominio cuando publiques la app.

En la carpeta del proyecto, crea un archivo llamado `.env` (puedes copiar `.env.example` y
renombrarlo) y pega tu clave:

```
VITE_GOOGLE_PLACES_API_KEY=tu_clave_copiada_aqui
```

## 4. Actualiza las reglas de Firestore

Ahora hay una colección nueva, `activaciones`. Reemplaza tus reglas de Firestore por estas:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /activaciones/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
    match /intereses/{interesId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == request.resource.data.desde;
      allow delete: if false;
    }
    match /conexiones/{conexionId} {
      allow read: if request.auth != null && request.auth.uid in resource.data.usuarios;
      allow create: if request.auth != null && request.auth.uid in request.resource.data.usuarios;
      allow update: if request.auth != null && request.auth.uid in resource.data.usuarios;
      allow delete: if false;

      match /mensajes/{mensajeId} {
        allow read: if request.auth != null &&
          request.auth.uid in get(/databases/$(database)/documents/conexiones/$(conexionId)).data.usuarios;
        allow create: if request.auth != null &&
          request.auth.uid in get(/databases/$(database)/documents/conexiones/$(conexionId)).data.usuarios &&
          request.resource.data.autorUid == request.auth.uid;
        allow update, delete: if false;
      }
    }
    match /reportes/{reporteId} {
      allow create: if request.auth != null && request.auth.uid == request.resource.data.reportadoPor;
      allow read, update, delete: if false;
    }
  }
}
```

Esto permite que cualquier usuario autenticado pueda **ver** quién está activo en un lugar
(para el descubrimiento), pero cada quien solo puede **modificar su propia** activación.
Los "intereses" solo los puede crear/actualizar quien los envía, las "conexiones" (chats) solo
las pueden leer y actualizar las dos personas involucradas, los "mensajes" dentro de cada chat
solo los pueden ver y escribir esas mismas dos personas, y los "reportes" solo los puede crear
quien reporta (nadie puede leerlos desde la app — son para revisión manual del equipo).

## 5. Correr la app en local

```bash
npm run dev
```

Abre el link que aparece (normalmente `http://localhost:5173`).

## 6. Siguiente fase (no incluida todavía)

- Panel de moderación de selfies de verificación y de reportes
- Fase 2 del negocio: panel para que los locales "reclamen" su lugar y vean estadísticas
- Estado / Pausa de participación (20 minutos, una vez por noche) como pantalla propia
- Reglas de seguridad más estrictas (validar formato de datos, no solo dueño)
- Cierre automático real de chats a las 72 horas (hoy se oculta en la interfaz; falta un
  proceso de fondo que limpie los datos del servidor por completo)

## Nota técnica: primera vez que corras la búsqueda de personas

La primera vez que la app haga la consulta de "personas activas en este lugar", o la consulta
que evita mostrar a alguien con quien ya hiciste match, es posible que la consola del
navegador muestre un enlace de Firebase pidiéndote crear un **índice compuesto** en Firestore
(es automático: Firebase te da un link, haces clic, esperas un minuto y ya queda listo). Esto
es normal la primera vez que se usa una consulta con dos condiciones.

---

**Nota:** antes de publicar en producción, no dejes las reglas de Firestore/Storage abiertas a cualquier lectura — las de arriba son un punto de partida razonable para desarrollo, pero conviene revisarlas contigo antes de lanzar.
