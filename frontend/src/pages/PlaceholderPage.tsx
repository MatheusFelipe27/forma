import { Card, CardBody, CardHeader } from '../components/Card'

/**
 * Marcador temporário das telas da Fase 9. Existe para a navegação e as rotas
 * protegidas serem testáveis antes das telas de conteúdo; cada uma será
 * substituída pelo pedaço correspondente.
 */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      </div>

      <Card>
        <CardHeader title="Em construção" description="Esta tela entra em um próximo pedaço." />
        <CardBody>
          <p className="text-sm text-neutral-500">
            A fundação (autenticação, layout e rotas protegidas) já está no lugar.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
