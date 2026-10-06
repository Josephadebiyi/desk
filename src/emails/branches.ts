/**
 * Branch report emails: reminders to branch leaders, and HQ notices (who hasn't reported, new reports).
 * Vars: {name} {church} {branch} {period} (e.g. "October 2026") {date} (due date) {branches} (list) {note}
 */
import type { EmailCopy } from './catalog'
import type { EmailLang } from './strings'

export type BranchKind = 'branchReminder' | 'branchOverdue' | 'branchMissing' | 'branchSubmitted' | 'branchReturned'
export const BRANCH_KINDS: BranchKind[] = ['branchReminder', 'branchOverdue', 'branchMissing', 'branchSubmitted', 'branchReturned']

export const BRANCH_EMAILS: Record<EmailLang, Record<BranchKind, EmailCopy>> = {
  en: {
    branchReminder: {
      subject: '{branch}: your {period} report is due {date}',
      eyebrow: '{church}',
      title: 'Your {period} report is due {date}',
      body: ['Hi {name},', 'Please send <b>{branch}</b>’s report for <b>{period}</b> to {church} by <b>{date}</b>: income by fund, expenses, attendance and any notes.', 'It only takes a few minutes in ZionDesk.'],
      cta: 'Submit the report',
    },
    branchOverdue: {
      subject: 'Reminder: {branch}’s {period} report is overdue',
      eyebrow: '{church}',
      title: 'The {period} report is overdue',
      body: ['Hi {name},', '{church} hasn’t received <b>{branch}</b>’s report for <b>{period}</b> yet. It was due on <b>{date}</b>.', 'Please submit it as soon as you can.'],
      cta: 'Submit the report',
    },
    branchMissing: {
      subject: '{church}: branches that haven’t sent their {period} report',
      eyebrow: 'Branch reports',
      title: 'Still waiting for {period} reports',
      body: ['Hi {name},', 'These branches haven’t submitted their <b>{period}</b> report (due {date}):', '<b>{branches}</b>', 'ZionDesk has reminded their branch leaders. You can also send a reminder from the Branch reports page.'],
      cta: 'Open branch reports',
    },
    branchSubmitted: {
      subject: '{branch} sent its {period} report',
      eyebrow: 'Branch reports',
      title: '{branch} has submitted its {period} report',
      body: ['Hi {name},', '<b>{branch}</b> has sent its report for <b>{period}</b>. Open it to review the figures.'],
      cta: 'Review the report',
    },
    branchReturned: {
      subject: '{church} sent back {branch}’s {period} report',
      eyebrow: '{church}',
      title: 'Your {period} report needs a change',
      body: ['Hi {name},', '{church} sent back <b>{branch}</b>’s report for <b>{period}</b> with this note:', '<i>{note}</i>', 'Please update it and submit it again.'],
      cta: 'Update the report',
    },
  },
  es: {
    branchReminder: {
      subject: '{branch}: tu informe de {period} vence el {date}',
      eyebrow: '{church}',
      title: 'Tu informe de {period} vence el {date}',
      body: ['Hola, {name}:', 'Envía el informe de <b>{branch}</b> de <b>{period}</b> a {church} antes del <b>{date}</b>: ingresos por fondo, gastos, asistencia y notas.', 'En ZionDesk solo lleva unos minutos.'],
      cta: 'Enviar el informe',
    },
    branchOverdue: {
      subject: 'Recordatorio: el informe de {period} de {branch} está atrasado',
      eyebrow: '{church}',
      title: 'El informe de {period} está atrasado',
      body: ['Hola, {name}:', '{church} aún no ha recibido el informe de <b>{branch}</b> de <b>{period}</b>. Vencía el <b>{date}</b>.', 'Envíalo en cuanto puedas.'],
      cta: 'Enviar el informe',
    },
    branchMissing: {
      subject: '{church}: sedes que no han enviado su informe de {period}',
      eyebrow: 'Informes de sedes',
      title: 'Faltan informes de {period}',
      body: ['Hola, {name}:', 'Estas sedes no han enviado su informe de <b>{period}</b> (vencía el {date}):', '<b>{branches}</b>', 'ZionDesk ya avisó a sus líderes. También puedes enviar un recordatorio desde la página de informes de sedes.'],
      cta: 'Abrir informes de sedes',
    },
    branchSubmitted: {
      subject: '{branch} envió su informe de {period}',
      eyebrow: 'Informes de sedes',
      title: '{branch} ha enviado su informe de {period}',
      body: ['Hola, {name}:', '<b>{branch}</b> ha enviado su informe de <b>{period}</b>. Ábrelo para revisar las cifras.'],
      cta: 'Revisar el informe',
    },
    branchReturned: {
      subject: '{church} devolvió el informe de {period} de {branch}',
      eyebrow: '{church}',
      title: 'Tu informe de {period} necesita un cambio',
      body: ['Hola, {name}:', '{church} devolvió el informe de <b>{branch}</b> de <b>{period}</b> con esta nota:', '<i>{note}</i>', 'Actualízalo y envíalo de nuevo.'],
      cta: 'Actualizar el informe',
    },
  },
  fr: {
    branchReminder: {
      subject: '{branch} : votre rapport de {period} est attendu le {date}',
      eyebrow: '{church}',
      title: 'Votre rapport de {period} est attendu le {date}',
      body: ['Bonjour {name},', 'Merci d’envoyer à {church} le rapport de <b>{branch}</b> pour <b>{period}</b> avant le <b>{date}</b> : recettes par fonds, dépenses, participation et remarques.', 'Cela ne prend que quelques minutes dans ZionDesk.'],
      cta: 'Envoyer le rapport',
    },
    branchOverdue: {
      subject: 'Rappel : le rapport de {period} de {branch} est en retard',
      eyebrow: '{church}',
      title: 'Le rapport de {period} est en retard',
      body: ['Bonjour {name},', '{church} n’a pas encore reçu le rapport de <b>{branch}</b> pour <b>{period}</b>. Il était attendu le <b>{date}</b>.', 'Merci de l’envoyer dès que possible.'],
      cta: 'Envoyer le rapport',
    },
    branchMissing: {
      subject: '{church} : antennes sans rapport de {period}',
      eyebrow: 'Rapports des antennes',
      title: 'Rapports de {period} manquants',
      body: ['Bonjour {name},', 'Ces antennes n’ont pas envoyé leur rapport de <b>{period}</b> (attendu le {date}) :', '<b>{branches}</b>', 'ZionDesk a relancé leurs responsables. Vous pouvez aussi envoyer un rappel depuis la page des rapports.'],
      cta: 'Ouvrir les rapports',
    },
    branchSubmitted: {
      subject: '{branch} a envoyé son rapport de {period}',
      eyebrow: 'Rapports des antennes',
      title: '{branch} a envoyé son rapport de {period}',
      body: ['Bonjour {name},', '<b>{branch}</b> a envoyé son rapport pour <b>{period}</b>. Ouvrez-le pour vérifier les chiffres.'],
      cta: 'Voir le rapport',
    },
    branchReturned: {
      subject: '{church} a renvoyé le rapport de {period} de {branch}',
      eyebrow: '{church}',
      title: 'Votre rapport de {period} doit être corrigé',
      body: ['Bonjour {name},', '{church} a renvoyé le rapport de <b>{branch}</b> pour <b>{period}</b> avec cette remarque :', '<i>{note}</i>', 'Merci de le corriger et de l’envoyer à nouveau.'],
      cta: 'Corriger le rapport',
    },
  },
  de: {
    branchReminder: {
      subject: '{branch}: Bericht für {period} fällig am {date}',
      eyebrow: '{church}',
      title: 'Dein Bericht für {period} ist am {date} fällig',
      body: ['Hallo {name},', 'bitte sende den Bericht von <b>{branch}</b> für <b>{period}</b> bis <b>{date}</b> an {church}: Einnahmen pro Fonds, Ausgaben, Besucherzahl und Notizen.', 'In ZionDesk dauert das nur ein paar Minuten.'],
      cta: 'Bericht einreichen',
    },
    branchOverdue: {
      subject: 'Erinnerung: Der Bericht von {branch} für {period} ist überfällig',
      eyebrow: '{church}',
      title: 'Der Bericht für {period} ist überfällig',
      body: ['Hallo {name},', '{church} hat den Bericht von <b>{branch}</b> für <b>{period}</b> noch nicht erhalten. Er war am <b>{date}</b> fällig.', 'Bitte reiche ihn so bald wie möglich ein.'],
      cta: 'Bericht einreichen',
    },
    branchMissing: {
      subject: '{church}: Standorte ohne Bericht für {period}',
      eyebrow: 'Standortberichte',
      title: 'Berichte für {period} fehlen noch',
      body: ['Hallo {name},', 'diese Standorte haben ihren Bericht für <b>{period}</b> (fällig am {date}) noch nicht eingereicht:', '<b>{branches}</b>', 'ZionDesk hat ihre Standortleiter erinnert. Du kannst auch auf der Seite „Standortberichte“ erinnern.'],
      cta: 'Standortberichte öffnen',
    },
    branchSubmitted: {
      subject: '{branch} hat den Bericht für {period} gesendet',
      eyebrow: 'Standortberichte',
      title: '{branch} hat den Bericht für {period} eingereicht',
      body: ['Hallo {name},', '<b>{branch}</b> hat den Bericht für <b>{period}</b> gesendet. Öffne ihn, um die Zahlen zu prüfen.'],
      cta: 'Bericht prüfen',
    },
    branchReturned: {
      subject: '{church} hat den Bericht von {branch} für {period} zurückgeschickt',
      eyebrow: '{church}',
      title: 'Dein Bericht für {period} braucht eine Änderung',
      body: ['Hallo {name},', '{church} hat den Bericht von <b>{branch}</b> für <b>{period}</b> mit dieser Notiz zurückgeschickt:', '<i>{note}</i>', 'Bitte aktualisiere ihn und reiche ihn erneut ein.'],
      cta: 'Bericht aktualisieren',
    },
  },
  pt: {
    branchReminder: {
      subject: '{branch}: o relatório de {period} vence a {date}',
      eyebrow: '{church}',
      title: 'O seu relatório de {period} vence a {date}',
      body: ['Olá {name},', 'Envie à {church} o relatório de <b>{branch}</b> de <b>{period}</b> até <b>{date}</b>: receitas por fundo, despesas, presenças e notas.', 'No ZionDesk demora apenas alguns minutos.'],
      cta: 'Enviar o relatório',
    },
    branchOverdue: {
      subject: 'Lembrete: o relatório de {period} de {branch} está em atraso',
      eyebrow: '{church}',
      title: 'O relatório de {period} está em atraso',
      body: ['Olá {name},', 'A {church} ainda não recebeu o relatório de <b>{branch}</b> de <b>{period}</b>. Vencia a <b>{date}</b>.', 'Envie-o assim que puder.'],
      cta: 'Enviar o relatório',
    },
    branchMissing: {
      subject: '{church}: filiais sem relatório de {period}',
      eyebrow: 'Relatórios das filiais',
      title: 'Faltam relatórios de {period}',
      body: ['Olá {name},', 'Estas filiais ainda não enviaram o relatório de <b>{period}</b> (vencia a {date}):', '<b>{branches}</b>', 'O ZionDesk já lembrou os seus líderes. Também pode enviar um lembrete na página de relatórios das filiais.'],
      cta: 'Abrir relatórios',
    },
    branchSubmitted: {
      subject: '{branch} enviou o relatório de {period}',
      eyebrow: 'Relatórios das filiais',
      title: '{branch} enviou o relatório de {period}',
      body: ['Olá {name},', '<b>{branch}</b> enviou o relatório de <b>{period}</b>. Abra-o para rever os valores.'],
      cta: 'Rever o relatório',
    },
    branchReturned: {
      subject: 'A {church} devolveu o relatório de {period} de {branch}',
      eyebrow: '{church}',
      title: 'O seu relatório de {period} precisa de uma alteração',
      body: ['Olá {name},', 'A {church} devolveu o relatório de <b>{branch}</b> de <b>{period}</b> com esta nota:', '<i>{note}</i>', 'Atualize-o e envie-o novamente.'],
      cta: 'Atualizar o relatório',
    },
  },
}
