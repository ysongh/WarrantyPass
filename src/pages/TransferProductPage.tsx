import { useParams } from 'react-router'

function TransferProductPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Transfer ownership
      </h1>
      <p className="mt-3 max-w-2xl text-ink-muted text-pretty">
        Handing a product to its next owner will be built in a later phase. The
        receipt, warranty, and service history move with the item; the seller's
        personal details do not.
      </p>
      <p className="mt-6 text-sm text-ink-muted">
        Product ID: <code className="text-ink">{id}</code>
      </p>
    </>
  )
}

export default TransferProductPage
