/**
 * ZionDesk's own emails to church accounts: welcome, subscription, account deletion, newsletter and
 * the weekly "finish your sign-up" series for people who started but didn't create their church.
 */
import type { EmailCopy } from './catalog'
import type { EmailLang } from './strings'

export type LifecycleKind =
  | 'welcomeAccount'
  | 'accountDeleted'
  | 'subscriptionConfirmed'
  | 'paymentReceipt'
  | 'newsletter'
  | 'finishSignup1'
  | 'finishSignup2'
  | 'finishSignup3'
  | 'finishSignup4'

export const LIFECYCLE_KINDS: LifecycleKind[] = ['welcomeAccount', 'subscriptionConfirmed', 'paymentReceipt', 'accountDeleted', 'newsletter', 'finishSignup1', 'finishSignup2', 'finishSignup3', 'finishSignup4']

export const LIFECYCLE: Record<EmailLang, Record<LifecycleKind, EmailCopy>> = {
  en: {
    welcomeAccount: {
      subject: 'Welcome to ZionDesk — {church} is ready 🎉',
      eyebrow: 'Welcome aboard',
      title: 'You’re all set, {name}!',
      body: [
        'Your ZionDesk workspace for <b>{church}</b> is ready, and your <b>{days}-day free trial</b> of {plan} has started. No card needed.',
        '<b>1. Add your people.</b> Import your list, or put your registration QR code on the screen — new members and first-time guests sign themselves up during the service.',
        '<b>2. Set up giving.</b> Share your giving link and every gift is recorded with a receipt, automatically.',
        '<b>3. Say hello.</b> Send your first message by email, SMS or WhatsApp — each person gets it in their own language.',
      ],
      cta: 'Open my dashboard',
      note: 'Questions? Just reply to this email — a real person will help.',
    },
    accountDeleted: {
      subject: 'Your ZionDesk account has been deleted',
      eyebrow: 'Account',
      title: 'Your account is deleted',
      body: [
        'Hi {name},',
        'As you asked, your ZionDesk account and personal data have been permanently deleted. Any active subscription was cancelled, so you won’t be charged again.',
        'We’re sorry to see you go — and grateful you gave us a try. If you ever want to come back, you can start again in two minutes.',
      ],
      cta: 'Start again',
      note: 'Didn’t ask for this? Reply to this email straight away.',
    },
    subscriptionConfirmed: {
      subject: 'You’re subscribed to {plan} 🎉',
      eyebrow: 'Subscription confirmed',
      title: 'Thank you — {church} is on {plan}',
      body: ['Hi {name},', 'Your payment of <b>{amount}</b> was successful and your <b>{plan}</b> plan is now active.', 'Next renewal: <b>{date}</b>. You can change or cancel any time in Settings → Plan.'],
      cta: 'Open my dashboard',
      note: 'Keep this email as your receipt.',
    },
    paymentReceipt: {
      subject: 'Payment received — ZionDesk {plan}',
      eyebrow: 'Receipt',
      title: 'Thanks for another month, {name}',
      body: ['We received <b>{amount}</b> for <b>{church}</b>’s {plan} plan.', 'Your next renewal is on <b>{date}</b>. Manage your plan any time in Settings → Plan.'],
      cta: 'View my plan',
      note: 'Keep this email as your receipt.',
    },
    newsletter: { subject: '{subject}', eyebrow: 'ZionDesk news', title: '{subject}', body: ['{text}'], cta: 'Open ZionDesk', note: 'You’re receiving this because you have a ZionDesk account.' },
    finishSignup1: {
      subject: '{name}, your church workspace is one step away',
      eyebrow: 'Almost there',
      title: 'Finish setting up your church',
      body: ['Hi {name},', 'You started creating your ZionDesk account but didn’t quite finish. It takes about two minutes — tell us your church’s name and you’re in.', 'Your <b>7-day free trial</b> starts the moment you finish. No card needed.'],
      cta: 'Finish my sign-up',
    },
    finishSignup2: {
      subject: 'New members, registered before the sermon ends',
      eyebrow: 'Picture this Sunday',
      title: 'A guest scans. They’re in. You follow up.',
      body: [
        'Hi {name},',
        'Put one QR code on the screen. First-time guests and new converts register on their phones in seconds — and ZionDesk welcomes each of them in their own language.',
        'Your team gets a follow-up list the same day, so nobody slips through the cracks.',
      ],
      cta: 'Set up my church',
    },
    finishSignup3: {
      subject: 'Giving, receipts and reports — without the spreadsheets',
      eyebrow: 'Less admin, more ministry',
      title: 'Let ZionDesk do the paperwork',
      body: [
        'Hi {name},',
        'Online giving with automatic receipts. Every tithe and offering recorded in the right fund. Reports ready for your board in one click.',
        'Churches use ZionDesk to win back hours every week. Yours could start today — free for 7 days.',
      ],
      cta: 'Start my free trial',
    },
    finishSignup4: {
      subject: 'Last reminder: your ZionDesk account is waiting',
      eyebrow: 'One last thing',
      title: 'Meet Ellen, your church assistant',
      body: [
        'Hi {name},',
        'Ask Ellen “Who hasn’t attended in a month?” or “Design a flyer for Sunday” — and it’s done. Members, giving, messages and events, all in one place.',
        'This is our last reminder. Your account is still here whenever you’re ready.',
      ],
      cta: 'Finish my sign-up',
    },
  },
  es: {
    welcomeAccount: {
      subject: 'Bienvenido a ZionDesk: {church} está lista 🎉',
      eyebrow: 'Bienvenido',
      title: '¡Todo listo, {name}!',
      body: [
        'Tu espacio de ZionDesk para <b>{church}</b> está listo y tu <b>prueba gratis de {days} días</b> de {plan} ha comenzado. Sin tarjeta.',
        '<b>1. Añade a tu gente.</b> Importa tu lista o muestra tu código QR de registro en pantalla: los nuevos miembros y visitantes se registran solos durante el culto.',
        '<b>2. Configura las ofrendas.</b> Comparte tu enlace de ofrendas y cada donación queda registrada con su recibo, automáticamente.',
        '<b>3. Saluda.</b> Envía tu primer mensaje por correo, SMS o WhatsApp: cada persona lo recibe en su idioma.',
      ],
      cta: 'Abrir mi panel',
      note: '¿Preguntas? Responde a este correo y una persona real te ayudará.',
    },
    accountDeleted: {
      subject: 'Tu cuenta de ZionDesk ha sido eliminada',
      eyebrow: 'Cuenta',
      title: 'Tu cuenta está eliminada',
      body: [
        'Hola, {name}:',
        'Como pediste, tu cuenta de ZionDesk y tus datos personales se han eliminado de forma permanente. Cualquier suscripción activa se canceló, así que no se te volverá a cobrar.',
        'Lamentamos verte partir y te agradecemos que nos probaras. Si algún día quieres volver, puedes empezar de nuevo en dos minutos.',
      ],
      cta: 'Empezar de nuevo',
      note: '¿No lo pediste? Responde a este correo de inmediato.',
    },
    subscriptionConfirmed: {
      subject: 'Ya estás suscrito a {plan} 🎉',
      eyebrow: 'Suscripción confirmada',
      title: 'Gracias: {church} ya está en {plan}',
      body: ['Hola, {name}:', 'Tu pago de <b>{amount}</b> se realizó correctamente y tu plan <b>{plan}</b> ya está activo.', 'Próxima renovación: <b>{date}</b>. Puedes cambiarlo o cancelarlo cuando quieras en Ajustes → Plan.'],
      cta: 'Abrir mi panel',
      note: 'Guarda este correo como recibo.',
    },
    paymentReceipt: {
      subject: 'Pago recibido: ZionDesk {plan}',
      eyebrow: 'Recibo',
      title: 'Gracias por otro mes, {name}',
      body: ['Hemos recibido <b>{amount}</b> por el plan {plan} de <b>{church}</b>.', 'Tu próxima renovación es el <b>{date}</b>. Gestiona tu plan cuando quieras en Ajustes → Plan.'],
      cta: 'Ver mi plan',
      note: 'Guarda este correo como recibo.',
    },
    newsletter: { subject: '{subject}', eyebrow: 'Novedades de ZionDesk', title: '{subject}', body: ['{text}'], cta: 'Abrir ZionDesk', note: 'Recibes este correo porque tienes una cuenta de ZionDesk.' },
    finishSignup1: {
      subject: '{name}, tu espacio de iglesia está a un paso',
      eyebrow: 'Casi listo',
      title: 'Termina de configurar tu iglesia',
      body: ['Hola, {name}:', 'Empezaste a crear tu cuenta de ZionDesk pero no terminaste. Solo lleva dos minutos: dinos el nombre de tu iglesia y listo.', 'Tu <b>prueba gratis de 7 días</b> empieza en cuanto termines. Sin tarjeta.'],
      cta: 'Terminar mi registro',
    },
    finishSignup2: {
      subject: 'Nuevos miembros registrados antes de que acabe el sermón',
      eyebrow: 'Imagina este domingo',
      title: 'Un visitante escanea. Ya está dentro. Tú das seguimiento.',
      body: [
        'Hola, {name}:',
        'Pon un código QR en la pantalla. Los visitantes y nuevos convertidos se registran en segundos desde su móvil, y ZionDesk da la bienvenida a cada uno en su idioma.',
        'Tu equipo recibe una lista de seguimiento el mismo día, para que nadie se quede atrás.',
      ],
      cta: 'Configurar mi iglesia',
    },
    finishSignup3: {
      subject: 'Ofrendas, recibos e informes, sin hojas de cálculo',
      eyebrow: 'Menos papeleo, más ministerio',
      title: 'Deja que ZionDesk haga el papeleo',
      body: [
        'Hola, {name}:',
        'Ofrendas en línea con recibos automáticos. Cada diezmo y ofrenda en el fondo correcto. Informes listos para tu junta con un clic.',
        'Las iglesias usan ZionDesk para recuperar horas cada semana. La tuya puede empezar hoy, gratis durante 7 días.',
      ],
      cta: 'Empezar mi prueba gratis',
    },
    finishSignup4: {
      subject: 'Último recordatorio: tu cuenta de ZionDesk te espera',
      eyebrow: 'Una última cosa',
      title: 'Conoce a Ellen, tu asistente de iglesia',
      body: [
        'Hola, {name}:',
        'Pregúntale a Ellen «¿Quién no ha venido en un mes?» o «Diseña un flyer para el domingo», y listo. Miembros, ofrendas, mensajes y eventos en un solo lugar.',
        'Este es nuestro último recordatorio. Tu cuenta sigue aquí cuando estés listo.',
      ],
      cta: 'Terminar mi registro',
    },
  },
  fr: {
    welcomeAccount: {
      subject: 'Bienvenue sur ZionDesk — {church} est prête 🎉',
      eyebrow: 'Bienvenue',
      title: 'Tout est prêt, {name} !',
      body: [
        'Votre espace ZionDesk pour <b>{church}</b> est prêt et votre <b>essai gratuit de {days} jours</b> de {plan} a commencé. Sans carte bancaire.',
        '<b>1. Ajoutez vos membres.</b> Importez votre liste ou affichez votre QR code d’inscription à l’écran : nouveaux membres et visiteurs s’inscrivent eux-mêmes pendant le culte.',
        '<b>2. Configurez les dons.</b> Partagez votre lien de dons : chaque don est enregistré avec son reçu, automatiquement.',
        '<b>3. Dites bonjour.</b> Envoyez votre premier message par e-mail, SMS ou WhatsApp — chacun le reçoit dans sa langue.',
      ],
      cta: 'Ouvrir mon tableau de bord',
      note: 'Des questions ? Répondez simplement à cet e-mail : une vraie personne vous aidera.',
    },
    accountDeleted: {
      subject: 'Votre compte ZionDesk a été supprimé',
      eyebrow: 'Compte',
      title: 'Votre compte est supprimé',
      body: [
        'Bonjour {name},',
        'Comme demandé, votre compte ZionDesk et vos données personnelles ont été définitivement supprimés. Tout abonnement actif a été annulé : vous ne serez plus débité.',
        'Nous sommes désolés de vous voir partir et merci de nous avoir essayés. Si vous souhaitez revenir, tout recommencer prend deux minutes.',
      ],
      cta: 'Recommencer',
      note: 'Vous n’avez rien demandé ? Répondez immédiatement à cet e-mail.',
    },
    subscriptionConfirmed: {
      subject: 'Vous êtes abonné à {plan} 🎉',
      eyebrow: 'Abonnement confirmé',
      title: 'Merci — {church} est sur {plan}',
      body: ['Bonjour {name},', 'Votre paiement de <b>{amount}</b> a bien été effectué et votre formule <b>{plan}</b> est active.', 'Prochain renouvellement : <b>{date}</b>. Modifiez ou annulez à tout moment dans Paramètres → Formule.'],
      cta: 'Ouvrir mon tableau de bord',
      note: 'Conservez cet e-mail comme reçu.',
    },
    paymentReceipt: {
      subject: 'Paiement reçu — ZionDesk {plan}',
      eyebrow: 'Reçu',
      title: 'Merci pour ce nouveau mois, {name}',
      body: ['Nous avons reçu <b>{amount}</b> pour la formule {plan} de <b>{church}</b>.', 'Prochain renouvellement le <b>{date}</b>. Gérez votre formule à tout moment dans Paramètres → Formule.'],
      cta: 'Voir ma formule',
      note: 'Conservez cet e-mail comme reçu.',
    },
    newsletter: { subject: '{subject}', eyebrow: 'Actualités ZionDesk', title: '{subject}', body: ['{text}'], cta: 'Ouvrir ZionDesk', note: 'Vous recevez cet e-mail car vous avez un compte ZionDesk.' },
    finishSignup1: {
      subject: '{name}, votre espace d’église n’attend plus que vous',
      eyebrow: 'Presque fini',
      title: 'Terminez la configuration de votre église',
      body: ['Bonjour {name},', 'Vous avez commencé à créer votre compte ZionDesk sans terminer. Il ne faut que deux minutes : indiquez le nom de votre église et c’est parti.', 'Votre <b>essai gratuit de 7 jours</b> démarre dès que vous terminez. Sans carte bancaire.'],
      cta: 'Terminer mon inscription',
    },
    finishSignup2: {
      subject: 'De nouveaux membres inscrits avant la fin du sermon',
      eyebrow: 'Imaginez dimanche',
      title: 'Un visiteur scanne. Il est inscrit. Vous assurez le suivi.',
      body: [
        'Bonjour {name},',
        'Affichez un QR code à l’écran. Visiteurs et nouveaux convertis s’inscrivent en quelques secondes sur leur téléphone, et ZionDesk accueille chacun dans sa langue.',
        'Votre équipe reçoit une liste de suivi le jour même : personne n’est oublié.',
      ],
      cta: 'Configurer mon église',
    },
    finishSignup3: {
      subject: 'Dons, reçus et rapports — sans tableur',
      eyebrow: 'Moins d’administratif, plus de ministère',
      title: 'Laissez ZionDesk gérer la paperasse',
      body: [
        'Bonjour {name},',
        'Dons en ligne avec reçus automatiques. Chaque dîme et offrande dans le bon fonds. Des rapports prêts pour votre conseil en un clic.',
        'Les églises utilisent ZionDesk pour gagner des heures chaque semaine. La vôtre peut commencer aujourd’hui, gratuitement pendant 7 jours.',
      ],
      cta: 'Démarrer mon essai gratuit',
    },
    finishSignup4: {
      subject: 'Dernier rappel : votre compte ZionDesk vous attend',
      eyebrow: 'Une dernière chose',
      title: 'Voici Ellen, votre assistante d’église',
      body: [
        'Bonjour {name},',
        'Demandez à Ellen « Qui n’est pas venu depuis un mois ? » ou « Crée un flyer pour dimanche » — c’est fait. Membres, dons, messages et événements au même endroit.',
        'C’est notre dernier rappel. Votre compte reste disponible dès que vous êtes prêt.',
      ],
      cta: 'Terminer mon inscription',
    },
  },
  de: {
    welcomeAccount: {
      subject: 'Willkommen bei ZionDesk – {church} ist bereit 🎉',
      eyebrow: 'Willkommen',
      title: 'Alles bereit, {name}!',
      body: [
        'Dein ZionDesk-Bereich für <b>{church}</b> ist eingerichtet und deine <b>{days}-tägige kostenlose Testphase</b> von {plan} hat begonnen. Ohne Kreditkarte.',
        '<b>1. Füge deine Leute hinzu.</b> Importiere deine Liste oder zeige deinen Anmelde-QR-Code auf der Leinwand – neue Mitglieder und Gäste melden sich während des Gottesdienstes selbst an.',
        '<b>2. Richte Spenden ein.</b> Teile deinen Spendenlink – jede Spende wird automatisch mit Quittung erfasst.',
        '<b>3. Sag Hallo.</b> Sende deine erste Nachricht per E-Mail, SMS oder WhatsApp – jede Person erhält sie in ihrer Sprache.',
      ],
      cta: 'Mein Dashboard öffnen',
      note: 'Fragen? Antworte einfach auf diese E-Mail – ein echter Mensch hilft dir.',
    },
    accountDeleted: {
      subject: 'Dein ZionDesk-Konto wurde gelöscht',
      eyebrow: 'Konto',
      title: 'Dein Konto ist gelöscht',
      body: [
        'Hallo {name},',
        'Wie gewünscht wurden dein ZionDesk-Konto und deine persönlichen Daten endgültig gelöscht. Ein aktives Abo wurde gekündigt – es wird nichts mehr abgebucht.',
        'Schade, dass du gehst – und danke, dass du uns ausprobiert hast. Wenn du zurückkommen möchtest, bist du in zwei Minuten wieder dabei.',
      ],
      cta: 'Neu starten',
      note: 'Hast du das nicht veranlasst? Antworte bitte sofort auf diese E-Mail.',
    },
    subscriptionConfirmed: {
      subject: 'Du hast {plan} abonniert 🎉',
      eyebrow: 'Abo bestätigt',
      title: 'Danke – {church} nutzt jetzt {plan}',
      body: ['Hallo {name},', 'Deine Zahlung über <b>{amount}</b> war erfolgreich und dein Tarif <b>{plan}</b> ist aktiv.', 'Nächste Verlängerung: <b>{date}</b>. Ändern oder kündigen kannst du jederzeit unter Einstellungen → Tarif.'],
      cta: 'Mein Dashboard öffnen',
      note: 'Bewahre diese E-Mail als Quittung auf.',
    },
    paymentReceipt: {
      subject: 'Zahlung erhalten – ZionDesk {plan}',
      eyebrow: 'Quittung',
      title: 'Danke für einen weiteren Monat, {name}',
      body: ['Wir haben <b>{amount}</b> für den Tarif {plan} von <b>{church}</b> erhalten.', 'Die nächste Verlängerung ist am <b>{date}</b>. Verwalte deinen Tarif jederzeit unter Einstellungen → Tarif.'],
      cta: 'Meinen Tarif ansehen',
      note: 'Bewahre diese E-Mail als Quittung auf.',
    },
    newsletter: { subject: '{subject}', eyebrow: 'ZionDesk-Neuigkeiten', title: '{subject}', body: ['{text}'], cta: 'ZionDesk öffnen', note: 'Du erhältst diese E-Mail, weil du ein ZionDesk-Konto hast.' },
    finishSignup1: {
      subject: '{name}, dein Gemeindebereich ist nur einen Schritt entfernt',
      eyebrow: 'Fast geschafft',
      title: 'Richte deine Gemeinde fertig ein',
      body: ['Hallo {name},', 'Du hast begonnen, dein ZionDesk-Konto zu erstellen, aber noch nicht abgeschlossen. Es dauert nur zwei Minuten – nenne uns den Namen deiner Gemeinde und los geht’s.', 'Deine <b>7-tägige kostenlose Testphase</b> beginnt, sobald du fertig bist. Ohne Kreditkarte.'],
      cta: 'Anmeldung abschließen',
    },
    finishSignup2: {
      subject: 'Neue Mitglieder angemeldet, bevor die Predigt endet',
      eyebrow: 'Stell dir diesen Sonntag vor',
      title: 'Ein Gast scannt. Er ist dabei. Du bleibst dran.',
      body: [
        'Hallo {name},',
        'Zeige einen QR-Code auf der Leinwand. Gäste und Neubekehrte melden sich in Sekunden mit dem Handy an – und ZionDesk begrüßt jeden in seiner Sprache.',
        'Dein Team erhält noch am selben Tag eine Nachverfolgungsliste, damit niemand verloren geht.',
      ],
      cta: 'Meine Gemeinde einrichten',
    },
    finishSignup3: {
      subject: 'Spenden, Quittungen und Berichte – ohne Tabellen',
      eyebrow: 'Weniger Verwaltung, mehr Dienst',
      title: 'Lass ZionDesk den Papierkram erledigen',
      body: [
        'Hallo {name},',
        'Online-Spenden mit automatischen Quittungen. Jeder Zehnte und jede Kollekte im richtigen Fonds. Berichte für deinen Vorstand mit einem Klick.',
        'Gemeinden gewinnen mit ZionDesk jede Woche Stunden zurück. Deine kann heute starten – 7 Tage kostenlos.',
      ],
      cta: 'Kostenlos testen',
    },
    finishSignup4: {
      subject: 'Letzte Erinnerung: Dein ZionDesk-Konto wartet',
      eyebrow: 'Noch eine Sache',
      title: 'Lerne Ellen kennen, deine Gemeindeassistentin',
      body: [
        'Hallo {name},',
        'Frag Ellen „Wer war seit einem Monat nicht da?“ oder „Gestalte einen Flyer für Sonntag“ – erledigt. Mitglieder, Spenden, Nachrichten und Veranstaltungen an einem Ort.',
        'Das ist unsere letzte Erinnerung. Dein Konto ist da, wann immer du bereit bist.',
      ],
      cta: 'Anmeldung abschließen',
    },
  },
  pt: {
    welcomeAccount: {
      subject: 'Bem-vindo ao ZionDesk — {church} está pronta 🎉',
      eyebrow: 'Bem-vindo',
      title: 'Está tudo pronto, {name}!',
      body: [
        'O seu espaço ZionDesk para <b>{church}</b> está pronto e a sua <b>avaliação gratuita de {days} dias</b> do {plan} começou. Sem cartão.',
        '<b>1. Adicione a sua gente.</b> Importe a sua lista ou mostre o código QR de registo no ecrã — novos membros e visitantes registam-se sozinhos durante o culto.',
        '<b>2. Configure as ofertas.</b> Partilhe o seu link de ofertas e cada contribuição fica registada com recibo, automaticamente.',
        '<b>3. Diga olá.</b> Envie a primeira mensagem por e-mail, SMS ou WhatsApp — cada pessoa recebe-a no seu idioma.',
      ],
      cta: 'Abrir o meu painel',
      note: 'Dúvidas? Responda a este e-mail — uma pessoa real vai ajudar.',
    },
    accountDeleted: {
      subject: 'A sua conta ZionDesk foi eliminada',
      eyebrow: 'Conta',
      title: 'A sua conta foi eliminada',
      body: [
        'Olá {name},',
        'Como pediu, a sua conta ZionDesk e os seus dados pessoais foram eliminados permanentemente. Qualquer subscrição ativa foi cancelada, por isso não voltará a ser cobrado.',
        'Lamentamos vê-lo partir e agradecemos por nos ter experimentado. Se quiser voltar, recomeçar leva dois minutos.',
      ],
      cta: 'Recomeçar',
      note: 'Não pediu isto? Responda a este e-mail imediatamente.',
    },
    subscriptionConfirmed: {
      subject: 'Já subscreveu o {plan} 🎉',
      eyebrow: 'Subscrição confirmada',
      title: 'Obrigado — {church} está no {plan}',
      body: ['Olá {name},', 'O seu pagamento de <b>{amount}</b> foi concluído e o plano <b>{plan}</b> está ativo.', 'Próxima renovação: <b>{date}</b>. Pode alterar ou cancelar a qualquer momento em Definições → Plano.'],
      cta: 'Abrir o meu painel',
      note: 'Guarde este e-mail como recibo.',
    },
    paymentReceipt: {
      subject: 'Pagamento recebido — ZionDesk {plan}',
      eyebrow: 'Recibo',
      title: 'Obrigado por mais um mês, {name}',
      body: ['Recebemos <b>{amount}</b> pelo plano {plan} de <b>{church}</b>.', 'A próxima renovação é a <b>{date}</b>. Gira o seu plano a qualquer momento em Definições → Plano.'],
      cta: 'Ver o meu plano',
      note: 'Guarde este e-mail como recibo.',
    },
    newsletter: { subject: '{subject}', eyebrow: 'Novidades ZionDesk', title: '{subject}', body: ['{text}'], cta: 'Abrir o ZionDesk', note: 'Recebe este e-mail porque tem uma conta ZionDesk.' },
    finishSignup1: {
      subject: '{name}, o espaço da sua igreja está a um passo',
      eyebrow: 'Quase lá',
      title: 'Termine a configuração da sua igreja',
      body: ['Olá {name},', 'Começou a criar a sua conta ZionDesk mas não terminou. Leva cerca de dois minutos — diga-nos o nome da sua igreja e está feito.', 'A sua <b>avaliação gratuita de 7 dias</b> começa assim que terminar. Sem cartão.'],
      cta: 'Terminar o meu registo',
    },
    finishSignup2: {
      subject: 'Novos membros registados antes do fim da pregação',
      eyebrow: 'Imagine este domingo',
      title: 'Um visitante digitaliza. Já está registado. Você acompanha.',
      body: [
        'Olá {name},',
        'Mostre um código QR no ecrã. Visitantes e novos convertidos registam-se em segundos no telemóvel — e o ZionDesk dá as boas-vindas a cada um no seu idioma.',
        'A sua equipa recebe uma lista de acompanhamento no mesmo dia, para que ninguém fique esquecido.',
      ],
      cta: 'Configurar a minha igreja',
    },
    finishSignup3: {
      subject: 'Ofertas, recibos e relatórios — sem folhas de cálculo',
      eyebrow: 'Menos burocracia, mais ministério',
      title: 'Deixe o ZionDesk tratar da papelada',
      body: [
        'Olá {name},',
        'Ofertas online com recibos automáticos. Cada dízimo e oferta no fundo certo. Relatórios prontos para a liderança num clique.',
        'As igrejas usam o ZionDesk para ganhar horas todas as semanas. A sua pode começar hoje — grátis durante 7 dias.',
      ],
      cta: 'Começar a avaliação gratuita',
    },
    finishSignup4: {
      subject: 'Último lembrete: a sua conta ZionDesk está à espera',
      eyebrow: 'Só mais uma coisa',
      title: 'Conheça a Ellen, a assistente da sua igreja',
      body: [
        'Olá {name},',
        'Pergunte à Ellen “Quem não vem há um mês?” ou “Cria um flyer para domingo” — e está feito. Membros, ofertas, mensagens e eventos num só lugar.',
        'Este é o nosso último lembrete. A sua conta continua aqui quando estiver pronto.',
      ],
      cta: 'Terminar o meu registo',
    },
  },
}
