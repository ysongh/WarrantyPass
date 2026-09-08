import { useParams } from 'react-router'

function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Product details
      </h1>
      <p className="mt-3 text-ink-muted text-pretty">
        The WarrantyPass for product <code className="text-ink">{id}</code> will
        show its receipt, warranty status, and history here.
      </p>
    </>
  )
}

export default ProductDetailsPage
