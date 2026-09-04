// Set de íconos SVG consistente (mismo trazo que ya usaba BottomNav) para
// reemplazar los emojis y caracteres de texto que se usaban como íconos de
// acción/estado en el resto de la app. Los emojis "de contenido" (planes,
// intereses, el símbolo dentro de cada .radar-core) se dejan como estaban
// a propósito — le dan personalidad, no son el problema de consistencia.

function Base({ size = 22, children, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      {children}
    </svg>
  )
}

export function IconVolver(props) {
  return (
    <Base {...props}>
      <path d="M15 4L7 12l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  )
}

export function IconCerrar(props) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Base>
  )
}

export function IconMenu(props) {
  return (
    <Base {...props}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </Base>
  )
}

// Los mismos tres puntos, pero en vertical. Es la convención para el menú de
// acciones en la esquina de una foto; el horizontal se usa para otra cosa.
export function IconMenuVertical(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </Base>
  )
}

export function IconBasurero(props) {
  return (
    <Base {...props}>
      <path
        d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Base>
  )
}

export function IconEstrella(props) {
  return (
    <Base {...props}>
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </Base>
  )
}

export function IconEnviar(props) {
  return (
    <Base {...props}>
      <path
        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Base>
  )
}

export function IconCamara(props) {
  return (
    <Base {...props}>
      <path
        d="M4 7h3l2-3h6l2 3h3v13H4V7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
    </Base>
  )
}

export function IconLapiz(props) {
  return (
    <Base {...props}>
      <path
        d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Base>
  )
}

export function IconAgregar(props) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Base>
  )
}

export function IconMeInteresa(props) {
  return (
    <Base {...props}>
      <path
        d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"
        fill="currentColor"
      />
    </Base>
  )
}

export function IconMasTarde(props) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Base>
  )
}

export function IconVerificado(props) {
  return (
    <Base {...props}>
      <path
        d="M12 2L4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  )
}

export function IconPendiente(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  )
}

export function IconAlerta(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Base>
  )
}

export function IconPausa(props) {
  return (
    <Base {...props}>
      <rect x="6" y="4" width="4" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </Base>
  )
}

export function IconContacto(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </Base>
  )
}

export function IconOjo(props) {
  return (
    <Base {...props}>
      <path
        d="M2.25 12S5.5 5.25 12 5.25 21.75 12 21.75 12 18.5 18.75 12 18.75 2.25 12 2.25 12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </Base>
  )
}

export function IconOjoTachado(props) {
  return (
    <Base {...props}>
      <path
        d="M2.25 12S5.5 5.25 12 5.25c2.02 0 3.68.63 5 1.5M21.75 12S18.5 18.75 12 18.75c-2.02 0-3.68-.63-5-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9.5 9.7a3 3 0 0 0 4.3 4.1M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Base>
  )
}
