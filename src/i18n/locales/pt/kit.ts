import type { Dict } from '../en'
const kit: Dict['kit'] = {
  gate: {
    title: '{feature} faz parte do {plan}',
    body: 'O seu espaço de trabalho tem um plano que ainda não inclui isto. Atualize para desbloquear — os seus dados ficam exatamente onde estão.',
    upgrade: 'Atualizar para {plan}',
    compare: 'Comparar planos',
    note: 'A faturação liga-se ao backend — atualizar aqui muda o plano deste espaço de trabalho.',
  },
  noAccess: { title: 'Não tem acesso a {what}', body: 'Peça a um administrador para alterar a sua função em Definições → Equipa e funções.' },
  audience: {
    everyone: 'Todos', dept: 'Departamento de {name}', branch: 'Filial {name}', sendTo: 'Enviar para', whichOne: 'Qual',
    aStage: 'Uma fase (visitantes, obreiros…)', aDept: 'Um departamento', aBranch: 'Uma filial',
    included_one: 'Será incluída {count} pessoa', included_other: 'Serão incluídas {count} pessoas',
  },
  askAi: 'Pergunte à Ellen',
}
export default kit
