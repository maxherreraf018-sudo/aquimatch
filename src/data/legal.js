// Textos legales de AquíMatch — FUENTE ÚNICA.
//
// Estos mismos textos se muestran dentro de la app (páginas Privacidad y
// Términos) y en el sitio web (hosting-public/*.html, que se regeneran desde
// acá con scripts/generar-legales.cjs). Antes vivían duplicados en los dos
// lados y podían quedar distintos, que en un documento legal es un problema
// real: si la app dice una cosa y el sitio otra, ninguna de las dos sirve.
//
// Si cambiás algo acá:
//   1. node scripts/generar-legales.cjs     (actualiza el sitio)
//   2. Si el cambio es material, subí VERSION_TERMINOS en firebase/auth.js
//
// PENDIENTE DE REVISIÓN POR ABOGADO — ver revision-legal-aquimatch.md.
// Los puntos que un abogado chileno de protección de datos debe cerrar están
// marcados con [A REVISAR] en el propio texto.

export const ULTIMA_ACTUALIZACION = '17 de agosto de 2026'
export const VERSION_DOCUMENTOS = '2.0'

// Domicilio comercial, no el particular de Max: este dato queda público en la
// app, en el sitio y en el directorio de agentes DMCA.
const DOMICILIO = 'Federico Errázuriz 686, Pudahuel, Santiago, Chile'
const CORREO_PRIVACIDAD = 'privacidad@aquimatch.cl'
const CORREO_CONTACTO = 'contacto@aquimatch.cl'

