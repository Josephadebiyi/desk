import type { Dict } from '../en'
const dash: Dict['dash'] = {
  nav: { attendance: 'Présences', overview: 'Aperçu', ai: 'Demander à Ellen', members: 'Membres', giving: 'Dons', messaging: 'Messages', events: 'Événements', design: 'Studio design', reports: 'Rapports', settings: 'Paramètres', links: 'Liens et codes QR', help: 'Aide', branches: "Rapports des antennes" },
  rail: { label: 'Actions rapides', search: 'Rechercher des membres', addMember: 'Ajouter un membre', import: 'Importer des membres' },
  billing: {
    tag: "Paiement",
    pastDue: "Votre dernier paiement n’a pas abouti. Mettez à jour votre carte pour garder votre forfait actif.",
    fix: "Régler le paiement",
    choose: "Choisir un forfait",
    expiredTitle: "Votre forfait est terminé",
    expiredText: "Votre essai gratuit ou votre abonnement est terminé. Toutes les données de votre église sont en sécurité — choisissez un forfait pour reprendre là où vous en étiez.",
    askAdmin: "Demandez à l’Administrateur de votre église de choisir un forfait.",
    export: "Télécharger vos données",
  },
  trial: { tag: 'Essai', left_one: '{count} jour restant', left_other: '{count} jours restants', rest: 'sur votre essai gratuit · Fonctions Essentials actives', finish: 'Terminer l’inscription', hide: 'Masquer' },
  viewingAs: 'Vue en tant que',
  viewingAsHint: 'Voir ce que chaque rôle de l’équipe peut consulter',
  notif: {
    title: 'Notifications',
    unread_one: '{count} nouvelle',
    unread_other: '{count} nouvelles',
    all: 'Ouvrir la boîte d’Ellen',
  },
  profile: {
    preview: 'Mode aperçu — données de démonstration dans ce navigateur. La connexion fonctionne une fois le serveur relié.',
    exitPreview: 'Retour au site',
  },
  signOut: 'Se déconnecter',
  notifications: 'Notifications',
  signedInAs: 'Connecté en tant que {name}',
  website: 'Site web de ZionDesk',
}
export default dash
