import { Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from '../auth/use-auth'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Logo } from '../components/Logo'
import { Spinner } from '../components/Spinner'
import { apiErrorCode, apiErrorMessage } from '../lib/api'
import { landingPathFor } from '../routes/navigation'

const loginSchema = z.object({
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe sua senha'),
})

type FieldErrors = Partial<Record<'email' | 'password', string>>

export function LoginPage() {
  const { status, user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)

  if (status === 'restoring') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-400">
        <Spinner size="lg" />
      </div>
    )
  }

  if (user) {
    return <Navigate to={landingPathFor(user.role)} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (submitting) {
      return
    }

    setFormError(null)

    const parsed = loginSchema.safeParse({ email, password })

    if (!parsed.success) {
      const errors: FieldErrors = {}

      for (const issue of parsed.error.issues) {
        const field = issue.path.at(0)

        if ((field === 'email' || field === 'password') && !errors[field]) {
          errors[field] = issue.message
        }
      }

      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setSubmitting(true)

    try {
      const logged = await login(parsed.data.email, parsed.data.password)
      const from = (location.state as { from?: string } | null)?.from

      navigate(from ?? landingPathFor(logged.role), { replace: true })
    } catch (error) {
      // Mensagem genérica de propósito: distinguir "e-mail não existe" de "senha
      // errada" permitiria descobrir quem tem conta. O backend já responde igual
      // nos dois casos, e a tela mantém o mesmo cuidado.
      setFormError(
        apiErrorCode(error) === 'INVALID_CREDENTIALS'
          ? 'E-mail ou senha inválidos.'
          : apiErrorMessage(error, 'Não foi possível entrar. Tente novamente.'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size="lg" />
          <p className="text-sm text-neutral-500">
            Plataforma de treinamentos corporativos
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 ring-1 ring-neutral-200 ring-inset">
          <h1 className="text-base font-semibold text-neutral-900">Entrar</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Use as credenciais fornecidas pela sua empresa.
          </p>

          <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-4">
            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
              required
            />

            <Input
              label="Senha"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
              required
              action={{
                label: passwordVisible ? 'Ocultar senha' : 'Mostrar senha',
                pressed: passwordVisible,
                onClick: () => setPasswordVisible((visible) => !visible),
                icon: passwordVisible ? (
                  <EyeOff className="size-[18px]" aria-hidden="true" />
                ) : (
                  <Eye className="size-[18px]" aria-hidden="true" />
                ),
              }}
            />

            {formError && (
              <p
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200 ring-inset"
              >
                {formError}
              </p>
            )}

            <Button type="submit" loading={submitting} className="mt-1 w-full">
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          Esqueceu a senha? Procure o administrador do sistema.
        </p>
      </div>
    </div>
  )
}
