import type { Dict } from '../en'
const kit: Dict['kit'] = {
  gate: {
    title: '{feature} forma parte de {plan}',
    body: 'Tu espacio de trabajo tiene un plan que aún no lo incluye. Mejora el plan para desbloquearlo: tus datos se quedan exactamente donde están.',
    upgrade: 'Mejorar a {plan}',
    compare: 'Comparar planes',
    note: 'La facturación se conecta con el backend: mejorar aquí cambia el plan de este espacio de trabajo.',
  },
  noAccess: { title: 'No tienes acceso a {what}', body: 'Pide a un administrador que cambie tu rol en Configuración → Equipo y roles.' },
  audience: {
    everyone: 'Todos', dept: 'Departamento de {name}', branch: 'Sede {name}', sendTo: 'Enviar a', whichOne: 'Cuál',
    aStage: 'Una etapa (visitantes, servidores…)', aDept: 'Un departamento', aBranch: 'Una sede',
    included_one: 'Se incluirá {count} persona', included_other: 'Se incluirán {count} personas',
  },
  askAi: 'Pregunta a Ellen',
}
export default kit
