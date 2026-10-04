/**
 * Every ZionDesk email, in every supported language. Rendered by `renderEmail()` with one
 * shared, email-client-safe layout. Plain data so the API server can import it.
 *
 * Placeholders: {church}, {name}, {days}, {amount}, {fund}, {event}, {date}, {time}, {link},
 * {role}, {inviter}, {reference}, {text}. HTML is allowed only where noted (body fields).
 */
import type { EmailLang } from './strings'

export type EmailKind =
  | 'confirmSignup'
  | 'resetPassword'
  | 'magicLink'
  | 'emailChange'
  | 'teamInvite'
  | 'registered'
  | 'claimReceived'
  | 'claimAlert'
  | 'giftReceipt'
  | 'birthday'
  | 'eventReminder'
  | 'meetingInvite'
  | 'message'

export interface EmailCopy {
  subject: string
  eyebrow: string
  title: string
  /** Paragraphs; may contain <b>. */
  body: string[]
  cta?: string
  note?: string
}

type Catalog = Record<EmailKind, EmailCopy>

const en: Catalog = {
  confirmSignup: {
    subject: 'Confirm your ZionDesk email',
    eyebrow: 'One last step',
    title: 'Confirm your email address',
    body: ['Hi {name},', 'Tap the button below to confirm your email and open your church workspace.'],
    cta: 'Confirm my email',
    note: 'If you didn’t create a ZionDesk account, you can ignore this email.',
  },
  resetPassword: {
    subject: 'Reset your ZionDesk password',
    eyebrow: 'Security',
    title: 'Reset your password',
    body: ['Hi {name},', 'We received a request to reset your password. The link below works for 1 hour.'],
    cta: 'Choose a new password',
    note: 'Didn’t ask for this? Your password stays the same — you can ignore this email.',
  },
  magicLink: {
    subject: 'Your ZionDesk sign-in link',
    eyebrow: 'Sign in',
    title: 'Here’s your sign-in link',
    body: ['Hi {name},', 'Tap the button to sign in. The link works once and expires in 1 hour.'],
    cta: 'Sign in to ZionDesk',
    note: 'If you didn’t try to sign in, you can ignore this email.',
  },
  emailChange: {
    subject: 'Confirm your new email address',
    eyebrow: 'Security',
    title: 'Confirm your new email',
    body: ['Hi {name},', 'Confirm that you want to use this address for your ZionDesk account.'],
    cta: 'Confirm new email',
    note: 'If you didn’t request this change, please contact your church administrator.',
  },
  teamInvite: {
    subject: '{inviter} invited you to {church} on ZionDesk',
    eyebrow: 'You’re invited',
    title: 'Join {church} on ZionDesk',
    body: ['Hi {name},', '<b>{inviter}</b> invited you to help manage <b>{church}</b> as <b>{role}</b>.', 'Accept the invitation to create your account and get started.'],
    cta: 'Accept invitation',
    note: 'This invitation was meant for you. If you weren’t expecting it, you can ignore this email.',
  },
  registered: {
    subject: 'Welcome to {church}!',
    eyebrow: '{church}',
    title: 'Thank you for registering, {name}!',
    body: ['We’ve received your details. Someone from {church} will be in touch soon.', 'You can reply to this email anytime with questions or prayer needs.'],
    note: 'You’re receiving this because you registered with {church}.',
  },
  claimReceived: {
    subject: 'We received your gift notice — {church}',
    eyebrow: 'Thank you',
    title: 'Thank you for your generosity, {name}',
    body: ['We’ve let {church} know about your transfer of <b>{amount}</b> to the <b>{fund}</b> fund (reference {reference}).', 'They’ll confirm it once it reaches their account, and you’ll receive a receipt.'],
  },
  claimAlert: {
    subject: 'New bank transfer to confirm: {amount} from {name}',
    eyebrow: 'Giving',
    title: 'A giver sent a bank transfer',
    body: ['<b>{name}</b> says they sent <b>{amount}</b> to the <b>{fund}</b> fund (reference {reference}).', 'Check your bank statement, then confirm or decline it in Links & QR codes → Bank transfers.'],
    cta: 'Review transfer',
  },
  giftReceipt: {
    subject: 'Your gift receipt — {church}',
    eyebrow: 'Receipt',
    title: 'Thank you, {name}!',
    body: ['{church} has received your gift of <b>{amount}</b> to the <b>{fund}</b> fund on {date}.', 'Your generosity makes ministry possible. 🙏'],
  },
  birthday: {
    subject: 'Happy birthday, {name}! 🎉',
    eyebrow: '{church}',
    title: 'Happy birthday, {name}!',
    body: ['Everyone at {church} is celebrating you today.', 'May God bless you abundantly in your new year. 🎉'],
  },
  eventReminder: {
    subject: 'Reminder: {event} — {date}',
    eyebrow: '{church}',
    title: '{event}',
    body: ['Hi {name},', 'A friendly reminder: <b>{event}</b> is on <b>{date}</b> at <b>{time}</b>.', 'We look forward to seeing you!'],
  },
  meetingInvite: {
    subject: 'You’re invited: {event} — {date}',
    eyebrow: '{church}',
    title: 'You’re invited to {event}',
    body: ['Hi {name},', '<b>{event}</b> takes place on <b>{date}</b> at <b>{time}</b>.', 'Join online with the button below.'],
    cta: 'Join the meeting',
  },
  message: {
    subject: '{subject}',
    eyebrow: '{church}',
    title: '{subject}',
    body: ['{text}'],
    note: 'You’re receiving this because you’re part of {church}.',
  },
}

