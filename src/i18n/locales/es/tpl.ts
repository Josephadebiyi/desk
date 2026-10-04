import type { Dict } from '../en'
const tpl: Dict['tpl'] = {
  welcome: 'Hola {first_name}, ¡fue una alegría tenerte en {church}! Nos encantaría conocerte: responde cuando quieras y esperamos verte de nuevo este domingo. 💜',
  birthday: '¡Feliz cumpleaños, {first_name}! 🎉 Todos en {church} celebramos contigo hoy. ¡Que Dios bendiga tu nuevo año!',
  thanks: 'Gracias, {first_name}, por tu generosidad con {church}. Tus ofrendas hacen posible el ministerio. 🙏',
  reminder: 'Hola {first_name}, te recordamos: {event} es el {date} a las {time}. ¡Te esperamos! — {church}',
  sunday: 'Hola {first_name}, nos encantaría verte en el culto este domingo. ¡Dios te bendiga! — {church}',
  announcement: 'Hola {first_name}, novedades de {church}: {text}',
  departmentMeeting: 'Hola {first_name}, el equipo de {department} se reúne el {date} a las {time}. ¡Te esperamos! — {church}',
  meetingInvite: 'Hola {first_name}, estás invitado a {event} el {date} a las {time}. Únete aquí: {link} — {church}',
}
export default tpl