export const POLITICA_PRIVACIDAD = [
  {
    titulo: '1. Introducción',
    parrafos: [
      'AQUIMATCH SpA ("AquíMatch") reconoce la importancia de proteger los datos personales de quienes usan la aplicación y el sitio web.',
      'Esta Política explica qué datos tratamos, para qué, cómo los protegemos, cuánto tiempo los conservamos, con quién pueden compartirse y qué derechos tienes sobre ellos.',
      'AquíMatch está diseñada para facilitar conexiones entre personas adultas que se encuentran en un mismo lugar físico en un mismo momento.',
      'El tratamiento se realiza conforme a la Ley N.º 19.628 sobre Protección de la Vida Privada, con las modificaciones introducidas por la Ley N.º 21.719, vigentes desde el 1 de diciembre de 2026.',
    ],
  },
  {
    titulo: '2. Quién es responsable de tus datos',
    parrafos: [
      'AQUIMATCH SpA, RUT 78.465.887-2.',
      `Domicilio: ${DOMICILIO}.`,
      `Correo para asuntos de privacidad: ${CORREO_PRIVACIDAD}`,
      `Correo general de contacto: ${CORREO_CONTACTO}`,
    ],
  },
  {
    titulo: '3. Edad mínima',
    parrafos: [
      'AquíMatch es exclusivamente para personas de 18 años o más. No está permitido crear ni mantener una cuenta si eres menor de edad.',
      'Si tenemos motivos razonables para creer que una cuenta pertenece a una persona menor de edad, podemos pedir verificación adicional, limitar funciones o suspender y eliminar la cuenta.',
    ],
  },
  {
    titulo: '4. Datos de tu cuenta y tu perfil',
    parrafos: ['Para crear y mantener tu cuenta tratamos:'],
    lista: [
      'Nombre que usas en el perfil',
      'Fecha de nacimiento',
      'Correo electrónico',
      'Identificador interno de usuario',
      'Proveedor de autenticación, cuando entras con Google',
      'Fecha de creación de la cuenta y de aceptación de los Términos',
      'Fotografía principal y fotografías adicionales',
      'Género y preferencia sobre las personas que quieres conocer',
      'Intereses que elijas',
    ],
    final: [
      'Tu correo electrónico se guarda de forma separada del resto del perfil, en un espacio que solo tú y la administración de AquíMatch pueden leer. Otros usuarios nunca acceden a él.',
      'Tu preferencia sobre las personas que quieres conocer puede permitir inferir tu orientación sexual, que la ley considera un dato sensible. Por eso te pedimos un consentimiento expreso y separado antes de tratarla, y queda registrado con fecha y hora.',
    ],
  },
  {
    titulo: '5. Verificación de identidad con reconocimiento facial',
    parrafos: [
      'Para proteger a la comunidad de perfiles falsos y suplantaciones, al crear tu cuenta te pedimos una selfie de verificación. Esa imagen es un dato biométrico y recibe el nivel de protección más alto que contempla la ley.',
      'Cómo se trata: la selfie se compara automáticamente con tu foto de perfil mediante un sistema de reconocimiento facial provisto por Amazon Web Services (servicio Amazon Rekognition). La comparación se realiza de forma automatizada, sin intervención humana, y su resultado determina si tu cuenta queda habilitada para participar.',
      'Dónde se trata: ese procesamiento ocurre en servidores de Amazon Web Services ubicados en Estados Unidos (región us-east-2). Esto implica una transferencia internacional de un dato sensible. Amazon actúa únicamente como encargado del tratamiento, siguiendo nuestras instrucciones, y no utiliza tu imagen para ningún fin propio.',
      'Antes de tomar la selfie te pedimos un consentimiento expreso y separado, que queda registrado con fecha y hora. Puedes retirarlo en cualquier momento eliminando tu cuenta, lo que borra la selfie de forma permanente.',
      'Derecho a revisión humana: si el sistema rechaza tu verificación y consideras que se equivocó, puedes pedir que una persona la revise escribiendo a ' + CORREO_PRIVACIDAD + '. También puedes expresar tu punto de vista y pedir una explicación de la decisión.',
      'Tu selfie de verificación nunca se muestra a otros usuarios. Se guarda separada del resto de tu perfil y solo pueden verla tú y el equipo de moderación de AquíMatch.',
      '[A REVISAR con abogado: plazo máximo de conservación de la selfie una vez aprobada la verificación, y formalidades adicionales que la Ley 21.719 pueda exigir para esta transferencia internacional de datos sensibles.]',
    ],
  },
  {
    titulo: '6. Geolocalización',
    parrafos: ['Usamos la ubicación de tu dispositivo para:'],
    lista: [
      'Comprobar que estás realmente en el lugar donde quieres participar',
      'Mostrarte los locales cercanos donde puedes activarte',
      'Mostrarte a las personas activas en ese mismo lugar',
      'Detectar cuando te alejas, para desactivar tu participación',
      'Prevenir activaciones falsas',
    ],
    final: [
      'Tus coordenadas exactas nunca se muestran a otros usuarios y no se conservan de forma permanente: se envían a nuestro servidor para comprobar que estás cerca del local y se descartan. Lo único que queda guardado mientras estás activo son las coordenadas del local, que son información pública.',
      'Puedes retirar el permiso de ubicación desde tu dispositivo en cualquier momento. Si lo haces, no podrás activarte en ningún lugar, que es la función principal de AquíMatch.',
    ],
  },
  {
    titulo: '7. Contacto de confianza',
    parrafos: [
      'AquíMatch te permite guardar el nombre y el teléfono de una persona de confianza, para avisarle con un toque dónde estás.',
      'Esos datos pertenecen a un tercero que no usa AquíMatch. Al ingresarlos, declaras que cuentas con su autorización para hacerlo. Te pedimos que se lo comentes antes de guardarlos.',
      'Se almacenan de forma separada del resto de tu perfil, en un espacio que solo tú y la administración de AquíMatch pueden leer. Ningún otro usuario tiene acceso a ellos.',
      'Cuando usas la función de aviso, se abre WhatsApp en tu teléfono con un mensaje ya escrito. El envío lo haces tú desde tu propia cuenta: AquíMatch no envía mensajes en tu nombre ni entrega esos datos a WhatsApp por su cuenta.',
      'Puedes borrar o cambiar ese contacto cuando quieras desde Perfil. Si esa persona nos pide directamente la eliminación de sus datos, la atenderemos conforme a la ley.',
      '[A REVISAR con abogado: fuente de licitud aplicable al tratamiento de datos de un tercero que no es usuario, y si corresponde algún deber de información hacia esa persona.]',
    ],
  },
  {
    titulo: '8. Conversaciones y actividad dentro de la app',
    parrafos: ['Tratamos información sobre:'],
    lista: [
      'Expresiones de interés y coincidencias (matches)',
      'Mensajes intercambiados en los chats',
      'Bloqueos y denuncias',
      'Activaciones en lugares, con su fecha y hora',
    ],
    final: [
      'Los mensajes se conservan aunque elimines una conversación. Cuando eliminas un chat, dejas de verlo tú y la otra persona, y no vuelve a aparecer aunque más adelante hagan match de nuevo. Se conservan en la base de datos únicamente para poder investigar una eventual denuncia.',
      'El equipo de moderación solo accede a esa información cuando existe una denuncia, una sospecha razonable de incumplimiento, una obligación legal o una necesidad de proteger la seguridad de las personas.',
      '[A REVISAR con abogado: plazo máximo de conservación de los mensajes de conversaciones eliminadas.]',
    ],
  },
  {
    titulo: '9. Información técnica',
    parrafos: ['Para que la app funcione y sea segura, tratamos:'],
    lista: [
      'Modelo de dispositivo y sistema operativo',
      'Versión de la aplicación',
      'Dirección IP',
      'Idioma',
      'Registros de errores y fallos',
      'Datos de uso agregados, para entender qué funciones se usan',
      'Identificador para notificaciones push, si las aceptas',
    ],
  },
  {
    titulo: '10. Para qué usamos tus datos',
    parrafos: ['Tratamos tus datos personales para:'],
    lista: [
      'Crear y administrar tu cuenta, y autenticarte',
      'Verificar que eres mayor de 18 años',
      'Verificar tu identidad mediante la selfie',
      'Comprobar que estás en el lugar donde quieres participar',
      'Mostrarte a las personas activas en ese mismo lugar',
      'Procesar intereses, matches y conversaciones',
      'Prevenir fraude, suplantación y abuso',
      'Gestionar bloqueos y denuncias',
      'Resolver errores técnicos y atender soporte',
      'Generar estadísticas, preferentemente agregadas o anonimizadas',
      'Cumplir obligaciones legales y ejercer o defender derechos',
    ],
    final: [
      'No usamos tus datos para fines incompatibles con estos, y no los vendemos ni los compartimos con redes publicitarias.',
    ],
  },
  {
    titulo: '11. En qué nos basamos para tratarlos',
    parrafos: ['Según la operación concreta, el tratamiento se basa en:'],
    lista: [
      'Tu consentimiento, y consentimiento expreso y separado en el caso de la selfie de verificación y de tu preferencia de género',
      'La ejecución de la relación contractual que aceptas al usar AquíMatch',
      'El cumplimiento de obligaciones legales',
      'El interés legítimo en prevenir fraude y proteger la seguridad de las personas usuarias, cuando la ley lo permite',
    ],
  },
  {
    titulo: '12. Dónde se guardan tus datos',
    parrafos: [
      'La mayor parte de tu información personal —tu perfil, tus conversaciones, tus activaciones— se almacena en servidores de Google Cloud ubicados en Santiago de Chile (región southamerica-west1). No sale del país.',
      'Hay dos excepciones, y es importante que las conozcas:',
    ],
    lista: [
      'Tu selfie de verificación se procesa en Amazon Web Services, en Estados Unidos (región us-east-2), como se explica en la sección 5.',
      'Algunas funciones de servidor —la búsqueda de locales cercanos, la activación en un lugar y la eliminación de cuenta— se ejecutan en servidores de Google en Estados Unidos (región us-central1). Los datos que procesan transitan por ahí, aunque se almacenan en Chile.',
    ],
    final: [
      'Cuando exista una transferencia internacional de datos personales, AQUIMATCH SpA adoptará las garantías que exija la legislación aplicable.',
    ],
  },
  {
    titulo: '13. Con quién compartimos información',
    parrafos: [
      'No vendemos tus datos. Los proveedores que usamos para operar la plataforma son:',
    ],
    lista: [
      'Google LLC — Firebase: autenticación, base de datos, almacenamiento de fotos, funciones de servidor, notificaciones push, analítica y reportes de errores',
      'Google LLC — Google Maps Platform (Places API): para identificar los locales cercanos a tu ubicación',
      'Amazon Web Services — Amazon Rekognition: exclusivamente para la comparación de la selfie de verificación',
    ],
    final: [
      'Estos proveedores actúan como encargados del tratamiento: solo pueden usar la información conforme a nuestras instrucciones y a los contratos aplicables.',
      'También podemos entregar información cuando lo exija una autoridad competente conforme a la ley.',
    ],
  },
  {
    titulo: '14. Cuánto tiempo los conservamos',
    parrafos: [
      'Conservamos tus datos mientras tu cuenta esté activa y, después, solo durante el tiempo necesario para las finalidades que justificaron su tratamiento o mientras exista una obligación legal de conservarlos.',
      'Cuando dejan de ser necesarios, los eliminamos o los anonimizamos.',
      'Eliminar tu cuenta no implica necesariamente la eliminación instantánea de absolutamente todos los registros, cuando exista una obligación legal, una investigación de seguridad o una controversia pendiente.',
      '[A REVISAR con abogado: tabla de plazos de conservación por categoría de dato — perfil, selfie, mensajes, registros técnicos, denuncias.]',
    ],
  },
  {
    titulo: '15. Cómo protegemos tus datos',
    parrafos: ['Aplicamos medidas técnicas y organizativas acordes al riesgo, entre ellas:'],
    lista: [
      'Cifrado de las comunicaciones',
      'Reglas de acceso que impiden que un usuario lea los datos privados de otro',
      'Separación de los datos más sensibles (selfie, contacto de confianza, correo) del perfil visible',
      'Verificación en el servidor de que realmente estás en el lugar donde te activas',
      'Límites de uso para prevenir abuso automatizado',
      'Registro de eventos relevantes y copias de seguridad',
      'Actualización de componentes y gestión de vulnerabilidades',
    ],
    final: [
      'Ningún sistema informático puede garantizar seguridad absoluta.',
    ],
  },
  {
    titulo: '16. Si ocurre un incidente de seguridad',
    parrafos: [
      'Si ocurre una vulneración que afecte datos personales, evaluaremos su naturaleza y alcance, adoptaremos medidas de contención, la documentaremos, y comunicaremos a la autoridad y a las personas afectadas en los plazos y condiciones que exija la ley.',
    ],
  },
  {
    titulo: '17. Decisiones automatizadas',
    parrafos: [
      'AquíMatch toma una decisión exclusivamente automatizada que puede afectarte de forma significativa: la verificación de tu selfie, descrita en la sección 5. Si no la superas, no puedes participar en la aplicación.',
      'Respecto de esa decisión tienes derecho a obtener una explicación, a expresar tu punto de vista, a solicitar la intervención de una persona y a pedir su revisión, escribiendo a ' + CORREO_PRIVACIDAD + '.',
      'También usamos sistemas automatizados para ordenar los perfiles que ves y para detectar comportamientos anómalos. Esos procesos no producen efectos jurídicos sobre ti.',
    ],
  },
  {
    titulo: '18. Tus derechos',
    parrafos: ['Sobre tus datos personales puedes ejercer los siguientes derechos:'],
    lista: [
      'Acceso: saber qué datos tuyos tratamos',
      'Rectificación: corregir datos inexactos, desactualizados o incompletos',
      'Supresión: pedir que los eliminemos cuando corresponda',
      'Oposición: oponerte a determinados tratamientos',
      'Bloqueo temporal: pedir que suspendamos el tratamiento en los casos previstos por la ley',
      'Portabilidad: obtener tus datos en un formato electrónico estructurado y de uso común',
    ],
    final: [
      'Estos derechos son personales y su ejercicio es gratuito en los casos que establece la ley.',
    ],
  },
  {
    titulo: '19. Cómo ejercerlos',
    parrafos: [
      `Escríbenos a ${CORREO_PRIVACIDAD} indicando qué derecho quieres ejercer.`,
      'Podemos pedirte información razonable para verificar tu identidad, y así evitar entregar o modificar datos a personas no autorizadas.',
      'Responderemos dentro de los plazos que establece la legislación aplicable.',
      'Si consideras que no hemos atendido correctamente tu solicitud, puedes reclamar ante la autoridad de protección de datos personales competente.',
    ],
  },
  {
    titulo: '20. Eliminar tu cuenta',
    parrafos: [
      'Puedes eliminar tu cuenta desde la propia aplicación, en Perfil → Eliminar mi cuenta.',
      'Al hacerlo se borran tu perfil, tus fotografías, tu selfie de verificación, tu correo y tu contacto de confianza. Tu perfil deja de estar disponible para otras personas de inmediato.',
      'Las conversaciones que hayas tenido seguirán existiendo para la otra persona, sin tu nombre ni tu fotografía.',
      'Algunos registros pueden conservarse cuando exista fundamento legal para ello, conforme a la sección 14.',
    ],
  },
  {
    titulo: '21. Locales y establecimientos',
    parrafos: [
      'AquíMatch muestra nombres de bares, cafés, restoranes y otros locales para que puedas identificar dónde estás participando. Esa información proviene de Google Maps Platform.',
      'Que un local aparezca en AquíMatch no significa que exista patrocinio, autorización, afiliación ni relación comercial con AQUIMATCH SpA, salvo que se indique expresamente.',
    ],
  },
  {
    titulo: '22. Comunicaciones',
    parrafos: [
      'Podemos enviarte notificaciones necesarias para el funcionamiento del servicio: mensajes nuevos, coincidencias, avisos de seguridad y cambios en tu cuenta. Puedes desactivar las notificaciones push desde los ajustes de tu teléfono.',
      'Si en el futuro enviamos comunicaciones comerciales, te pediremos consentimiento y podrás retirarlo en cualquier momento.',
    ],
  },
  {
    titulo: '23. Cambios a esta Política',
    parrafos: [
      'Podemos modificar esta Política por cambios legales, técnicos o funcionales.',
      'Cuando un cambio sea material, te lo informaremos dentro de la aplicación antes de que entre en vigencia y, cuando la ley lo exija, te pediremos nuevamente tu consentimiento.',
    ],
  },
  {
    titulo: '24. Contacto',
    parrafos: [
      'AQUIMATCH SpA · RUT 78.465.887-2',
      `Domicilio: ${DOMICILIO}`,
      `Privacidad: ${CORREO_PRIVACIDAD}`,
      `Contacto general: ${CORREO_CONTACTO}`,
    ],
  },
]
