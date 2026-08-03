import { useNavigate } from 'react-router-dom'
import { IconVolver } from '../components/Icons'

const SECCIONES = [
  {
    titulo: '1. Objeto de la aplicación',
    parrafos: [
      'AquíMatch es una plataforma tecnológica destinada a facilitar el contacto entre personas que se encuentran físicamente en un mismo lugar y que, voluntariamente, desean conocer nuevas personas.',
      'AquíMatch actúa únicamente como intermediario tecnológico y no organiza reuniones, eventos ni garantiza que los usuarios establezcan conversaciones, amistades o relaciones.',
    ],
  },
  {
    titulo: '2. Requisitos para utilizar AquíMatch',
    parrafos: ['Para utilizar la aplicación el usuario debe:'],
    lista: [
      'tener 18 años o más;',
      'aceptar estos Términos;',
      'aceptar la Política de Privacidad;',
      'proporcionar información verdadera;',
      'utilizar una fotografía real y reciente;',
      'completar el proceso de verificación cuando sea requerido;',
      'otorgar el consentimiento expreso para el tratamiento de datos sensibles (verificación biométrica y preferencias de búsqueda), conforme a la Política de Privacidad.',
    ],
    final: ['No se permite el uso de cuentas falsas ni la suplantación de identidad.'],
  },
  {
    titulo: '2.1 Menores de edad',
    parrafos: [
      'AquíMatch está destinada exclusivamente a personas de 18 años o más. Si detectamos, por cualquier medio, que una cuenta pertenece a una persona menor de edad, eliminaremos de forma inmediata la cuenta y los datos personales asociados, salvo aquellos que debamos conservar por obligación legal. El uso de la Aplicación por parte de un menor de edad, mediante información falsa sobre su edad, constituye un incumplimiento grave de estos Términos.',
    ],
  },
  {
    titulo: '3. Veracidad de la información',
    parrafos: [
      'El usuario declara que toda la información proporcionada es verdadera.',
      'AquíMatch podrá suspender o eliminar cuentas cuando detecte:',
    ],
    lista: ['información falsa;', 'fotografías manipuladas para engañar;', 'identidad falsa;', 'múltiples cuentas;', 'intentos de fraude.'],
  },
  {
    titulo: '4. Geolocalización',
    parrafos: [
      'La Aplicación utiliza la ubicación del dispositivo para determinar si el usuario se encuentra efectivamente en el lugar desde donde desea participar.',
      'La ubicación se utiliza únicamente para las funcionalidades propias de la plataforma y conforme a la Política de Privacidad.',
    ],
  },
  {
    titulo: '5. Funcionamiento del servicio',
    parrafos: ['La aplicación permite:'],
    lista: [
      'visualizar personas que participan desde el mismo lugar;',
      'expresar interés en otro usuario;',
      'recibir intereses;',
      'establecer un chat únicamente cuando exista interés mutuo.',
    ],
    final: ['AquíMatch no muestra la ubicación exacta de ningún usuario.'],
  },
  {
    titulo: '6. Conducta esperada',
    parrafos: ['Los usuarios deberán mantener un comportamiento respetuoso. Está prohibido:'],
    lista: [
      'acosar;',
      'amenazar;',
      'insultar;',
      'discriminar;',
      'extorsionar;',
      'publicar contenido ilegal;',
      'solicitar dinero;',
      'difundir información privada de terceros;',
      'utilizar la plataforma para actividades ilícitas.',
    ],
  },
  {
    titulo: '7. Seguridad',
    parrafos: ['AquíMatch podrá implementar medidas de seguridad tales como:'],
    lista: ['verificación de identidad;', 'validación mediante GPS;', 'bloqueo automático de cuentas;', 'revisión de denuncias;', 'suspensión preventiva.'],
  },
  {
    titulo: '8. Denuncias y bloqueos',
    parrafos: ['Todo usuario podrá:'],
    lista: ['denunciar perfiles;', 'bloquear otros usuarios;', 'reportar conversaciones;', 'informar conductas inapropiadas.'],
    final: ['AquíMatch analizará cada caso y podrá aplicar medidas según corresponda.'],
  },
  {
    titulo: '9. Eliminación de cuentas',
    parrafos: ['AquíMatch podrá eliminar cuentas por:'],
    lista: ['incumplimiento de estos Términos;', 'fraude;', 'identidad falsa;', 'actividades ilícitas;', 'uso indebido del sistema;', 'reiteradas denuncias fundadas.'],
    final: ['El usuario podrá solicitar la eliminación voluntaria de su propia cuenta en cualquier momento.'],
  },
  {
    titulo: '10. Responsabilidad de los encuentros',
    parrafos: [
      'AquíMatch facilita el contacto entre usuarios, pero no participa en las interacciones posteriores.',
      'Cada usuario es responsable de las decisiones que adopte respecto de reuniones, conversaciones o encuentros con otras personas.',
      'La empresa recomienda actuar siempre con prudencia y privilegiar lugares públicos para un primer encuentro.',
    ],
  },
  {
    titulo: '11. Limitación de responsabilidad',
    parrafos: ['AquíMatch no garantiza:'],
    lista: ['compatibilidad entre usuarios;', 'respuestas a mensajes;', 'obtención de amistades;', 'relaciones sentimentales;', 'resultados específicos.'],
    final: ['La aplicación constituye únicamente una herramienta tecnológica de conexión.'],
  },
  {
    titulo: '12. Propiedad intelectual y licencia sobre el contenido del usuario',
    parrafos: [
      'Todos los derechos sobre el software, diseño, logotipos, marca AquíMatch, interfaz, código fuente y contenido propio de la Aplicación pertenecen a AQUIMATCH SpA o a sus respectivos titulares. Queda prohibida su reproducción sin autorización.',
      'El usuario conserva la propiedad de las fotografías y demás contenidos que suba a su perfil. Sin embargo, al subirlos, otorga a AquíMatch una licencia limitada, no exclusiva y gratuita para almacenar, mostrar y procesar ese contenido, únicamente con el fin de operar las funcionalidades de la Aplicación. Esta licencia termina cuando el usuario elimina el contenido o su cuenta, salvo por copias que deban conservarse temporalmente por razones técnicas o legales.',
    ],
  },
  {
    titulo: '13. Suspensión del servicio',
    parrafos: ['AquíMatch podrá:'],
    lista: ['modificar funciones;', 'actualizar la plataforma;', 'suspender temporalmente servicios;', 'realizar mantenciones;', 'incorporar nuevas funcionalidades.'],
  },
  {
    titulo: '14. Privacidad',
    parrafos: [
      'El tratamiento de datos personales se regula conforme a la Ley N°21.719 sobre Protección de Datos Personales y a la Política de Privacidad de AquíMatch, la cual forma parte integrante de estos Términos. Ante la Agencia de Protección de Datos Personales, el usuario podrá ejercer los derechos y reclamos que la ley le reconoce.',
    ],
  },
  {
    titulo: '15. Modificaciones',
    parrafos: [
      'Estos Términos podrán ser actualizados. Las modificaciones relevantes serán informadas a los usuarios antes de su entrada en vigencia, y podrán requerir una nueva aceptación para continuar usando la Aplicación.',
    ],
  },
  {
    titulo: '16. Legislación aplicable',
    parrafos: ['Estos Términos se rigen por las leyes de la República de Chile. Cualquier controversia será resuelta por los tribunales competentes de Chile.'],
  },
  {
    titulo: '17. Contacto',
    parrafos: [
      'Para consultas relacionadas con estos Términos, los usuarios podrán comunicarse con AQUIMATCH SpA a través del correo contacto@aquimatch.cl o de los canales oficiales de soporte que se publiquen en la Aplicación.',
    ],
  },
]

export default function Terminos() {
  const navigate = useNavigate()

  return (
    <div className="screen">
      <button
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <IconVolver size={16} /> Volver
      </button>
      <h1 style={{ marginBottom: 4 }}>Términos y Condiciones</h1>
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 20 }}>
        AquíMatch · Última actualización: 3 de agosto de 2026
      </p>

      <p style={{ marginBottom: 16 }}>
        Estos Términos y Condiciones regulan el acceso y uso de la aplicación móvil AquíMatch, operada por
        AQUIMATCH SpA, RUT 78.465.887-2, con domicilio en Eyzaguirre N°819, Santiago, Chile.
        Al crear una cuenta o utilizar la Aplicación, el usuario declara
        haber leído, comprendido y aceptado íntegramente estos Términos y la Política de Privacidad.
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
