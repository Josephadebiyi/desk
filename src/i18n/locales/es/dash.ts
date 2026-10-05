import type { Dict } from '../en'
const dash: Dict['dash'] = {
  nav: { attendance: 'Asistencia', overview: 'Resumen', ai: 'Pregunta a Ellen', members: 'Miembros', giving: 'Ofrendas', messaging: 'Mensajes', events: 'Eventos', design: 'Estudio de diseño', reports: 'Informes', settings: 'Configuración', links: 'Enlaces y códigos QR', help: 'Ayuda' },
  rail: { label: 'Acciones rápidas', search: 'Buscar miembros', addMember: 'Añadir miembro', import: 'Importar miembros' },
  billing: {
    tag: "Pago",
    pastDue: "Tu último pago no se completó. Actualiza tu tarjeta para mantener tu plan activo.",
    fix: "Resolver pago",
    choose: "Elegir un plan",
    expiredTitle: "Tu plan ha terminado",
    expiredText: "Tu prueba gratuita o suscripción ha terminado. Todos los datos de tu iglesia están a salvo: elige un plan para seguir donde lo dejaste.",
    askAdmin: "Pide al Administrador de tu iglesia que elija un plan.",
    export: "Descargar tus datos",
  },
  trial: { tag: 'Prueba', left_one: 'Queda {count} día', left_other: 'Quedan {count} días', rest: 'de tu prueba gratuita · Funciones Essentials activas', finish: 'Completar registro', hide: 'Ocultar' },
  viewingAs: 'Viendo como',
  viewingAsHint: 'Comprueba lo que ve cada rol del equipo',
  notif: {
    title: 'Notificaciones',
    unread_one: '{count} nueva',
    unread_other: '{count} nuevas',
    all: 'Abrir la bandeja de Ellen',
  },
  profile: {
    preview: 'Modo vista previa: datos de demostración en este navegador. El inicio de sesión funciona al conectar el servidor.',
    exitPreview: 'Volver al sitio web',
  },
  signOut: 'Cerrar sesión',
  notifications: 'Notificaciones',
  signedInAs: 'Sesión iniciada como {name}',
  website: 'Sitio web de ZionDesk',
}
export default dash
