/**
 * Email copy in every supported language. Plain data (no React) so both the browser
 * preview and the server (Render API → Resend) can import it.
 * Placeholders: {days}, {email}, {church}, {name}… are filled by `fill()`.
 */
export type EmailLang = 'en' | 'es' | 'fr' | 'de' | 'pt'
export const EMAIL_LANGS: EmailLang[] = ['en', 'es', 'fr', 'de', 'pt']
export const asEmailLang = (v: unknown): EmailLang => (EMAIL_LANGS.includes(v as EmailLang) ? (v as EmailLang) : 'en')

export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))

interface Common {
  footer: string
  ignore: string
}
interface Welcome {
  subject: string
  eyebrow: string
  title: string
  hi: string
  body: string
  open: string
  finish: string
  activated: string
  features: string[]
}

export const EMAIL: Record<EmailLang, { common: Common; welcome: Welcome }> = {
  en: {
    common: { footer: '© ZionDesk · Church management made simple', ignore: 'Didn’t request this? You can ignore this email — no account is created until you finish sign-up.' },
    welcome: {
      subject: 'Your {days}-day ZionDesk trial is ready ✨',
      eyebrow: 'Your free trial is live',
      title: 'Welcome to ZionDesk — {days} days, on us.',
      hi: 'Hi there,',
      body: 'We’ve set up a trial workspace for <b>{email}</b> with all <b>Essentials</b> features activated. Explore your dashboard now, then finish creating your account so your church keeps everything when the trial ends.',
      open: 'Open my trial dashboard →',
      finish: 'Finish creating my account',
      activated: 'Activated in your trial',
      features: ['Member database with search, import & export', 'Email & SMS in 5 languages', 'Finance tracking & reports', 'Events with Google Meet invites', 'Ellen, your AI assistant'],
    },
  },
  es: {
    common: { footer: '© ZionDesk · La gestión de tu iglesia, simplificada', ignore: '¿No lo solicitaste? Puedes ignorar este correo: no se crea ninguna cuenta hasta que completes el registro.' },
    welcome: {
      subject: 'Tu prueba de ZionDesk de {days} días está lista ✨',
      eyebrow: 'Tu prueba gratis está activa',
      title: 'Bienvenido a ZionDesk: {days} días por nuestra cuenta.',
      hi: 'Hola:',
      body: 'Hemos creado un espacio de prueba para <b>{email}</b> con todas las funciones <b>Essentials</b> activadas. Explora tu panel ahora y completa tu cuenta para que tu iglesia conserve todo al terminar la prueba.',
      open: 'Abrir mi panel de prueba →',
      finish: 'Completar mi cuenta',
      activated: 'Activado en tu prueba',
      features: ['Base de miembros con búsqueda, importación y exportación', 'Correo y SMS en 5 idiomas', 'Control financiero e informes', 'Eventos con invitaciones de Google Meet', 'Ellen, tu asistente de IA'],
    },
  },
  fr: {
    common: { footer: '© ZionDesk · La gestion d’église, simplement', ignore: 'Vous n’avez rien demandé ? Ignorez cet e-mail : aucun compte n’est créé tant que l’inscription n’est pas finalisée.' },
    welcome: {
      subject: 'Votre essai ZionDesk de {days} jours est prêt ✨',
      eyebrow: 'Votre essai gratuit a commencé',
      title: 'Bienvenue sur ZionDesk — {days} jours offerts.',
      hi: 'Bonjour,',
      body: 'Nous avons préparé un espace d’essai pour <b>{email}</b> avec toutes les fonctions <b>Essentials</b> activées. Découvrez votre tableau de bord, puis finalisez votre compte pour que votre église conserve tout à la fin de l’essai.',
      open: 'Ouvrir mon tableau de bord d’essai →',
      finish: 'Finaliser mon compte',
      activated: 'Activé pendant votre essai',
      features: ['Base de membres avec recherche, import et export', 'E-mails et SMS en 5 langues', 'Suivi financier et rapports', 'Événements avec invitations Google Meet', 'Ellen, votre assistante IA'],
    },
  },
  de: {
    common: { footer: '© ZionDesk · Gemeindeverwaltung leicht gemacht', ignore: 'Nicht angefordert? Ignoriere diese E-Mail – ein Konto entsteht erst, wenn du die Registrierung abschließt.' },
    welcome: {
      subject: 'Deine {days}-tägige ZionDesk-Testphase ist bereit ✨',
      eyebrow: 'Deine kostenlose Testphase läuft',
      title: 'Willkommen bei ZionDesk – {days} Tage geschenkt.',
      hi: 'Hallo,',
      body: 'Wir haben einen Test-Arbeitsbereich für <b>{email}</b> mit allen <b>Essentials</b>-Funktionen eingerichtet. Schau dir dein Dashboard an und schließe dann dein Konto ab, damit deine Gemeinde nach der Testphase alles behält.',
      open: 'Mein Test-Dashboard öffnen →',
      finish: 'Mein Konto abschließen',
      activated: 'In deiner Testphase aktiv',
      features: ['Mitgliederdatenbank mit Suche, Import & Export', 'E-Mail & SMS in 5 Sprachen', 'Finanzen & Berichte', 'Veranstaltungen mit Google-Meet-Einladungen', 'Ellen, deine KI-Assistentin'],
    },
  },
  pt: {
    common: { footer: '© ZionDesk · Gestão da igreja simplificada', ignore: 'Não pediu isto? Pode ignorar este e-mail — nenhuma conta é criada até concluir o registo.' },
    welcome: {
      subject: 'A sua avaliação de {days} dias do ZionDesk está pronta ✨',
      eyebrow: 'A sua avaliação gratuita está ativa',
      title: 'Bem-vindo ao ZionDesk — {days} dias por nossa conta.',
      hi: 'Olá,',
      body: 'Criámos um espaço de avaliação para <b>{email}</b> com todas as funções <b>Essentials</b> ativas. Explore o seu painel e conclua a sua conta para que a igreja mantenha tudo no fim da avaliação.',
      open: 'Abrir o meu painel de avaliação →',
      finish: 'Concluir a minha conta',
      activated: 'Ativo na sua avaliação',
      features: ['Base de membros com pesquisa, importação e exportação', 'E-mail e SMS em 5 idiomas', 'Controlo financeiro e relatórios', 'Eventos com convites do Google Meet', 'Ellen, a sua assistente de IA'],
    },
  },
}
