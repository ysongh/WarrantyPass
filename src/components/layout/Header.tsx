import { Link, NavLink } from 'react-router'

const navLinks = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/products/new', label: 'Add product' },
  { to: '/settings', label: 'Settings' },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  const base = 'rounded-card px-3 py-2 transition-colors'
  return isActive
    ? `${base} font-medium text-ink`
    : `${base} text-ink-muted hover:bg-canvas hover:text-ink`
}

function Header() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <Link
          to="/"
          className="text-lg font-semibold tracking-tight text-ink sm:text-xl"
        >
          WarrantyPass
        </Link>

        <div className="flex items-center gap-1 text-sm">
          <nav aria-label="Main" className="flex items-center gap-1">
            {navLinks.map(({ to, label }) => (
              <NavLink key={to} to={to} className={navLinkClass}>
                {label}
              </NavLink>
            ))}
          </nav>
          {/* The wallet connect button is added here in a later step. */}
        </div>
      </div>
    </header>
  )
}

export default Header
