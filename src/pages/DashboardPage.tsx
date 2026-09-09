import ButtonLink from '../components/ui/ButtonLink'

function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        My WarrantyPasses
      </h1>

      <div className="mt-8 rounded-card border border-line bg-surface p-8 text-center sm:p-12">
        <p className="text-ink-muted text-pretty">
          You haven't added any products yet.
        </p>
        <ButtonLink to="/products/new" className="mt-6">
          Add your first product
        </ButtonLink>
      </div>
    </>
  )
}

export default DashboardPage
