import type { Dict } from '../en'
const dash: Dict['dash'] = {
  nav: { attendance: 'Anwesenheit', overview: 'Übersicht', ai: 'Frag Ellen', members: 'Mitglieder', giving: 'Spenden', messaging: 'Nachrichten', events: 'Termine', design: 'Design-Studio', reports: 'Berichte', settings: 'Einstellungen', links: 'Links & QR-Codes', help: 'Hilfe' },
  rail: { label: 'Schnellaktionen', search: 'Mitglieder suchen', addMember: 'Mitglied hinzufügen', import: 'Mitglieder importieren' },
  billing: {
    tag: "Zahlung",
    pastDue: "Deine letzte Zahlung ist fehlgeschlagen. Aktualisiere deine Karte, damit dein Tarif aktiv bleibt.",
    fix: "Zahlung klären",
    choose: "Tarif wählen",
    expiredTitle: "Dein Tarif ist abgelaufen",
    expiredText: "Deine kostenlose Testphase oder dein Abo ist beendet. Alle Daten deiner Gemeinde sind sicher – wähle einen Tarif, um dort weiterzumachen, wo du aufgehört hast.",
    askAdmin: "Bitte den Administrator deiner Gemeinde, einen Tarif zu wählen.",
    export: "Deine Daten herunterladen",
  },
  trial: { tag: 'Testphase', left_one: 'Noch {count} Tag', left_other: 'Noch {count} Tage', rest: 'in deiner kostenlosen Testphase · Essentials-Funktionen aktiv', finish: 'Konto fertig einrichten', hide: 'Ausblenden' },
  viewingAs: 'Ansicht als',
  viewingAsHint: 'Sieh dir an, was jede Rolle im Team sehen kann',
  notif: {
    title: 'Benachrichtigungen',
    unread_one: '{count} neu',
    unread_other: '{count} neu',
    all: 'Ellens Posteingang öffnen',
  },
  profile: {
    preview: 'Vorschaumodus – Demodaten in diesem Browser. Die Anmeldung funktioniert, sobald der Server verbunden ist.',
    exitPreview: 'Zurück zur Website',
  },
  signOut: 'Abmelden',
  notifications: 'Benachrichtigungen',
  signedInAs: 'Angemeldet als {name}',
  website: 'ZionDesk-Website',
}
export default dash
