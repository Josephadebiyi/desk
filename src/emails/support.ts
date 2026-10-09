/**
 * Confirmations to the church user: their support ticket and their flyer request were received.
 * Vars: {name} {church} {reference} (ZD-… / FLY-…) {subject} (ticket subject or flyer title) {date} (flyer due date)
 */
import type { EmailCopy } from './catalog'
import type { EmailLang } from './strings'

export type SupportKind = 'supportReceived' | 'flyerReceived'

export const SUPPORT_EMAILS: Record<EmailLang, Record<SupportKind, EmailCopy>> = {
  en: {
    supportReceived: {
      subject: 'We got your message [{reference}]',
      eyebrow: 'ZionDesk Support',
      title: 'Your ticket is open',
      body: ['Hi {name},', 'Thanks for reaching out. Your support ticket <b>{reference}</b> — “{subject}” — has been received and our team will reply as soon as possible.', 'You’ll find our reply in ZionDesk under Help, and we’ll email you too. Please quote <b>{reference}</b> if you contact us about it.'],
      cta: 'View your ticket',
    },
    flyerReceived: {
      subject: 'Flyer request received [{reference}]',
      eyebrow: '{church}',
      title: 'Our designers are on it',
      body: ['Hi {name},', 'Your flyer request <b>{reference}</b> — “{subject}” — has been sent to the ZionDesk design team.', 'Expected by <b>{date}</b>. You can follow it and chat with the designers in Design Studio. Please quote <b>{reference}</b> if you contact us about it.'],
      cta: 'Open Design Studio',
    },
  },
  es: {
    supportReceived: {
      subject: 'Hemos recibido tu mensaje [{reference}]',
      eyebrow: 'Soporte de ZionDesk',
      title: 'Tu ticket está abierto',
      body: ['Hola {name},', 'Gracias por escribirnos. Hemos recibido tu ticket de soporte <b>{reference}</b> — «{subject}» — y nuestro equipo te responderá lo antes posible.', 'Verás nuestra respuesta en ZionDesk, en Ayuda, y también te escribiremos por correo. Menciona <b>{reference}</b> si nos contactas sobre este tema.'],
      cta: 'Ver tu ticket',
    },
    flyerReceived: {
      subject: 'Solicitud de flyer recibida [{reference}]',
      eyebrow: '{church}',
      title: 'Nuestros diseñadores ya están en ello',
      body: ['Hola {name},', 'Tu solicitud de flyer <b>{reference}</b> — «{subject}» — se ha enviado al equipo de diseño de ZionDesk.', 'Prevista para el <b>{date}</b>. Puedes seguirla y hablar con los diseñadores en Design Studio. Menciona <b>{reference}</b> si nos contactas sobre ella.'],
      cta: 'Abrir Design Studio',
    },
  },
  fr: {
    supportReceived: {
      subject: 'Nous avons bien reçu votre message [{reference}]',
      eyebrow: 'Support ZionDesk',
      title: 'Votre ticket est ouvert',
      body: ['Bonjour {name},', 'Merci de nous avoir écrit. Votre ticket <b>{reference}</b> — « {subject} » — a bien été reçu et notre équipe vous répondra au plus vite.', 'Vous trouverez notre réponse dans ZionDesk, rubrique Aide, et nous vous écrirons aussi par e-mail. Merci d’indiquer <b>{reference}</b> si vous nous contactez à ce sujet.'],
      cta: 'Voir votre ticket',
    },
    flyerReceived: {
      subject: 'Demande de flyer reçue [{reference}]',
      eyebrow: '{church}',
      title: 'Nos graphistes s’en occupent',
      body: ['Bonjour {name},', 'Votre demande de flyer <b>{reference}</b> — « {subject} » — a été transmise à l’équipe design de ZionDesk.', 'Prévu pour le <b>{date}</b>. Suivez-la et échangez avec les graphistes dans Design Studio. Merci d’indiquer <b>{reference}</b> si vous nous contactez à ce sujet.'],
      cta: 'Ouvrir Design Studio',
    },
  },
  de: {
    supportReceived: {
      subject: 'Wir haben deine Nachricht erhalten [{reference}]',
      eyebrow: 'ZionDesk Support',
      title: 'Dein Ticket ist eröffnet',
      body: ['Hallo {name},', 'Danke für deine Nachricht. Dein Support-Ticket <b>{reference}</b> – „{subject}“ – ist eingegangen, und unser Team antwortet so schnell wie möglich.', 'Unsere Antwort findest du in ZionDesk unter Hilfe, zusätzlich per E-Mail. Bitte nenne <b>{reference}</b>, wenn du uns dazu kontaktierst.'],
      cta: 'Ticket ansehen',
    },
    flyerReceived: {
      subject: 'Flyer-Anfrage erhalten [{reference}]',
      eyebrow: '{church}',
      title: 'Unsere Designer sind dran',
      body: ['Hallo {name},', 'Deine Flyer-Anfrage <b>{reference}</b> – „{subject}“ – wurde an das ZionDesk-Designteam geschickt.', 'Voraussichtlich fertig am <b>{date}</b>. Verfolge sie und schreib mit den Designern im Design Studio. Bitte nenne <b>{reference}</b>, wenn du uns dazu kontaktierst.'],
      cta: 'Design Studio öffnen',
    },
  },
  pt: {
    supportReceived: {
      subject: 'Recebemos a sua mensagem [{reference}]',
      eyebrow: 'Suporte ZionDesk',
      title: 'O seu pedido está aberto',
      body: ['Olá {name},', 'Obrigado pelo contacto. O seu pedido de suporte <b>{reference}</b> — «{subject}» — foi recebido e a nossa equipa responderá o mais depressa possível.', 'Verá a nossa resposta no ZionDesk, em Ajuda, e também lhe enviaremos um e-mail. Indique <b>{reference}</b> se nos contactar sobre este assunto.'],
      cta: 'Ver o seu pedido',
    },
    flyerReceived: {
      subject: 'Pedido de flyer recebido [{reference}]',
      eyebrow: '{church}',
      title: 'Os nossos designers já estão a tratar',
      body: ['Olá {name},', 'O seu pedido de flyer <b>{reference}</b> — «{subject}» — foi enviado à equipa de design do ZionDesk.', 'Previsto para <b>{date}</b>. Acompanhe-o e fale com os designers no Design Studio. Indique <b>{reference}</b> se nos contactar sobre ele.'],
      cta: 'Abrir o Design Studio',
    },
  },
}
