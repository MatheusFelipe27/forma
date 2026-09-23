import { Link } from 'react-router-dom'

import { useAuth } from '../auth/use-auth'
import { Card, CardBody } from '../components/Card'
import { landingPathFor, PATHS } from '../routes/navigation'

export function NotFoundPage() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardBody className="flex flex-col items-center gap-2 py-14 text-center">
          <p className="text-sm font-semibold text-neutral-900">Página não encontrada</p>
          <p className="text-sm text-neutral-500">
            O endereço acessado não existe ou foi movido.
          </p>
          <Link
            to={user ? landingPathFor(user.role) : PATHS.login}
            className="text-brand-700 mt-3 text-sm font-medium hover:underline"
          >
            {user ? 'Voltar ao início' : 'Ir para o login'}
          </Link>
        </CardBody>
      </Card>
    </div>
  )
}
