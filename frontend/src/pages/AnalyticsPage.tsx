import { useState, useEffect } from 'react'
import {
  BarChart2, Users, CheckCircle, Clock, TrendingUp,
  Activity, Phone, Award, Loader2
} from 'lucide-react'
import { analyticsApi } from '../api'
import clsx from 'clsx'

interface AgentStats {
  agent_id: string
  agent_name: string
  total_calls: number
  resolved_calls: number
  resolution_rate: number
  avg_duration_seconds: number
  avg_call_duration_formatted: string
}

interface SystemStats {
  active_sessions: number
  total_sessions_today: number
  total_agents: number
  avg_join_latency_ms: number
  error_rate: number
  resolution_rate: number
}

export default function AnalyticsPage() {
  const [myStats, setMyStats] = useState<AgentStats | null>(null)
  const [sysStats, setSysStats] = useState<SystemStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<AgentStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [me, sys, lb] = await Promise.all([
          analyticsApi.me(),
          analyticsApi.system(),
          analyticsApi.leaderboard(),
        ])
        setMyStats(me.data)
        setSysStats(sys.data)
        setLeaderboard(lb.data)
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 size={24} className="animate-spin mr-2" /> Loading analytics…
      </div>
    )
  }

  const resolutionPct = myStats ? Math.round(myStats.resolution_rate * 100) : 0
  const sysResolutionPct = sysStats ? Math.round(sysStats.resolution_rate * 100) : 0

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <BarChart2 size={20} className="text-indigo-400" />
        <h1 className="text-xl font-bold">Analytics</h1>
      </div>

      {/* My Performance */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">My Performance</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={<Phone size={16} />}
            label="Total Calls"
            value={String(myStats?.total_calls ?? 0)}
          />
          <MetricCard
            icon={<CheckCircle size={16} />}
            label="Resolved"
            value={String(myStats?.resolved_calls ?? 0)}
            sub={`${resolutionPct}% rate`}
            good={resolutionPct >= 80}
          />
          <MetricCard
            icon={<Clock size={16} />}
            label="Avg Duration"
            value={myStats?.avg_call_duration_formatted ?? '—'}
          />
          <MetricCard
            icon={<TrendingUp size={16} />}
            label="Resolution Rate"
            value={`${resolutionPct}%`}
            good={resolutionPct >= 80}
          />
        </div>

        {/* Resolution bar */}
        {myStats && myStats.total_calls > 0 && (
          <div className="card mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Issue Resolution</span>
              <span className={resolutionPct >= 80 ? 'text-green-400' : 'text-yellow-400'}>
                {myStats.resolved_calls} / {myStats.total_calls} calls
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all', resolutionPct >= 80 ? 'bg-green-500' : 'bg-yellow-500')}
                style={{ width: `${resolutionPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* System Stats */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">System Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard
            icon={<Activity size={16} className="text-green-400" />}
            label="Active Sessions"
            value={String(sysStats?.active_sessions ?? 0)}
          />
          <MetricCard
            icon={<Phone size={16} />}
            label="Sessions Today"
            value={String(sysStats?.total_sessions_today ?? 0)}
          />
          <MetricCard
            icon={<Users size={16} />}
            label="Active Agents"
            value={String(sysStats?.total_agents ?? 0)}
          />
          <MetricCard
            icon={<TrendingUp size={16} />}
            label="System Resolution"
            value={`${sysResolutionPct}%`}
            good={sysResolutionPct >= 80}
          />
          <MetricCard
            icon={<Activity size={16} />}
            label="Join Latency"
            value={`${sysStats?.avg_join_latency_ms ?? 0}ms`}
            sub="avg P99"
            good={(sysStats?.avg_join_latency_ms ?? 999) < 500}
          />
          <MetricCard
            icon={<CheckCircle size={16} />}
            label="Error Rate"
            value={`${((sysStats?.error_rate ?? 0) * 100).toFixed(2)}%`}
            good={(sysStats?.error_rate ?? 1) < 0.01}
          />
        </div>
      </section>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Award size={14} /> Agent Leaderboard
          </h2>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">#</th>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium">Agent</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium">Calls</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium">Resolved</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium">Rate</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((a, i) => (
                  <tr key={a.agent_id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={clsx(
                        'text-xs font-bold',
                        i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-600'
                      )}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm font-medium">{a.agent_name}</td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-400">{a.total_calls}</td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-400">{a.resolved_calls}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={clsx(
                        'text-xs font-semibold',
                        a.resolution_rate >= 0.8 ? 'text-green-400' : a.resolution_rate >= 0.6 ? 'text-yellow-400' : 'text-red-400'
                      )}>
                        {Math.round(a.resolution_rate * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">{a.avg_call_duration_formatted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {leaderboard.length === 0 && myStats?.total_calls === 0 && (
        <div className="card text-center py-12">
          <BarChart2 size={36} className="text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No call data yet. Start a session to see analytics.</p>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, sub, good }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  good?: boolean
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-gray-500 mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={clsx('text-2xl font-bold', good === true ? 'text-green-400' : good === false ? 'text-red-400' : 'text-white')}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}
