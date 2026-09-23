import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/Badge'
import { Card, CardBody, CardHeader } from '../components/Card'
import { CLICKABLE_ROW } from '../components/interactive'
import { ProgressBar } from '../components/ProgressBar'
import { StatCard } from '../components/StatCard'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { fetchTeamDashboard, type TeamMember } from '../features/dashboard/dashboard.api'
import { useAsync } from '../hooks/use-async'
import { apiErrorMessage } from '../lib/api'
import { teamMemberPath } from '../routes/navigation'

export function TeamPage() {
  const { data, loading, error, reload } = useAsync(fetchTeamDashboard)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Equipe</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Situação dos treinamentos de cada pessoa sob sua gestão.
        </p>
      </div>

      {loading && data === null && <LoadingState label="Carregando a equipe..." />}

      {error !== null && data === null && (
        <Card>
          <ErrorState
            description={apiErrorMessage(error, 'Não foi possível carregar a equipe.')}
            onRetry={() => void reload()}
          />
        </Card>
      )}

      {data !== null && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Pessoas" value={data.teamSize} />
            <StatCard label="Em andamento" value={data.tally.inProgress} tone="info" />
            <StatCard label="Concluídos" value={data.tally.completed} tone="success" />
            <StatCard label="Atrasados" value={data.tally.overdue} tone="danger" />
          </div>

          <Card>
            <CardHeader
              title="Progresso médio da equipe"
              description={`${String(data.tally.total)} matrícula(s) no total.`}
            />
            <CardBody>
              <ProgressBar percentage={data.averageProgress} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pessoas" description="Clique para ver as matrículas." />

            {data.members.length === 0 ? (
              <EmptyState
                title="Nenhuma pessoa na equipe"
                description="Funcionários aparecem aqui quando estão vinculados a você como gestor."
              />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {data.members.map((member) => (
                  <MemberRow key={member.id} member={member} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function MemberRow({ member }: { member: TeamMember }) {
  const noEnrollments = member.tally.total === 0

  return (
    <li>
      <Link to={teamMemberPath(member.id)} className={`flex items-center gap-4 px-5 py-4 ${CLICKABLE_ROW}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900">{member.name}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {member.email}
            {member.team && ` · ${member.team}`}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {noEnrollments ? (
              <Badge tone="neutral">Sem treinamentos</Badge>
            ) : (
              <>
                {member.tally.overdue > 0 && (
                  <Badge tone="danger">{member.tally.overdue} atrasado(s)</Badge>
                )}
                {member.tally.inProgress > 0 && (
                  <Badge tone="info">{member.tally.inProgress} em andamento</Badge>
                )}
                {member.tally.notStarted > 0 && (
                  <Badge tone="neutral">{member.tally.notStarted} não iniciado(s)</Badge>
                )}
                {member.tally.completed > 0 && (
                  <Badge tone="success">{member.tally.completed} concluído(s)</Badge>
                )}
              </>
            )}
          </div>
        </div>

        <div className="hidden w-40 sm:block">
          <ProgressBar percentage={member.averageProgress} />
        </div>

        <ChevronRight className="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
      </Link>
    </li>
  )
}
