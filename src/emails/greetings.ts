/**
 * Ellen's welcome emails: to a new member of a church, and to a new team member (with the link to create their
 * password and sign in). {ellen} is Ellen's personal note (written by Claude, or a standard one).
 * Vars: {name} {church} {ellen} — team only: {inviter} {role} {email}
 */
import type { EmailCopy } from './catalog'
import type { EmailLang } from './strings'

export type GreetingKind = 'memberWelcome' | 'teamWelcome'

export const GREETING_EMAILS: Record<EmailLang, Record<GreetingKind, EmailCopy>> = {
  en: {
    memberWelcome: {
      subject: 'Welcome to {church}, {name}!',
      eyebrow: '{church}',
      title: 'Welcome to the family, {name}!',
      body: ['{ellen}', 'If you ever have a question or a prayer request, just reply to this email.', 'With love,<br><b>Ellen</b>, on behalf of {church}'],
      note: 'You’re receiving this because {church} added you to its members on ZionDesk.',
    },
    teamWelcome: {
      subject: 'Welcome to the {church} team on ZionDesk',
      eyebrow: 'A note from Ellen',
      title: 'Welcome aboard, {name}!',
      body: ['{ellen}', '<b>{inviter}</b> added you to <b>{church}</b> as <b>{role}</b>. Click the button to create your password and sign in.', 'Next time, sign in at <b>ziondesk.com/login</b> with <b>{email}</b>.', 'See you inside,<br><b>Ellen</b> · your ZionDesk assistant'],
      cta: 'Create my password',
      note: 'Link expired? Open ziondesk.com/login, choose “Forgot password” and enter {email}. If you weren’t expecting this, you can ignore it.',
    },
  },
  es: {
    memberWelcome: {
      subject: '¡Bienvenido a {church}, {name}!',
      eyebrow: '{church}',
      title: '¡Bienvenido a la familia, {name}!',
      body: ['{ellen}', 'Si tienes alguna pregunta o petición de oración, responde a este correo.', 'Con cariño,<br><b>Ellen</b>, en nombre de {church}'],
      note: 'Recibes este correo porque {church} te añadió a sus miembros en ZionDesk.',
    },
    teamWelcome: {
      subject: 'Bienvenido al equipo de {church} en ZionDesk',
      eyebrow: 'Un mensaje de Ellen',
      title: '¡Bienvenido, {name}!',
      body: ['{ellen}', '<b>{inviter}</b> te añadió a <b>{church}</b> como <b>{role}</b>. Pulsa el botón para crear tu contraseña e iniciar sesión.', 'La próxima vez, entra en <b>ziondesk.com/login</b> con <b>{email}</b>.', 'Nos vemos dentro,<br><b>Ellen</b> · tu asistente de ZionDesk'],
      cta: 'Crear mi contraseña',
      note: '¿El enlace caducó? Abre ziondesk.com/login, elige «¿Olvidaste tu contraseña?» e introduce {email}. Si no esperabas este correo, puedes ignorarlo.',
    },
  },
  fr: {
    memberWelcome: {
      subject: 'Bienvenue à {church}, {name} !',
      eyebrow: '{church}',
      title: 'Bienvenue dans la famille, {name} !',
      body: ['{ellen}', 'Pour toute question ou demande de prière, il suffit de répondre à cet e-mail.', 'Avec affection,<br><b>Ellen</b>, au nom de {church}'],
      note: 'Vous recevez cet e-mail car {church} vous a ajouté à ses membres sur ZionDesk.',
    },
    teamWelcome: {
      subject: 'Bienvenue dans l’équipe de {church} sur ZionDesk',
      eyebrow: 'Un mot d’Ellen',
      title: 'Bienvenue, {name} !',
      body: ['{ellen}', '<b>{inviter}</b> vous a ajouté à <b>{church}</b> en tant que <b>{role}</b>. Cliquez sur le bouton pour créer votre mot de passe et vous connecter.', 'La prochaine fois, connectez-vous sur <b>ziondesk.com/login</b> avec <b>{email}</b>.', 'À tout de suite,<br><b>Ellen</b> · votre assistante ZionDesk'],
      cta: 'Créer mon mot de passe',
      note: 'Lien expiré ? Ouvrez ziondesk.com/login, choisissez « Mot de passe oublié » et saisissez {email}. Si vous n’attendiez pas cet e-mail, ignorez-le.',
    },
  },
  de: {
    memberWelcome: {
      subject: 'Willkommen bei {church}, {name}!',
      eyebrow: '{church}',
      title: 'Willkommen in der Familie, {name}!',
      body: ['{ellen}', 'Wenn du eine Frage oder ein Gebetsanliegen hast, antworte einfach auf diese E-Mail.', 'Herzlich,<br><b>Ellen</b>, im Namen von {church}'],
      note: 'Du erhältst diese E-Mail, weil {church} dich auf ZionDesk zu den Mitgliedern hinzugefügt hat.',
    },
    teamWelcome: {
      subject: 'Willkommen im Team von {church} auf ZionDesk',
      eyebrow: 'Ein Gruß von Ellen',
      title: 'Willkommen an Bord, {name}!',
      body: ['{ellen}', '<b>{inviter}</b> hat dich als <b>{role}</b> zu <b>{church}</b> hinzugefügt. Klicke auf den Button, um dein Passwort zu erstellen und dich anzumelden.', 'Beim nächsten Mal meldest du dich auf <b>ziondesk.com/login</b> mit <b>{email}</b> an.', 'Bis gleich,<br><b>Ellen</b> · deine ZionDesk-Assistentin'],
      cta: 'Mein Passwort erstellen',
      note: 'Link abgelaufen? Öffne ziondesk.com/login, wähle „Passwort vergessen“ und gib {email} ein. Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.',
    },
  },
  pt: {
    memberWelcome: {
      subject: 'Bem-vindo a {church}, {name}!',
      eyebrow: '{church}',
      title: 'Bem-vindo à família, {name}!',
      body: ['{ellen}', 'Se tiver alguma pergunta ou pedido de oração, é só responder a este e-mail.', 'Com carinho,<br><b>Ellen</b>, em nome de {church}'],
      note: 'Você recebe este e-mail porque {church} adicionou você aos membros no ZionDesk.',
    },
    teamWelcome: {
      subject: 'Bem-vindo à equipe de {church} no ZionDesk',
      eyebrow: 'Uma mensagem da Ellen',
      title: 'Bem-vindo, {name}!',
      body: ['{ellen}', '<b>{inviter}</b> adicionou você a <b>{church}</b> como <b>{role}</b>. Clique no botão para criar sua senha e entrar.', 'Da próxima vez, entre em <b>ziondesk.com/login</b> com <b>{email}</b>.', 'Até já,<br><b>Ellen</b> · sua assistente do ZionDesk'],
      cta: 'Criar minha senha',
      note: 'O link expirou? Abra ziondesk.com/login, escolha “Esqueci a senha” e digite {email}. Se não esperava este e-mail, pode ignorá-lo.',
    },
  },
}
