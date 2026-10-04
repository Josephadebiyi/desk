import type { Dict } from '../en'
const tpl: Dict['tpl'] = {
  welcome: 'Hallo {first_name}, wie schön, dass du bei {church} warst! Wir würden dich gern kennenlernen – antworte jederzeit, und hoffentlich sehen wir uns am Sonntag wieder. 💜',
  birthday: 'Alles Gute zum Geburtstag, {first_name}! 🎉 Ganz {church} feiert heute mit dir. Gottes Segen für dein neues Lebensjahr!',
  thanks: 'Danke, {first_name}, für deine Großzügigkeit gegenüber {church}. Deine Spenden machen unsere Arbeit möglich. 🙏',
  reminder: 'Hallo {first_name}, eine Erinnerung: {event} ist am {date} um {time}. Bis dann! — {church}',
  sunday: 'Hallo {first_name}, wir würden uns freuen, dich diesen Sonntag im Gottesdienst zu sehen. Gottes Segen! — {church}',
  announcement: 'Hallo {first_name}, Neuigkeiten von {church}: {text}',
  departmentMeeting: 'Hallo {first_name}, das Team {department} trifft sich am {date} um {time}. Bis dann! — {church}',
  meetingInvite: 'Hallo {first_name}, du bist zu {event} am {date} um {time} eingeladen. Hier teilnehmen: {link} — {church}',
}
export default tpl
