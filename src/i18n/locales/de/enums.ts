import type { Dict } from '../en'
const enums: Dict['enums'] = {
  stage: { Newcomer: 'Gast', Convert: 'Neubekehrt', Member: 'Mitglied', Worker: 'Mitarbeiter' },
  stagePlural: { Newcomer: 'Gäste', Convert: 'Neubekehrte', Member: 'Mitglieder', Worker: 'Mitarbeiter' },
  stageHint: { Newcomer: 'Erstbesucher', Convert: 'Neu im Glauben', Member: 'Gemeindefamilie', Worker: 'Dienstteams' },
  status: { Active: 'Aktiv', Inactive: 'Inaktiv', Transferred: 'Gewechselt' },
  gender: { Female: 'Weiblich', Male: 'Männlich' },
  channel: { Call: 'Anruf', SMS: 'SMS', WhatsApp: 'WhatsApp', Email: 'E-Mail', Visit: 'Besuch', Note: 'Notiz' },
  mode: { 'In person': 'Vor Ort', Online: 'Online', Hybrid: 'Hybrid' },
  method: { Transfer: 'Überweisung', Card: 'Karte', Cash: 'Bar', Cheque: 'Scheck' },
  expense: { Utilities: 'Nebenkosten', Salaries: 'Gehälter', Outreach: 'Evangelisation', Equipment: 'Ausstattung', Maintenance: 'Wartung', Missions: 'Mission', Events: 'Veranstaltungen', Other: 'Sonstiges' },
  request: { 'Awaiting payment': 'Zahlung ausstehend', Submitted: 'Eingereicht', 'In design': 'In Gestaltung', Review: 'Prüfung', Delivered: 'Geliefert' },
  campaign: { Queued: 'In Warteschlange', Scheduled: 'Geplant', Sending: "Wird gesendet", Sent: "Gesendet", Failed: "Fehlgeschlagen" },
  role: { admin: 'Administrator', finance: 'Finanzen', leader: 'Dienstbereichsleitung', branch: "Standortleiter" },
  plan: { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' },
}
export default enums