const es: Catalog = {
  confirmSignup: { subject: 'Confirma tu correo de ZionDesk', eyebrow: 'Un último paso', title: 'Confirma tu correo electrónico', body: ['Hola, {name}:', 'Pulsa el botón para confirmar tu correo y abrir el espacio de tu iglesia.'], cta: 'Confirmar mi correo', note: 'Si no creaste una cuenta en ZionDesk, puedes ignorar este correo.' },
  resetPassword: { subject: 'Restablece tu contraseña de ZionDesk', eyebrow: 'Seguridad', title: 'Restablece tu contraseña', body: ['Hola, {name}:', 'Recibimos una solicitud para restablecer tu contraseña. El enlace funciona durante 1 hora.'], cta: 'Elegir nueva contraseña', note: '¿No lo pediste? Tu contraseña no cambia; puedes ignorar este correo.' },
  magicLink: { subject: 'Tu enlace de acceso a ZionDesk', eyebrow: 'Iniciar sesión', title: 'Aquí tienes tu enlace de acceso', body: ['Hola, {name}:', 'Pulsa el botón para iniciar sesión. El enlace funciona una vez y caduca en 1 hora.'], cta: 'Entrar en ZionDesk', note: 'Si no intentaste iniciar sesión, puedes ignorar este correo.' },
  emailChange: { subject: 'Confirma tu nuevo correo', eyebrow: 'Seguridad', title: 'Confirma tu nuevo correo', body: ['Hola, {name}:', 'Confirma que quieres usar esta dirección en tu cuenta de ZionDesk.'], cta: 'Confirmar nuevo correo', note: 'Si no pediste este cambio, contacta con el administrador de tu iglesia.' },
  teamInvite: { subject: '{inviter} te invitó a {church} en ZionDesk', eyebrow: 'Estás invitado', title: 'Únete a {church} en ZionDesk', body: ['Hola, {name}:', '<b>{inviter}</b> te invitó a ayudar a gestionar <b>{church}</b> como <b>{role}</b>.', 'Acepta la invitación para crear tu cuenta y empezar.'], cta: 'Aceptar invitación', note: 'Esta invitación es para ti. Si no la esperabas, puedes ignorar este correo.' },
  registered: { subject: '¡Bienvenido a {church}!', eyebrow: '{church}', title: '¡Gracias por registrarte, {name}!', body: ['Hemos recibido tus datos. Alguien de {church} se pondrá en contacto contigo pronto.', 'Puedes responder a este correo cuando quieras con preguntas o peticiones de oración.'], note: 'Recibes este correo porque te registraste en {church}.' },
  claimReceived: { subject: 'Recibimos tu aviso de ofrenda — {church}', eyebrow: 'Gracias', title: 'Gracias por tu generosidad, {name}', body: ['Hemos avisado a {church} de tu transferencia de <b>{amount}</b> al fondo <b>{fund}</b> (concepto {reference}).', 'La confirmarán cuando llegue a su cuenta y recibirás un recibo.'] },
  claimAlert: { subject: 'Nueva transferencia por confirmar: {amount} de {name}', eyebrow: 'Ofrendas', title: 'Un donante envió una transferencia', body: ['<b>{name}</b> dice que envió <b>{amount}</b> al fondo <b>{fund}</b> (concepto {reference}).', 'Revisa tu extracto y confírmala o recházala en Enlaces y códigos QR → Transferencias.'], cta: 'Revisar transferencia' },
  giftReceipt: { subject: 'Tu recibo de ofrenda — {church}', eyebrow: 'Recibo', title: '¡Gracias, {name}!', body: ['{church} ha recibido tu ofrenda de <b>{amount}</b> al fondo <b>{fund}</b> el {date}.', 'Tu generosidad hace posible el ministerio. 🙏'] },
  birthday: { subject: '¡Feliz cumpleaños, {name}! 🎉', eyebrow: '{church}', title: '¡Feliz cumpleaños, {name}!', body: ['Todos en {church} celebramos contigo hoy.', 'Que Dios te bendiga abundantemente en tu nuevo año. 🎉'] },
  eventReminder: { subject: 'Recordatorio: {event} — {date}', eyebrow: '{church}', title: '{event}', body: ['Hola, {name}:', 'Te recordamos que <b>{event}</b> es el <b>{date}</b> a las <b>{time}</b>.', '¡Te esperamos!'] },
  meetingInvite: { subject: 'Estás invitado: {event} — {date}', eyebrow: '{church}', title: 'Estás invitado a {event}', body: ['Hola, {name}:', '<b>{event}</b> será el <b>{date}</b> a las <b>{time}</b>.', 'Únete en línea con el botón de abajo.'], cta: 'Unirme a la reunión' },
  message: { subject: '{subject}', eyebrow: '{church}', title: '{subject}', body: ['{text}'], note: 'Recibes este correo porque formas parte de {church}.' },
}

