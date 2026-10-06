import type { Dict } from '../en'
const enums: Dict['enums'] = {
  stage: { Newcomer: 'Visitante', Convert: 'Nuevo creyente', Member: 'Miembro', Worker: 'Servidor' },
  stagePlural: { Newcomer: 'Visitantes', Convert: 'Nuevos creyentes', Member: 'Miembros', Worker: 'Servidores' },
  stageHint: { Newcomer: 'Primera visita', Convert: 'Nuevos en la fe', Member: 'Familia de la iglesia', Worker: 'Equipos de servicio' },
  status: { Active: 'Activo', Inactive: 'Inactivo', Transferred: 'Trasladado' },
  gender: { Female: 'Mujer', Male: 'Hombre' },
  channel: { Call: 'Llamada', SMS: 'SMS', WhatsApp: 'WhatsApp', Email: 'Correo', Visit: 'Visita', Note: 'Nota' },
  mode: { 'In person': 'Presencial', Online: 'En línea', Hybrid: 'Híbrido' },
  method: { Transfer: 'Transferencia', Card: 'Tarjeta', Cash: 'Efectivo', Cheque: 'Cheque' },
  expense: { Utilities: 'Suministros', Salaries: 'Salarios', Outreach: 'Evangelismo', Equipment: 'Equipamiento', Maintenance: 'Mantenimiento', Missions: 'Misiones', Events: 'Eventos', Other: 'Otros' },
  request: { 'Awaiting payment': 'Pendiente de pago', Submitted: 'Enviada', 'In design': 'En diseño', Review: 'Revisión', Delivered: 'Entregada' },
  campaign: { Queued: 'En cola', Scheduled: 'Programado', Sending: "Enviando", Sent: "Enviado", Failed: "Fallido" },
  role: { admin: 'Administrador', finance: 'Finanzas', leader: 'Líder de ministerio' },
  plan: { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' },
}
export default enums
