import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Card, CardBody, CardHeader } from '../components/Card'
import { useToast } from '../components/toast/use-toast'
import { TrainingForm } from '../features/trainings/TrainingForm'
import { createTraining } from '../features/trainings/trainings.api'
import { apiErrorMessage } from '../lib/api'
import { PATHS, trainingManagePath } from '../routes/navigation'

export function TrainingCreatePage() {
  const navigate = useNavigate()
  const { show } = useToast()

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={PATHS.trainings}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Gerenciar Treinamentos
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Novo treinamento
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ele nasce como rascunho. Só depois de adicionar módulos é possível publicar.
        </p>
      </div>

      <Card>
        <CardHeader title="Dados do treinamento" />
        <CardBody>
          <TrainingForm
            submitLabel="Criar rascunho"
            onCancel={() => void navigate(PATHS.trainings)}
            onSubmit={async (input) => {
              try {
                const created = await createTraining(input)

                show('success', 'Rascunho criado. Agora adicione os módulos.')
                void navigate(trainingManagePath(created.id), { replace: true })
              } catch (error) {
                show('error', apiErrorMessage(error, 'Não foi possível criar o treinamento.'))
              }
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
