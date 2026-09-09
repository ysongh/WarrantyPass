function VerifyProductPage() {
  /*
   * Still a placeholder, and deliberately so.
   *
   * Making this page work by loosening row-level security — adding an `anon`
   * read policy on `products`, say — would expose serial numbers, prices and
   * retailers to anyone who could guess a URL. Public verification needs its
   * own model: an explicit projection of the few fields that are safe to show,
   * keyed by the opaque `public_id`. That is a later phase.
   *
   * Until then this page reads nothing from the database, and does not echo
   * the id back either.
   */
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Verify product
      </h1>
      <p className="mt-3 max-w-2xl text-ink-muted text-pretty">
        This page will be public, so a buyer can check a product before paying
        for it. It will show only the safe parts of a product's history — never
        the owner's personal information, serial number, or receipt.
      </p>
      <p className="mt-3 max-w-2xl text-ink-muted text-pretty">
        Verification isn't available yet. Nothing about a product is publicly
        readable until it is built.
      </p>
    </>
  )
}

export default VerifyProductPage