const fr: Catalog = {
  confirmSignup: { subject: 'Confirmez votre e-mail ZionDesk', eyebrow: 'Dernière étape', title: 'Confirmez votre adresse e-mail', body: ['Bonjour {name},', 'Appuyez sur le bouton pour confirmer votre e-mail et ouvrir l’espace de votre église.'], cta: 'Confirmer mon e-mail', note: 'Si vous n’avez pas créé de compte ZionDesk, ignorez cet e-mail.' },
  resetPassword: { subject: 'Réinitialisez votre mot de passe ZionDesk', eyebrow: 'Sécurité', title: 'Réinitialisez votre mot de passe', body: ['Bonjour {name},', 'Nous avons reçu une demande de réinitialisation. Le lien est valable 1 heure.'], cta: 'Choisir un nouveau mot de passe', note: 'Vous n’avez rien demandé ? Votre mot de passe reste inchangé ; ignorez cet e-mail.' },
  magicLink: { subject: 'Votre lien de connexion ZionDesk', eyebrow: 'Connexion', title: 'Voici votre lien de connexion', body: ['Bonjour {name},', 'Appuyez sur le bouton pour vous connecter. Le lien est à usage unique et expire dans 1 heure.'], cta: 'Se connecter à ZionDesk', note: 'Si vous n’avez pas essayé de vous connecter, ignorez cet e-mail.' },
  emailChange: { subject: 'Confirmez votre nouvelle adresse e-mail', eyebrow: 'Sécurité', title: 'Confirmez votre nouvel e-mail', body: ['Bonjour {name},', 'Confirmez que vous souhaitez utiliser cette adresse pour votre compte ZionDesk.'], cta: 'Confirmer le nouvel e-mail', note: 'Si vous n’avez pas demandé ce changement, contactez l’administrateur de votre église.' },
  teamInvite: { subject: '{inviter} vous invite à rejoindre {church} sur ZionDesk', eyebrow: 'Invitation', title: 'Rejoignez {church} sur ZionDesk', body: ['Bonjour {name},', '<b>{inviter}</b> vous invite à aider à gérer <b>{church}</b> en tant que <b>{role}</b>.', 'Acceptez l’invitation pour créer votre compte et commencer.'], cta: 'Accepter l’invitation', note: 'Cette invitation vous est destinée. Si vous ne l’attendiez pas, ignorez cet e-mail.' },
  registered: { subject: 'Bienvenue à {church} !', eyebrow: '{church}', title: 'Merci pour votre inscription, {name} !', body: ['Nous avons bien reçu vos informations. Quelqu’un de {church} vous contactera bientôt.', 'Vous pouvez répondre à cet e-mail à tout moment pour vos questions ou sujets de prière.'], note: 'Vous recevez cet e-mail car vous vous êtes inscrit auprès de {church}.' },
  claimReceived: { subject: 'Nous avons reçu votre avis de don — {church}', eyebrow: 'Merci', title: 'Merci pour votre générosité, {name}', body: ['Nous avons informé {church} de votre virement de <b>{amount}</b> pour le fonds <b>{fund}</b> (référence {reference}).', 'Il sera confirmé dès réception, et vous recevrez un reçu.'] },
  claimAlert: { subject: 'Nouveau virement à confirmer : {amount} de {name}', eyebrow: 'Dons', title: 'Un donateur a envoyé un virement', body: ['<b>{name}</b> indique avoir envoyé <b>{amount}</b> pour le fonds <b>{fund}</b> (référence {reference}).', 'Vérifiez votre relevé, puis confirmez ou refusez dans Liens et QR codes → Virements.'], cta: 'Vérifier le virement' },
  giftReceipt: { subject: 'Votre reçu de don — {church}', eyebrow: 'Reçu', title: 'Merci, {name} !', body: ['{church} a bien reçu votre don de <b>{amount}</b> pour le fonds <b>{fund}</b> le {date}.', 'Votre générosité rend le ministère possible. 🙏'] },
  birthday: { subject: 'Joyeux anniversaire, {name} ! 🎉', eyebrow: '{church}', title: 'Joyeux anniversaire, {name} !', body: ['Toute l’église {church} vous fête aujourd’hui.', 'Que Dieu vous bénisse abondamment pour cette nouvelle année. 🎉'] },
  eventReminder: { subject: 'Rappel : {event} — {date}', eyebrow: '{church}', title: '{event}', body: ['Bonjour {name},', 'Petit rappel : <b>{event}</b> a lieu le <b>{date}</b> à <b>{time}</b>.', 'Au plaisir de vous voir !'] },
  meetingInvite: { subject: 'Invitation : {event} — {date}', eyebrow: '{church}', title: 'Vous êtes invité à {event}', body: ['Bonjour {name},', '<b>{event}</b> a lieu le <b>{date}</b> à <b>{time}</b>.', 'Rejoignez-nous en ligne avec le bouton ci-dessous.'], cta: 'Rejoindre la réunion' },
  message: { subject: '{subject}', eyebrow: '{church}', title: '{subject}', body: ['{text}'], note: 'Vous recevez cet e-mail car vous faites partie de {church}.' },
}

