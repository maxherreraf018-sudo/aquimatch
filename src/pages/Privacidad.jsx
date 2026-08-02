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
      'Correo electrónico de contacto: maxherreraf018@gmail.com',
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
    titulo: '5. Compartición de información',
    parrafos: [
      'AquíMatch no vende datos personales. Solo compartimos información cuando es necesario con proveedores tecnológicos que prestan servicios para la operación de la plataforma (por ejemplo, Google Firebase), autoridades competentes cuando exista una obligación legal, y proveedores de autenticación (Apple o Google) cuando el usuario elige esos métodos de acceso.',
    ],
  },
  {
    titulo: '6. Protección de la información',
    parrafos: [
      'Aplicamos medidas razonables para proteger los datos personales: conexiones cifradas, controles de acceso, autenticación segura, monitoreo de incidentes y respaldo de información. Aunque adoptamos medidas de seguridad, ningún sistema puede garantizar una protección absoluta frente a todos los riesgos.',
    ],
  },
  {
    titulo: '7. Eliminación de la cuenta',
    parrafos: [
      'El usuario podrá solicitar la eliminación de su cuenta. Al eliminarla, el perfil dejará de ser visible y se eliminarán los datos personales que ya no sea necesario conservar, salvo aquellos que debamos mantener por obligación legal o para prevenir fraudes.',
    ],
  },
  {
    titulo: '8. Derechos del usuario (derechos ARCO)',
    parrafos: ['El usuario podrá solicitar, conforme a la legislación aplicable:'],
    lista: [
      'acceso a sus datos personales;',
      'rectificación de información inexacta;',
      'actualización de sus datos;',
      'eliminación de información cuando corresponda;',
      'oposición al tratamiento en los casos previstos por la ley.',
    ],
    final: ['Las solicitudes podrán enviarse al correo maxherreraf018@gmail.com.'],
  },
  {
    titulo: '9. Menores de edad',
    parrafos: [
      'AquíMatch está destinada exclusivamente a personas de 18 años o más. No recopilamos intencionalmente datos personales de menores de edad. Si detectamos que una cuenta pertenece a un menor, la suspenderemos o eliminaremos de forma inmediata, junto con los datos personales asociados.',
    ],
  },
  {
    titulo: '10. Mensajes y conversaciones',
    parrafos: [
      'Las conversaciones entre usuarios son almacenadas para permitir el funcionamiento del servicio. En caso de denuncias por conductas que infrinjan los Términos o la ley, podremos revisar la información estrictamente necesaria para investigar los hechos.',
    ],
  },
  {
    titulo: '11. Cambios en esta Política',
    parrafos: [
      'Podremos modificar esta Política de Privacidad para reflejar cambios legales, técnicos o en el funcionamiento del servicio. Cuando las modificaciones sean relevantes, informaremos a los usuarios antes de su entrada en vigencia.',
    ],
  },
  {
    titulo: '12. Contacto',
    parrafos: [
      'Para consultas relacionadas con esta Política de Privacidad, los usuarios podrán comunicarse con AQUIMATCH SpA a través del correo maxherreraf018@gmail.com.',
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
        AquíMatch · Última actualización: 27 de julio de 2026
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
