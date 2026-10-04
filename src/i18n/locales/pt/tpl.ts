import type { Dict } from '../en'
const tpl: Dict['tpl'] = {
  welcome: 'Olá {first_name}, foi uma alegria tê-lo connosco na {church}! Gostaríamos de o conhecer — responda quando quiser, e esperamos vê-lo novamente este domingo. 💜',
  birthday: 'Feliz aniversário, {first_name}! 🎉 Toda a {church} celebra consigo hoje. Que Deus abençoe o seu novo ano!',
  thanks: 'Obrigado, {first_name}, pela sua generosidade para com a {church}. As suas ofertas tornam o ministério possível. 🙏',
  reminder: 'Olá {first_name}, um lembrete: {event} é a {date} às {time}. Até lá! — {church}',
  sunday: 'Olá {first_name}, adorávamos vê-lo no culto este domingo. Deus o abençoe! — {church}',
  announcement: 'Olá {first_name}, novidades da {church}: {text}',
  departmentMeeting: 'Olá {first_name}, a equipa de {department} reúne-se a {date} às {time}. Até lá! — {church}',
  meetingInvite: 'Olá {first_name}, está convidado para {event} a {date} às {time}. Participe aqui: {link} — {church}',
}
export default tpl
