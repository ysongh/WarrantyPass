import ButtonLink from '../components/ui/ButtonLink'

const steps = [
  'Add your product',
  'Track its warranty',
  'Transfer its history when you sell it',
]

function HomePage() {
  return (
    <>
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Keep the warranty with the product.
        </h1>
        <p className="mt-5 text-lg text-ink-muted text-pretty">
          Store your receipts, track warranty coverage, and keep a portable
          product history that can move with the item when you sell it.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/dashboard">View my products</ButtonLink>
          <ButtonLink to="/products/new" variant="secondary">
            Add product
          </ButtonLink>
        </div>
      </section>

      <section className="mt-16 sm:mt-20">
        <h2 className="text-sm font-medium tracking-wide text-ink-muted uppercase">
          How it works
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step}
              className="rounded-card border border-line bg-surface p-6"
            >
              <span className="font-semibold text-brand-600">{index + 1}</span>
              <p className="mt-2 font-medium text-pretty">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

export default HomePage
