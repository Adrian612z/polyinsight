import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import {
  LayoutDashboard,
  BarChart3,
  Users,
  FileSearch,
  CreditCard,
  Star,
  Settings,
  LogOut,
  Shield,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/growth', icon: BarChart3, label: '增长分析' },
  { to: '/users', icon: Users, label: '用户管理' },
  { to: '/analyses', icon: FileSearch, label: '分析记录' },
  { to: '/transactions', icon: CreditCard, label: '交易记录' },
  { to: '/featured', icon: Star, label: '推荐管理' },
  { to: '/settings', icon: Settings, label: '系统设置' },
]

export default function Layout() {
  const { user, logout } = useAuthStore()

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Shield className="w-7 h-7 text-indigo-400" />
            <div>
              <h1 className="text-lg font-bold">PolyInsight</h1>
              <p className="text-xs text-slate-400">管理后台</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <div className="px-3 py-2 text-sm text-slate-400 truncate">
            {user?.email}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
