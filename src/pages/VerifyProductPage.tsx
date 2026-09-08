import { useParams } from 'react-router'

function VerifyProductPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Verify product
      </h1>
      <p className="mt-3 text-ink-muted text-pretty">
        Public verification for product <code className="text-ink">{id}</code>{' '}
        will be built in a later phase. Only safe parts of a product's history
        will ever appear here.
      </p>
    </>
  )
}

export default VerifyProductPage
