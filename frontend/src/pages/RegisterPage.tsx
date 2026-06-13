import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { authApi } from '../api'
import { useAuthStore } from '../store'

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', team: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.register(form)
      const { access_token, agent } = res.data
      localStorage.setItem('token', access_token)
      setAuth(access_token, agent)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-xl mb-4">
            <Shield size={24} />
          </div>
          <h1 className="text-2xl font-bold">StreamSafe</h1>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-5">Create agent account</h2>
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full name</label>
              <input type="text" className="input" value={form.name} onChange={update('name')} placeholder="Jane Smith" required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={update('email')} placeholder="jane@company.com" required />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={form.password} onChange={update('password')} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <div>
              <label className="label">Team (optional)</label>
              <input type="text" className="input" value={form.team} onChange={update('team')} placeholder="Support Tier 2" />
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-500 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
