import { Link } from 'react-router'

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
      <Link
        to="/"
        className="mt-6 inline-block rounded-card bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
      >
        Go home
      </Link>
    </>
  )
}

export default NotFoundPage
