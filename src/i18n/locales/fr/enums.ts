import type { Dict } from '../en'
const enums: Dict['enums'] = {
  stage: { Newcomer: 'Nouveau venu', Convert: 'Nouveau converti', Member: 'Membre', Worker: 'Serviteur' },
  stagePlural: { Newcomer: 'Nouveaux venus', Convert: 'Nouveaux convertis', Member: 'Membres', Worker: 'Serviteurs' },
  stageHint: { Newcomer: 'Première visite', Convert: 'Nouveaux croyants', Member: 'Famille de l’église', Worker: 'Équipes de service' },
  status: { Active: 'Actif', Inactive: 'Inactif', Transferred: 'Transféré' },
  gender: { Female: 'Femme', Male: 'Homme' },
  channel: { Call: 'Appel', SMS: 'SMS', WhatsApp: 'WhatsApp', Email: 'E-mail', Visit: 'Visite', Note: 'Note' },
  mode: { 'In person': 'En présentiel', Online: 'En ligne', Hybrid: 'Hybride' },
  method: { Transfer: 'Virement', Card: 'Carte', Cash: 'Espèces', Cheque: 'Chèque' },
  expense: { Utilities: 'Charges', Salaries: 'Salaires', Outreach: 'Évangélisation', Equipment: 'Équipement', Maintenance: 'Entretien', Missions: 'Missions', Events: 'Événements', Other: 'Autre' },
  request: { Submitted: 'Envoyée', 'In design': 'En création', Review: 'Relecture', Delivered: 'Livrée' },
  campaign: { Queued: 'En file d’attente', Scheduled: 'Programmé' },
  role: { admin: 'Administrateur', finance: 'Finances', leader: 'Responsable de ministère' },
  plan: { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' },
}
export default enums
