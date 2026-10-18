/**
 * Connected churches (Settings → Connected churches): an invitation to connect two church accounts, and the notices
 * when a connection is made or ended.
 * Vars: {name} {inviter} {church} (the church inviting / the other church) {other} (the reader's church, if known)
 */
import type { EmailCopy } from './catalog'
import type { EmailLang } from './strings'

export type ConnectionKind = 'churchInviteSub' | 'churchInviteHead' | 'churchConnected' | 'churchDisconnected'

export const CONNECTION_EMAILS: Record<EmailLang, Record<ConnectionKind, EmailCopy>> = {
  en: {
    churchInviteSub: {
      subject: '{church} invited your church to connect on ZionDesk',
      eyebrow: 'Connected churches',
      title: 'Join {church} as a sub church',
      body: ['Hi {name},', '<b>{inviter}</b> from <b>{church}</b> invited your church to connect on ZionDesk, with {church} as the head church.', 'Once you accept, both churches see each other’s details, upcoming events and summary numbers (never member records or giving). Either church can disconnect at any time.'],
      cta: 'Review and accept',
      note: 'You need to be an admin of your church on ZionDesk to accept. The invitation expires in 7 days.',
    },
    churchInviteHead: {
      subject: '{church} would like your church as its head church',
      eyebrow: 'Connected churches',
      title: 'Become the head church of {church}',
      body: ['Hi {name},', '<b>{inviter}</b> from <b>{church}</b> invited your church to connect on ZionDesk, with your church as the head church and {church} under it.', 'Once you accept, both churches see each other’s details, upcoming events and summary numbers (never member records or giving). Either church can disconnect at any time.'],
      cta: 'Review and accept',
      note: 'You need to be an admin of your church on ZionDesk to accept. The invitation expires in 7 days.',
    },
    churchConnected: {
      subject: '{church} is now connected to your church',
      eyebrow: 'Connected churches',
      title: 'You’re connected with {church}',
      body: ['Hi {name},', '<b>{church}</b> accepted and is now connected to your church on ZionDesk.', 'You can see their details, upcoming events and summary numbers in Settings → Connected churches.'],
      cta: 'Open Connected churches',
    },
    churchDisconnected: {
      subject: '{church} disconnected from your church',
      eyebrow: 'Connected churches',
      title: '{church} is no longer connected',
      body: ['Hi {name},', '<b>{church}</b> ended its connection with your church on ZionDesk. Nothing else changed in your account.', 'You can connect again any time with a new invitation or link code.'],
      cta: 'Open Connected churches',
    },
  },
  es: {
    churchInviteSub: {
      subject: '{church} invitó a tu iglesia a conectarse en ZionDesk',
      eyebrow: 'Iglesias conectadas',
      title: 'Únete a {church} como iglesia filial',
      body: ['Hola {name},', '<b>{inviter}</b>, de <b>{church}</b>, invitó a tu iglesia a conectarse en ZionDesk, con {church} como iglesia principal.', 'Al aceptar, ambas iglesias verán los datos, próximos eventos y cifras generales de la otra (nunca fichas de miembros ni ofrendas). Cualquiera de las dos puede desconectarse cuando quiera.'],
      cta: 'Revisar y aceptar',
      note: 'Debes ser administrador de tu iglesia en ZionDesk para aceptar. La invitación caduca en 7 días.',
    },
    churchInviteHead: {
      subject: '{church} quiere que tu iglesia sea su iglesia principal',
      eyebrow: 'Iglesias conectadas',
      title: 'Sé la iglesia principal de {church}',
      body: ['Hola {name},', '<b>{inviter}</b>, de <b>{church}</b>, invitó a tu iglesia a conectarse en ZionDesk, con tu iglesia como principal y {church} como filial.', 'Al aceptar, ambas iglesias verán los datos, próximos eventos y cifras generales de la otra (nunca fichas de miembros ni ofrendas). Cualquiera de las dos puede desconectarse cuando quiera.'],
      cta: 'Revisar y aceptar',
      note: 'Debes ser administrador de tu iglesia en ZionDesk para aceptar. La invitación caduca en 7 días.',
    },
    churchConnected: {
      subject: '{church} ya está conectada con tu iglesia',
      eyebrow: 'Iglesias conectadas',
      title: 'Ya estás conectado con {church}',
      body: ['Hola {name},', '<b>{church}</b> aceptó y ya está conectada con tu iglesia en ZionDesk.', 'Puedes ver sus datos, próximos eventos y cifras generales en Configuración → Iglesias conectadas.'],
      cta: 'Abrir Iglesias conectadas',
    },
    churchDisconnected: {
      subject: '{church} se desconectó de tu iglesia',
      eyebrow: 'Iglesias conectadas',
      title: '{church} ya no está conectada',
      body: ['Hola {name},', '<b>{church}</b> terminó su conexión con tu iglesia en ZionDesk. Nada más cambió en tu cuenta.', 'Puedes volver a conectaros cuando quieras con una nueva invitación o código.'],
      cta: 'Abrir Iglesias conectadas',
    },
  },
  fr: {
    churchInviteSub: {
      subject: '{church} invite votre église à se connecter sur ZionDesk',
      eyebrow: 'Églises connectées',
      title: 'Rejoignez {church} comme église annexe',
      body: ['Bonjour {name},', '<b>{inviter}</b>, de <b>{church}</b>, invite votre église à se connecter sur ZionDesk, avec {church} comme église principale.', 'Une fois accepté, chaque église voit les coordonnées, les événements à venir et les chiffres clés de l’autre (jamais les fiches des membres ni les dons). Chacune peut se déconnecter à tout moment.'],
      cta: 'Voir et accepter',
      note: 'Vous devez être administrateur de votre église sur ZionDesk pour accepter. L’invitation expire dans 7 jours.',
    },
    churchInviteHead: {
      subject: '{church} souhaite que votre église soit son église principale',
      eyebrow: 'Églises connectées',
      title: 'Devenez l’église principale de {church}',
      body: ['Bonjour {name},', '<b>{inviter}</b>, de <b>{church}</b>, invite votre église à se connecter sur ZionDesk, avec votre église comme principale et {church} comme annexe.', 'Une fois accepté, chaque église voit les coordonnées, les événements à venir et les chiffres clés de l’autre (jamais les fiches des membres ni les dons). Chacune peut se déconnecter à tout moment.'],
      cta: 'Voir et accepter',
      note: 'Vous devez être administrateur de votre église sur ZionDesk pour accepter. L’invitation expire dans 7 jours.',
    },
    churchConnected: {
      subject: '{church} est maintenant connectée à votre église',
      eyebrow: 'Églises connectées',
      title: 'Vous êtes connecté à {church}',
      body: ['Bonjour {name},', '<b>{church}</b> a accepté et est maintenant connectée à votre église sur ZionDesk.', 'Retrouvez ses coordonnées, ses événements à venir et ses chiffres clés dans Paramètres → Églises connectées.'],
      cta: 'Ouvrir Églises connectées',
    },
    churchDisconnected: {
      subject: '{church} s’est déconnectée de votre église',
      eyebrow: 'Églises connectées',
      title: '{church} n’est plus connectée',
      body: ['Bonjour {name},', '<b>{church}</b> a mis fin à sa connexion avec votre église sur ZionDesk. Rien d’autre n’a changé dans votre compte.', 'Vous pouvez vous reconnecter à tout moment avec une nouvelle invitation ou un nouveau code.'],
      cta: 'Ouvrir Églises connectées',
    },
  },
  de: {
    churchInviteSub: {
      subject: '{church} hat Ihre Gemeinde eingeladen, sich auf ZionDesk zu verbinden',
      eyebrow: 'Verbundene Gemeinden',
      title: 'Treten Sie {church} als Tochtergemeinde bei',
      body: ['Hallo {name},', '<b>{inviter}</b> von <b>{church}</b> hat Ihre Gemeinde eingeladen, sich auf ZionDesk zu verbinden – mit {church} als Hauptgemeinde.', 'Nach der Annahme sehen beide Gemeinden die Kontaktdaten, kommenden Termine und Kennzahlen der anderen (niemals Mitgliederdaten oder Spenden). Beide können die Verbindung jederzeit trennen.'],
      cta: 'Ansehen und annehmen',
      note: 'Zum Annehmen müssen Sie Admin Ihrer Gemeinde auf ZionDesk sein. Die Einladung läuft in 7 Tagen ab.',
    },
    churchInviteHead: {
      subject: '{church} möchte Ihre Gemeinde als Hauptgemeinde',
      eyebrow: 'Verbundene Gemeinden',
      title: 'Werden Sie Hauptgemeinde von {church}',
      body: ['Hallo {name},', '<b>{inviter}</b> von <b>{church}</b> hat Ihre Gemeinde eingeladen, sich auf ZionDesk zu verbinden – mit Ihrer Gemeinde als Hauptgemeinde und {church} darunter.', 'Nach der Annahme sehen beide Gemeinden die Kontaktdaten, kommenden Termine und Kennzahlen der anderen (niemals Mitgliederdaten oder Spenden). Beide können die Verbindung jederzeit trennen.'],
      cta: 'Ansehen und annehmen',
      note: 'Zum Annehmen müssen Sie Admin Ihrer Gemeinde auf ZionDesk sein. Die Einladung läuft in 7 Tagen ab.',
    },
    churchConnected: {
      subject: '{church} ist jetzt mit Ihrer Gemeinde verbunden',
      eyebrow: 'Verbundene Gemeinden',
      title: 'Sie sind mit {church} verbunden',
      body: ['Hallo {name},', '<b>{church}</b> hat angenommen und ist jetzt auf ZionDesk mit Ihrer Gemeinde verbunden.', 'Kontaktdaten, kommende Termine und Kennzahlen finden Sie unter Einstellungen → Verbundene Gemeinden.'],
      cta: 'Verbundene Gemeinden öffnen',
    },
    churchDisconnected: {
      subject: '{church} hat die Verbindung zu Ihrer Gemeinde getrennt',
      eyebrow: 'Verbundene Gemeinden',
      title: '{church} ist nicht mehr verbunden',
      body: ['Hallo {name},', '<b>{church}</b> hat die Verbindung zu Ihrer Gemeinde auf ZionDesk beendet. Sonst hat sich in Ihrem Konto nichts geändert.', 'Mit einer neuen Einladung oder einem neuen Code können Sie sich jederzeit wieder verbinden.'],
      cta: 'Verbundene Gemeinden öffnen',
    },
  },
  pt: {
    churchInviteSub: {
      subject: '{church} convidou sua igreja para se conectar no ZionDesk',
      eyebrow: 'Igrejas conectadas',
      title: 'Junte-se a {church} como igreja filial',
      body: ['Olá {name},', '<b>{inviter}</b>, de <b>{church}</b>, convidou sua igreja para se conectar no ZionDesk, com {church} como igreja sede.', 'Depois de aceitar, as duas igrejas veem os dados, próximos eventos e números gerais uma da outra (nunca fichas de membros nem ofertas). Qualquer uma pode se desconectar quando quiser.'],
      cta: 'Ver e aceitar',
      note: 'Você precisa ser administrador da sua igreja no ZionDesk para aceitar. O convite expira em 7 dias.',
    },
    churchInviteHead: {
      subject: '{church} quer sua igreja como igreja sede',
      eyebrow: 'Igrejas conectadas',
      title: 'Seja a igreja sede de {church}',
      body: ['Olá {name},', '<b>{inviter}</b>, de <b>{church}</b>, convidou sua igreja para se conectar no ZionDesk, com sua igreja como sede e {church} como filial.', 'Depois de aceitar, as duas igrejas veem os dados, próximos eventos e números gerais uma da outra (nunca fichas de membros nem ofertas). Qualquer uma pode se desconectar quando quiser.'],
      cta: 'Ver e aceitar',
      note: 'Você precisa ser administrador da sua igreja no ZionDesk para aceitar. O convite expira em 7 dias.',
    },
    churchConnected: {
      subject: '{church} agora está conectada à sua igreja',
      eyebrow: 'Igrejas conectadas',
      title: 'Vocês estão conectados com {church}',
      body: ['Olá {name},', '<b>{church}</b> aceitou e agora está conectada à sua igreja no ZionDesk.', 'Veja os dados, próximos eventos e números gerais em Configurações → Igrejas conectadas.'],
      cta: 'Abrir Igrejas conectadas',
    },
    churchDisconnected: {
      subject: '{church} se desconectou da sua igreja',
      eyebrow: 'Igrejas conectadas',
      title: '{church} não está mais conectada',
      body: ['Olá {name},', '<b>{church}</b> encerrou a conexão com sua igreja no ZionDesk. Nada mais mudou na sua conta.', 'Vocês podem se conectar de novo quando quiserem com um novo convite ou código.'],
      cta: 'Abrir Igrejas conectadas',
    },
  },
}
