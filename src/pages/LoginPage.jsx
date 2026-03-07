import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function LoginPage() {
  const { signInWithEmail } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fromPath = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    const { error } = await signInWithEmail({ email, password })

    if (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
      return
    }

    navigate(fromPath, { replace: true })
  }

  return (
    <div className="grid min-h-screen bg-slate-100 md:grid-cols-[1.2fr_1fr]">
      <div className="hidden bg-slate-900 p-10 text-slate-100 md:block">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Company Procurement
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">
          ProcureFlow
          <br />
          Internal Portal
        </h1>
        <p className="mt-4 max-w-md text-sm text-slate-300">
          Submit, track, and approve purchase requests in one secure internal
          system.
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Sign In</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with your company email and password.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Work Email
              </label>
              <input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                type="password"
                placeholder="********"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                required
              />
            </div>

            {errorMessage ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="block w-full rounded-md bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500">
            Use an email/password account that exists in your Supabase project.
          </p>

          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Need access? Contact Procurement Systems Team.
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
