import type { Dict } from '../en'
const kit: Dict['kit'] = {
  gate: {
    title: '{feature} ist Teil von {plan}',
    body: 'Dein Arbeitsbereich nutzt einen Tarif, der diese Funktion noch nicht enthält. Führe ein Upgrade durch, um sie freizuschalten — deine Daten bleiben genau dort, wo sie sind.',
    upgrade: 'Upgrade auf {plan}',
    compare: 'Tarife vergleichen',
    note: 'Die Abrechnung wird mit dem Backend verbunden — ein Upgrade hier ändert den Tarif dieses Arbeitsbereichs.',
  },
  noAccess: { title: 'Du hast keinen Zugriff auf {what}', body: 'Bitte eine Administratorin oder einen Administrator, deine Rolle unter Einstellungen → Team & Rollen zu ändern.' },
  audience: {
    everyone: 'Alle', dept: 'Bereich {name}', branch: 'Standort {name}', sendTo: 'Senden an', whichOne: 'Welche',
    aStage: 'Eine Stufe (Gäste, Mitarbeiter…)', aDept: 'Einen Bereich', aBranch: 'Einen Standort',
    included_one: '{count} Person wird einbezogen', included_other: '{count} Personen werden einbezogen',
  },
  askAi: 'Frag Ellen',
}
export default kit
