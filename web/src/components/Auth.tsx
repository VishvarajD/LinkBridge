
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Link2, Mail, Lock } from 'lucide-react'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) throw error

        if (!data.session) {
          setMessage('Registration successful! Please check your email to confirm your account.')
        } else {
          setMessage('Account created successfully!')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-icon"><Link2 size={24} /></div>
          <span>Link<span className="brand-accent">Bridge</span></span>
        </div>

        <h1>{isLogin ? 'Welcome back!' : 'Create your account'}</h1>
        <p className="auth-subtitle">
          {isLogin
            ? 'Sign in to access your saved links.'
            : 'Start saving and organizing your links.'}
        </p>

        <form onSubmit={handleSubmit}>
          <label>Email address</label>
          <div className="auth-input">
            <Mail size={17} />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <label>Password</label>
          <div className="auth-input">
            <Lock size={17} />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <button className="primary-button auth-submit" disabled={loading}>
            {loading
              ? 'Please wait...'
              : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="auth-switch">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={() => {
            setIsLogin(!isLogin)
            setError('')
            setMessage('')
          }}>
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