const de: Catalog = {
  confirmSignup: { subject: 'Bestätige deine ZionDesk-E-Mail', eyebrow: 'Ein letzter Schritt', title: 'Bestätige deine E-Mail-Adresse', body: ['Hallo {name},', 'Tippe auf den Button, um deine E-Mail zu bestätigen und den Arbeitsbereich deiner Gemeinde zu öffnen.'], cta: 'E-Mail bestätigen', note: 'Wenn du kein ZionDesk-Konto erstellt hast, kannst du diese E-Mail ignorieren.' },
  resetPassword: { subject: 'Setze dein ZionDesk-Passwort zurück', eyebrow: 'Sicherheit', title: 'Passwort zurücksetzen', body: ['Hallo {name},', 'Wir haben eine Anfrage zum Zurücksetzen deines Passworts erhalten. Der Link ist 1 Stunde gültig.'], cta: 'Neues Passwort wählen', note: 'Nicht angefordert? Dein Passwort bleibt gleich – ignoriere diese E-Mail.' },
  magicLink: { subject: 'Dein ZionDesk-Anmeldelink', eyebrow: 'Anmelden', title: 'Hier ist dein Anmeldelink', body: ['Hallo {name},', 'Tippe auf den Button, um dich anzumelden. Der Link funktioniert einmal und läuft nach 1 Stunde ab.'], cta: 'Bei ZionDesk anmelden', note: 'Wenn du dich nicht anmelden wolltest, ignoriere diese E-Mail.' },
  emailChange: { subject: 'Bestätige deine neue E-Mail-Adresse', eyebrow: 'Sicherheit', title: 'Neue E-Mail bestätigen', body: ['Hallo {name},', 'Bestätige, dass du diese Adresse für dein ZionDesk-Konto verwenden möchtest.'], cta: 'Neue E-Mail bestätigen', note: 'Wenn du diese Änderung nicht angefordert hast, wende dich an deine Gemeindeverwaltung.' },
  teamInvite: { subject: '{inviter} hat dich zu {church} auf ZionDesk eingeladen', eyebrow: 'Einladung', title: 'Werde Teil von {church} auf ZionDesk', body: ['Hallo {name},', '<b>{inviter}</b> hat dich eingeladen, <b>{church}</b> als <b>{role}</b> mitzuverwalten.', 'Nimm die Einladung an, um dein Konto zu erstellen.'], cta: 'Einladung annehmen', note: 'Diese Einladung ist für dich bestimmt. Wenn du sie nicht erwartet hast, ignoriere diese E-Mail.' },
  registered: { subject: 'Willkommen bei {church}!', eyebrow: '{church}', title: 'Danke für deine Anmeldung, {name}!', body: ['Wir haben deine Daten erhalten. Jemand von {church} meldet sich bald bei dir.', 'Du kannst jederzeit auf diese E-Mail antworten – mit Fragen oder Gebetsanliegen.'], note: 'Du erhältst diese E-Mail, weil du dich bei {church} angemeldet hast.' },
  claimReceived: { subject: 'Deine Spendenmeldung ist angekommen — {church}', eyebrow: 'Danke', title: 'Danke für deine Großzügigkeit, {name}', body: ['Wir haben {church} über deine Überweisung von <b>{amount}</b> an den Fonds <b>{fund}</b> informiert (Verwendungszweck {reference}).', 'Sie wird bestätigt, sobald sie eingeht, und du erhältst eine Quittung.'] },
  claimAlert: { subject: 'Neue Überweisung zu bestätigen: {amount} von {name}', eyebrow: 'Spenden', title: 'Ein Spender hat überwiesen', body: ['<b>{name}</b> hat nach eigener Angabe <b>{amount}</b> an den Fonds <b>{fund}</b> überwiesen (Verwendungszweck {reference}).', 'Prüfe deinen Kontoauszug und bestätige oder lehne sie unter Links & QR-Codes → Überweisungen ab.'], cta: 'Überweisung prüfen' },
  giftReceipt: { subject: 'Deine Spendenquittung — {church}', eyebrow: 'Quittung', title: 'Danke, {name}!', body: ['{church} hat deine Spende von <b>{amount}</b> an den Fonds <b>{fund}</b> am {date} erhalten.', 'Deine Großzügigkeit macht unsere Arbeit möglich. 🙏'] },
  birthday: { subject: 'Alles Gute zum Geburtstag, {name}! 🎉', eyebrow: '{church}', title: 'Alles Gute zum Geburtstag, {name}!', body: ['Ganz {church} feiert heute mit dir.', 'Gottes reichen Segen für dein neues Lebensjahr. 🎉'] },
  eventReminder: { subject: 'Erinnerung: {event} — {date}', eyebrow: '{church}', title: '{event}', body: ['Hallo {name},', 'Eine kurze Erinnerung: <b>{event}</b> ist am <b>{date}</b> um <b>{time}</b>.', 'Wir freuen uns auf dich!'] },
  meetingInvite: { subject: 'Einladung: {event} — {date}', eyebrow: '{church}', title: 'Du bist zu {event} eingeladen', body: ['Hallo {name},', '<b>{event}</b> findet am <b>{date}</b> um <b>{time}</b> statt.', 'Nimm online über den Button unten teil.'], cta: 'Am Meeting teilnehmen' },
  message: { subject: '{subject}', eyebrow: '{church}', title: '{subject}', body: ['{text}'], note: 'Du erhältst diese E-Mail, weil du zu {church} gehörst.' },
}

