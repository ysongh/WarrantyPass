import { useParams } from 'react-router'

function TransferProductPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Transfer ownership
      </h1>
      <p className="mt-3 text-ink-muted text-pretty">
        Handing product <code className="text-ink">{id}</code> to a new owner
        will be built in a later phase.
      </p>
    </>
  )
}

export default TransferProductPage
