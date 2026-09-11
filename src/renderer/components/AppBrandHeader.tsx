import { Link } from 'react-router-dom'
import logoUrl from '../../assets/logo.png'

export function AppBrandHeader() {
  return (
    <header className="app-brand-header">
      <Link to="/" className="app-brand-logo" aria-label="Indie Forge — all projects">
        <img src={logoUrl} alt="Indie Forge" className="app-brand-logo-img" />
      </Link>
    </header>
  )
}