const pt: Catalog = {
  confirmSignup: { subject: 'Confirme o seu e-mail do ZionDesk', eyebrow: 'Último passo', title: 'Confirme o seu endereço de e-mail', body: ['Olá {name},', 'Toque no botão para confirmar o seu e-mail e abrir o espaço da sua igreja.'], cta: 'Confirmar o meu e-mail', note: 'Se não criou uma conta no ZionDesk, pode ignorar este e-mail.' },
  resetPassword: { subject: 'Redefina a sua palavra-passe do ZionDesk', eyebrow: 'Segurança', title: 'Redefina a sua palavra-passe', body: ['Olá {name},', 'Recebemos um pedido para redefinir a sua palavra-passe. O link é válido durante 1 hora.'], cta: 'Escolher nova palavra-passe', note: 'Não pediu isto? A palavra-passe mantém-se; pode ignorar este e-mail.' },
  magicLink: { subject: 'O seu link de acesso ao ZionDesk', eyebrow: 'Entrar', title: 'Aqui está o seu link de acesso', body: ['Olá {name},', 'Toque no botão para entrar. O link funciona uma vez e expira em 1 hora.'], cta: 'Entrar no ZionDesk', note: 'Se não tentou entrar, pode ignorar este e-mail.' },
  emailChange: { subject: 'Confirme o seu novo e-mail', eyebrow: 'Segurança', title: 'Confirme o seu novo e-mail', body: ['Olá {name},', 'Confirme que pretende usar este endereço na sua conta ZionDesk.'], cta: 'Confirmar novo e-mail', note: 'Se não pediu esta alteração, contacte o administrador da sua igreja.' },
  teamInvite: { subject: '{inviter} convidou-o para {church} no ZionDesk', eyebrow: 'Convite', title: 'Junte-se a {church} no ZionDesk', body: ['Olá {name},', '<b>{inviter}</b> convidou-o para ajudar a gerir <b>{church}</b> como <b>{role}</b>.', 'Aceite o convite para criar a sua conta e começar.'], cta: 'Aceitar convite', note: 'Este convite é para si. Se não o esperava, pode ignorar este e-mail.' },
  registered: { subject: 'Bem-vindo a {church}!', eyebrow: '{church}', title: 'Obrigado pelo seu registo, {name}!', body: ['Recebemos os seus dados. Alguém de {church} entrará em contacto em breve.', 'Pode responder a este e-mail a qualquer momento com perguntas ou pedidos de oração.'], note: 'Recebe este e-mail porque se registou em {church}.' },
  claimReceived: { subject: 'Recebemos o seu aviso de oferta — {church}', eyebrow: 'Obrigado', title: 'Obrigado pela sua generosidade, {name}', body: ['Avisámos {church} da sua transferência de <b>{amount}</b> para o fundo <b>{fund}</b> (descritivo {reference}).', 'Será confirmada quando chegar à conta e receberá um recibo.'] },
  claimAlert: { subject: 'Nova transferência a confirmar: {amount} de {name}', eyebrow: 'Ofertas', title: 'Um doador enviou uma transferência', body: ['<b>{name}</b> indica que enviou <b>{amount}</b> para o fundo <b>{fund}</b> (descritivo {reference}).', 'Verifique o extrato e confirme ou recuse em Ligações e códigos QR → Transferências.'], cta: 'Rever transferência' },
  giftReceipt: { subject: 'O seu recibo de oferta — {church}', eyebrow: 'Recibo', title: 'Obrigado, {name}!', body: ['{church} recebeu a sua oferta de <b>{amount}</b> para o fundo <b>{fund}</b> a {date}.', 'A sua generosidade torna o ministério possível. 🙏'] },
  birthday: { subject: 'Feliz aniversário, {name}! 🎉', eyebrow: '{church}', title: 'Feliz aniversário, {name}!', body: ['Toda a {church} celebra consigo hoje.', 'Que Deus o abençoe abundantemente no seu novo ano. 🎉'] },
  eventReminder: { subject: 'Lembrete: {event} — {date}', eyebrow: '{church}', title: '{event}', body: ['Olá {name},', 'Um lembrete: <b>{event}</b> é a <b>{date}</b> às <b>{time}</b>.', 'Esperamos por si!'] },
  meetingInvite: { subject: 'Está convidado: {event} — {date}', eyebrow: '{church}', title: 'Está convidado para {event}', body: ['Olá {name},', '<b>{event}</b> decorre a <b>{date}</b> às <b>{time}</b>.', 'Participe online com o botão abaixo.'], cta: 'Entrar na reunião' },
  message: { subject: '{subject}', eyebrow: '{church}', title: '{subject}', body: ['{text}'], note: 'Recebe este e-mail porque faz parte de {church}.' },
}

export const CATALOG: Record<EmailLang, Catalog> = { en, es, fr, de, pt }
