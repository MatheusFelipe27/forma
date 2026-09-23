import { Link } from 'react-router-dom'

import { useAuth } from '../auth/use-auth'
import { Card, CardBody } from '../components/Card'
import { landingPathFor } from '../routes/navigation'

export function ForbiddenPage() {
  const { user } = useAuth()

  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm font-semibold text-neutral-900">Sem permissão</p>
        <p className="max-w-sm text-sm text-neutral-500">
          Seu perfil não tem acesso a esta área. Se você precisa dela, fale com um gestor
          ou com o administrador.
        </p>
        {user && (
          <Link
            to={landingPathFor(user.role)}
            className="text-brand-700 mt-3 text-sm font-medium hover:underline"
          >
            Voltar ao início
          </Link>
        )}
      </CardBody>
    </Card>
  )
}
