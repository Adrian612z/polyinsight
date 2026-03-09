import React from 'react'
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { LayoutDashboard, Users, BarChart3 } from 'lucide-react'
import clsx from 'clsx'

const adminNavItems = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
  { label: 'Users', path: '/admin/users', icon: Users },
  { label: 'Analyses', path: '/admin/analyses', icon: BarChart3 },
]

export const AdminLayout: React.FC = () => {
  const { role } = useAuthStore()
  const location = useLocation()

  if (role !== 'admin') {
    return <Navigate to="/analyze" replace />
  }

  return (
    <div className="flex gap-8">
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0">
        <nav className="space-y-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-terracotta/10 text-terracotta'
                    : 'text-charcoal/50 hover:text-charcoal hover:bg-charcoal/5'
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
