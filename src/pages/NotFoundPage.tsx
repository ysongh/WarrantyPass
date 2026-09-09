import ButtonLink from '../components/ui/ButtonLink'

function NotFoundPage() {
  return (
    <>
      <p className="font-medium text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        Page not found
      </h1>
      <p className="mt-3 text-ink-muted text-pretty">
        That page doesn't exist. Check the address, or head back to the start.
      </p>
      <ButtonLink to="/" className="mt-6">
        Go home
      </ButtonLink>
    </>
  )
}

export default NotFoundPage
