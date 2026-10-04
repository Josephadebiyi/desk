import type { Dict } from '../en'
const tpl: Dict['tpl'] = {
  welcome: 'Bonjour {first_name}, quelle joie de vous avoir accueilli à {church} ! Nous aimerions vous connaître : répondez quand vous voulez, et à dimanche prochain, nous l’espérons. 💜',
  birthday: 'Joyeux anniversaire, {first_name} ! 🎉 Toute l’église {church} vous fête aujourd’hui. Que Dieu bénisse votre nouvelle année !',
  thanks: 'Merci, {first_name}, pour votre générosité envers {church}. Vos dons rendent le ministère possible. 🙏',
  reminder: 'Bonjour {first_name}, petit rappel : {event} a lieu le {date} à {time}. À bientôt ! — {church}',
  sunday: 'Bonjour {first_name}, nous serions heureux de vous voir au culte ce dimanche. Que Dieu vous bénisse ! — {church}',
  announcement: 'Bonjour {first_name}, des nouvelles de {church} : {text}',
  departmentMeeting: 'Bonjour {first_name}, l’équipe {department} se réunit le {date} à {time}. À bientôt ! — {church}',
  meetingInvite: 'Bonjour {first_name}, vous êtes invité à {event} le {date} à {time}. Rejoignez-nous ici : {link} — {church}',
}
export default tpl
