import type { Dict } from '../en'
const kit: Dict['kit'] = {
  gate: {
    title: '{feature} fait partie de {plan}',
    body: 'Votre espace utilise une formule qui n’inclut pas encore cette fonction. Passez à la formule supérieure pour la débloquer — vos données restent exactement où elles sont.',
    upgrade: 'Passer à {plan}',
    compare: 'Comparer les formules',
    note: 'La facturation est reliée au backend — la mise à niveau ici change la formule de cet espace.',
  },
  noAccess: { title: 'Vous n’avez pas accès à {what}', body: 'Demandez à un administrateur de modifier votre rôle dans Paramètres → Équipe et rôles.' },
  audience: {
    everyone: 'Tout le monde', dept: 'Département {name}', branch: 'Antenne {name}', sendTo: 'Envoyer à', whichOne: 'Lequel',
    aStage: 'Une étape (nouveaux venus, serviteurs…)', aDept: 'Un département', aBranch: 'Une antenne',
    included_one: '{count} personne sera incluse', included_other: '{count} personnes seront incluses',
  },
  askAi: 'Demander à Ellen',
}
export default kit
