import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Settings as SettingsIcon, DollarSign, Gift, Percent, Webhook } from 'lucide-react'

interface SettingsData {
  analysisCost: number
  signupBonus: number
  referralCommissionRate: number
  n8nWebhookUrl: string
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.settings().then(setSettings).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  const items = settings ? [
    {
      icon: DollarSign,
      label: '分析费用',
      value: `${(settings.analysisCost / 100).toFixed(2)} 积分`,
      desc: '每次分析消耗的积分数量',
      color: 'bg-indigo-100 text-indigo-600',
    },
    {
      icon: Gift,
      label: '注册奖励',
      value: `${(settings.signupBonus / 100).toFixed(2)} 积分`,
      desc: '新用户注册时获得的积分',
      color: 'bg-emerald-100 text-emerald-600',
    },
    {
      icon: Percent,
      label: '推荐佣金率',
      value: `${(settings.referralCommissionRate * 100).toFixed(0)}%`,
      desc: '推荐用户消费时的佣金比例',
      color: 'bg-purple-100 text-purple-600',
    },
    {
      icon: Webhook,
      label: 'n8n Webhook URL',
      value: settings.n8nWebhookUrl,
      desc: '分析工作流 webhook 地址',
      color: 'bg-amber-100 text-amber-600',
    },
  ] : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
        {items.map(({ icon: Icon, label, value, desc, color }) => (
          <div key={label} className="flex items-center gap-4 p-5">
            <div className={`p-2.5 rounded-lg ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{label}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
            <div className="text-sm font-mono text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg max-w-sm truncate">
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-xl border border-blue-100 p-5 text-sm text-blue-700">
        以上设置在服务端 .env 文件中配置，修改后需要重启服务生效。
      </div>
    </div>
  )
}
