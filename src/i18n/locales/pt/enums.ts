import type { Dict } from '../en'
const enums: Dict['enums'] = {
  stage: { Newcomer: 'Visitante', Convert: 'Novo convertido', Member: 'Membro', Worker: 'Obreiro' },
  stagePlural: { Newcomer: 'Visitantes', Convert: 'Novos convertidos', Member: 'Membros', Worker: 'Obreiros' },
  stageHint: { Newcomer: 'Primeira visita', Convert: 'Novos na fé', Member: 'Família da igreja', Worker: 'Equipas de serviço' },
  status: { Active: 'Ativo', Inactive: 'Inativo', Transferred: 'Transferido' },
  gender: { Female: 'Feminino', Male: 'Masculino' },
  channel: { Call: 'Chamada', SMS: 'SMS', WhatsApp: 'WhatsApp', Email: 'E-mail', Visit: 'Visita', Note: 'Nota' },
  mode: { 'In person': 'Presencial', Online: 'Online', Hybrid: 'Híbrido' },
  method: { Transfer: 'Transferência', Card: 'Cartão', Cash: 'Numerário', Cheque: 'Cheque' },
  expense: { Utilities: 'Serviços', Salaries: 'Salários', Outreach: 'Evangelismo', Equipment: 'Equipamento', Maintenance: 'Manutenção', Missions: 'Missões', Events: 'Eventos', Other: 'Outros' },
  request: { 'Awaiting payment': 'A aguardar pagamento', Submitted: 'Enviado', 'In design': 'Em design', Review: 'Revisão', Delivered: 'Entregue' },
  campaign: { Queued: 'Em fila', Scheduled: 'Agendado', Sending: "A enviar", Sent: "Enviado", Failed: "Falhou" },
  role: { admin: 'Administrador', finance: 'Finanças', leader: 'Líder de ministério', branch: "Líder de filial" },
  plan: { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' },
}
export default enums
