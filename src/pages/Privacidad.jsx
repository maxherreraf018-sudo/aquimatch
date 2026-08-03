import { useNavigate } from 'react-router-dom'
import { IconVolver } from '../components/Icons'

const SECCIONES = [
  {
    titulo: '1. Introducción',
    parrafos: [
      'En AQUIMATCH SpA valoramos la privacidad de nuestros usuarios y nos comprometemos a proteger sus datos personales.',
      'Esta Política de Privacidad explica qué información recopilamos, cómo la utilizamos, con quién podemos compartirla y cuáles son los derechos de los usuarios.',
      'Al utilizar AquíMatch, el usuario acepta el tratamiento de sus datos conforme a esta Política.',
    ],
  },
  {
    titulo: '2. Responsable del tratamiento de datos',
    parrafos: [
      'AQUIMATCH SpA, RUT 78.465.887-2, con domicilio en Eyzaguirre N°819, Santiago, Chile.',
      'Correo electrónico de contacto: privacidad@aquimatch.cl',
      'Sitio web: aquimatch.cl',
    ],
  },
  {
    titulo: '3. ¿Qué información recopilamos?',
    parrafos: ['Información entregada por el usuario:'],
    lista: [
      'Nombre o nombre de usuario.',
      'Fecha de nacimiento.',
      'Género (si el usuario decide informarlo).',
      'Preferencias para conocer personas.',
      'Fotografía de perfil y fotografías adicionales.',
      'Correo electrónico.',
      'Método de inicio de sesión (Apple, Google o correo electrónico).',
    ],
    final: [
      'También recopilamos información técnica (modelo de dispositivo, sistema operativo, idioma, dirección IP, registros de errores), información de ubicación (solo para verificar que estás en el lugar desde donde quieres participar — nunca se muestra tu ubicación exacta a otros usuarios), e información de uso (fecha de registro, intereses expresados, coincidencias, conversaciones, reportes y bloqueos).',
      'Algunos de estos datos —la fotografía de verificación (selfie) y la preferencia de personas que deseas conocer— corresponden a categorías especialmente protegidas por la ley (datos biométricos y datos que pueden revelar orientación sexual). En la sección 6 explicamos cómo los tratamos y qué consentimiento te pedimos para ello.',
    ],
  },
  {
    titulo: '4. ¿Para qué utilizamos los datos?',
    parrafos: ['Los datos personales se utilizan para:'],
    lista: [
      'crear la cuenta del usuario;',
      'verificar la edad mínima;',
      'autenticar el acceso;',
      'mostrar personas compatibles en el mismo lugar;',
      'habilitar conversaciones cuando exista interés mutuo;',
      'mejorar la experiencia del usuario;',
      'prevenir fraudes y detectar cuentas falsas;',
      'responder solicitudes de soporte;',
      'cumplir obligaciones legales.',
    ],
  },
  {
    titulo: '5. Base legal del tratamiento',
    parrafos: ['Tratamos tus datos personales sobre las siguientes bases legales, según corresponda:'],
    lista: [
      'Ejecución del contrato: los datos necesarios para crear tu cuenta y prestarte el servicio (nombre, edad, fotos, ubicación aproximada).',
      'Consentimiento: para el tratamiento de datos sensibles (ver sección 6), que solicitamos de forma expresa y separada al registrarte.',
      'Obligación legal: cuando debamos conservar o entregar información por mandato de la ley o de una autoridad competente.',
      'Interés legítimo: para prevenir fraude, cuentas falsas y proteger la seguridad de la comunidad, siempre de forma proporcionada a tu privacidad.',
    ],
  },
  {
    titulo: '6. Datos sensibles',
    parrafos: [
      'La ley chilena considera "datos sensibles" a aquellos que revelan información especialmente delicada de una persona. En AquíMatch tratamos dos categorías de este tipo:',
    ],
    lista: [
      'Dato biométrico: tu selfie de verificación, usada exclusivamente para confirmar que la persona detrás de la cuenta coincide con la foto de perfil, y evitar cuentas falsas o suplantación de identidad.',
      'Dato que puede revelar orientación sexual: tu preferencia sobre las personas que te gustaría conocer (mujeres, hombres o ambos), usada exclusivamente para mostrarte perfiles compatibles.',
    ],
    final: [
      'Te pedimos tu consentimiento expreso y específico para tratar estos datos al momento de completar tu perfil (independiente de la aceptación general de los Términos y esta Política). Puedes revocar este consentimiento eliminando tu cuenta en cualquier momento — al hacerlo, dejamos de tratar estos datos según lo descrito en la sección "Conservación de los datos".',
    ],
  },
  {
    titulo: '7. Compartición de información',
    parrafos: [
      'AquíMatch no vende datos personales. Compartimos información únicamente cuando es necesario, con:',
    ],
    lista: [
      'proveedores tecnológicos que prestan servicios para la operación de la plataforma (Google Firebase / Google Cloud);',
      'proveedores de autenticación (Apple o Google), cuando el usuario elige esos métodos de acceso;',
      'autoridades competentes, cuando exista una obligación legal.',
    ],
    final: ['Algunos de estos proveedores procesan o almacenan información fuera de Chile — ver sección 8.'],
  },
  {
    titulo: '8. Transferencia internacional de datos',
    parrafos: [
      'Utilizamos servicios de infraestructura tecnológica (Google Firebase / Google Cloud) cuyos servidores pueden ubicarse fuera de Chile. Estas transferencias se realizan bajo los estándares de protección contractual y de seguridad que exige la ley, y únicamente para operar las funcionalidades descritas en esta Política. No transferimos datos a terceros con fines distintos a la operación del servicio.',
    ],
  },
  {
    titulo: '9. Protección de la información',
    parrafos: [
      'Aplicamos medidas razonables para proteger los datos personales: conexiones cifradas, controles de acceso, autenticación segura, monitoreo de incidentes y respaldo de información. Aunque adoptamos medidas de seguridad, ningún sistema puede garantizar una protección absoluta frente a todos los riesgos.',
    ],
  },
  {
    titulo: '10. Conservación de los datos',
    parrafos: [
      'Conservamos tus datos personales mientras tu cuenta permanezca activa. Si eliminas tu cuenta, eliminamos tus datos personales dentro de un plazo razonable desde la solicitud, salvo la información que debamos conservar por obligación legal (por ejemplo, para atender fiscalizaciones) o para la prevención de fraude, la cual conservamos solo por el tiempo estrictamente necesario para ese fin.',
    ],
  },
  {
    titulo: '11. Eliminación de la cuenta',
    parrafos: [
      'El usuario podrá solicitar la eliminación de su cuenta. Al eliminarla, el perfil dejará de ser visible y se eliminarán los datos personales según los criterios de la sección 10, salvo aquellos que debamos mantener por obligación legal o para prevenir fraudes.',
    ],
  },
  {
    titulo: '12. Derechos del usuario (derechos ARCO+)',
    parrafos: ['El usuario podrá solicitar, conforme a la legislación aplicable:'],
    lista: [
      'acceso a sus datos personales;',
      'rectificación de información inexacta;',
      'actualización de sus datos;',
      'eliminación ("cancelación") de su información, cuando corresponda;',
      'oposición al tratamiento en los casos previstos por la ley;',
      'portabilidad, es decir, solicitar sus datos en un formato estructurado y de uso común.',
    ],
    final: [
      'Las solicitudes podrán enviarse a privacidad@aquimatch.cl y serán respondidas dentro de los plazos que establece la ley.',
      'Si no quedas conforme con nuestra respuesta, tienes derecho a presentar un reclamo ante la Agencia de Protección de Datos Personales, el organismo regulador chileno en esta materia.',
    ],
  },
  {
    titulo: '13. Notificación de incidentes de seguridad',
    parrafos: [
      'Si llegara a ocurrir una vulneración de seguridad que afecte tus datos personales y represente un riesgo real para tus derechos, te notificaremos junto con la autoridad competente, conforme a los plazos y condiciones que establece la ley.',
    ],
  },
  {
    titulo: '14. Menores de edad',
    parrafos: [
      'AquíMatch está destinada exclusivamente a personas de 18 años o más. No recopilamos intencionalmente datos personales de menores de edad. Si detectamos que una cuenta pertenece a un menor, la suspenderemos o eliminaremos de forma inmediata, junto con los datos personales asociados.',
    ],
  },
  {
    titulo: '15. Mensajes y conversaciones',
    parrafos: [
      'Las conversaciones entre usuarios son almacenadas para permitir el funcionamiento del servicio. En caso de denuncias por conductas que infrinjan los Términos o la ley, podremos revisar la información estrictamente necesaria para investigar los hechos.',
    ],
  },
  {
    titulo: '16. Cambios en esta Política',
    parrafos: [
      'Podremos modificar esta Política de Privacidad para reflejar cambios legales, técnicos o en el funcionamiento del servicio. Cuando las modificaciones sean relevantes, informaremos a los usuarios antes de su entrada en vigencia.',
    ],
  },
  {
    titulo: '17. Contacto',
    parrafos: [
      'Para consultas relacionadas con esta Política de Privacidad, los usuarios podrán comunicarse con AQUIMATCH SpA a través del correo privacidad@aquimatch.cl.',
    ],
  },
]

export default function Privacidad() {
  const navigate = useNavigate()

  return (
    <div className="screen">
      <button
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <IconVolver size={16} /> Volver
      </button>
      <h1 style={{ marginBottom: 4 }}>Política de Privacidad</h1>
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 20 }}>
        AquíMatch · Última actualización: 3 de agosto de 2026
      </p>

      {SECCIONES.map((s) => (
        <div key={s.titulo} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>{s.titulo}</h2>
          {s.parrafos?.map((texto, i) => (
            <p key={i} style={{ marginBottom: 8, fontSize: 14 }}>
              {texto}
            </p>
          ))}
          {s.lista && (
            <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
              {s.lista.map((item, i) => (
                <li key={i} style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 4 }}>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {s.final?.map((texto, i) => (
            <p key={i} style={{ marginBottom: 8, fontSize: 14 }}>
              {texto}
            </p>
          ))}
        </div>
      ))}

      <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => navigate(-1)}>
        Volver
      </button>
    </div>
  )
}
