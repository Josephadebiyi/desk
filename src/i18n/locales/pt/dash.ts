import type { Dict } from '../en'
const dash: Dict['dash'] = {
  nav: { attendance: 'Presenças', overview: 'Visão geral', ai: 'Pergunte à Ellen', members: 'Membros', giving: 'Ofertas', messaging: 'Mensagens', events: 'Eventos', design: 'Estúdio de design', reports: 'Relatórios', settings: 'Definições', links: 'Ligações e códigos QR', help: 'Ajuda', branches: "Relatórios das filiais", people: "Pessoas", finance: "Finanças", outreach: "Comunicação" },
  rail: { label: 'Ações rápidas', search: 'Pesquisar membros', addMember: 'Adicionar membro', import: 'Importar membros' },
  billing: {
    tag: "Pagamento",
    pastDue: "O seu último pagamento não foi concluído. Atualize o cartão para manter o plano ativo.",
    fix: "Resolver pagamento",
    choose: "Escolher um plano",
    expiredTitle: "O seu plano terminou",
    expiredText: "O seu período experimental ou subscrição terminou. Todos os dados da sua igreja estão seguros — escolha um plano para continuar onde parou.",
    askAdmin: "Peça ao Administrador da sua igreja para escolher um plano.",
    export: "Descarregar os seus dados",
  },
  trial: { tag: 'Teste', left_one: 'Falta {count} dia', left_other: 'Faltam {count} dias', rest: 'do seu teste gratuito · Funcionalidades Essentials ativas', finish: 'Concluir registo', hide: 'Ocultar' },
  viewingAs: 'A ver como',
  viewingAsHint: 'Veja o que cada função da equipa consegue ver',
  notif: {
    title: 'Notificações',
    unread_one: '{count} nova',
    unread_other: '{count} novas',
    all: 'Abrir a caixa da Ellen',
  },
  profile: {
    preview: 'Modo de pré-visualização — dados de demonstração neste navegador. O início de sessão funciona quando o servidor estiver ligado.',
    exitPreview: 'Voltar ao site',
  },
  signOut: 'Terminar sessão',
  notifications: 'Notificações',
  signedInAs: 'Sessão iniciada como {name}',
  website: 'Site do ZionDesk',
}
export default dash
