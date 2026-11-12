import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  Link2, Plus, Search, Star, Trash2, ExternalLink,
  Copy, X, LogOut, LayoutDashboard,
} from 'lucide-react'

import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import './App.css'

type SavedLink = {
  id: string
  user_id: string
  title: string
  url: string
  category: string
  favorite: boolean
  created_at: string
  updated_at: string
}

type Tab = 'All links' | 'Favorites'

const getHost = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function Favicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="favicon" aria-hidden="true">
      {failed ? host.charAt(0).toUpperCase() : (
        <img
          src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [links, setLinks] = useState<SavedLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [savingLink, setSavingLink] = useState(false)

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('All links')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [toDelete, setToDelete] = useState<SavedLink | null>(null)
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const notify = useCallback((msg: string, error = false) => {
    window.clearTimeout(toastTimer.current)
    setToast({ msg, error })
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  // Auth session
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return
      if (error) console.error('Session error:', error.message)
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    let active = true

    const fetchLinks = async () => {
      if (!user) {
        setLinks([])
        setLinksLoading(false)
        return
      }
      setLinksLoading(true)
      const { data, error } = await supabase
        .from('links')
        .select('*')
        .order('created_at', { ascending: false })

      if (!active) return
      if (error) {
        console.error('Error fetching links:', error.message)
        notify('Could not load your links. Check your connection and refresh.', true)
      } else {
        setLinks((data ?? []) as SavedLink[])
      }
      setLinksLoading(false)
    }

    fetchLinks()
    return () => { active = false }
  }, [user, notify])

  // Realtime sync across devices
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`links-changes-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'links', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as SavedLink
            setLinks(prev => prev.some(l => l.id === row.id) ? prev : [row, ...prev])
          }
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as SavedLink
            setLinks(prev => prev.map(l => (l.id === row.id ? row : l)))
          }
          if (payload.eventType === 'DELETE') {
            const id = payload.old.id
            setLinks(prev => prev.filter(l => l.id !== id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  // Close modals with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowForm(false); setToDelete(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Stop the page behind a dialog from scrolling
  useEffect(() => {
    document.body.style.overflow = showForm || toDelete ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [showForm, toDelete])

  const favoriteCount = useMemo(() => links.filter(l => l.favorite).length, [links])

  const filteredLinks = useMemo(() => {
    const term = search.trim().toLowerCase()
    return links.filter(link => {
      const matchesSearch = !term ||
        link.title.toLowerCase().includes(term) ||
        link.url.toLowerCase().includes(term)
      const matchesTab = activeTab === 'All links' || link.favorite
      return matchesSearch && matchesTab
    })
  }, [links, search, activeTab])

  const closeForm = () => { setShowForm(false); setTitle(''); setUrl('') }

  const addLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || !user) return

    let formattedUrl = url.trim()
    if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = `https://${formattedUrl}`

    try {
      new URL(formattedUrl)
    } catch {
      notify('That doesn’t look like a valid URL.', true)
      return
    }

    setSavingLink(true)
    try {
      const { data, error } = await supabase
        .from('links')
        .insert({
          user_id: user.id,
          // Title is optional: fall back to the site name
          title: title.trim() || getHost(formattedUrl),
          url: formattedUrl,
          category: 'General',
          favorite: false,
        })
        .select()
        .single()

      if (error) {
        console.error('Error adding link:', error.message)
        notify('Could not save the link. Try again.', true)
        return
      }

      const row = data as SavedLink
      // Realtime may have delivered this row already, so avoid duplicates
      setLinks(prev => prev.some(l => l.id === row.id) ? prev : [row, ...prev])
      closeForm()
      notify('Link saved')
    } finally {
      setSavingLink(false)
    }
  }

  const toggleFavorite = async (link: SavedLink) => {
    const next = !link.favorite
    // Optimistic update
    setLinks(prev => prev.map(l => (l.id === link.id ? { ...l, favorite: next } : l)))

    const { error } = await supabase
      .from('links')
      .update({ favorite: next, updated_at: new Date().toISOString() })
      .eq('id', link.id)

    if (error) {
      console.error('Error updating favorite:', error.message)
      setLinks(prev => prev.map(l => (l.id === link.id ? { ...l, favorite: link.favorite } : l)))
      notify('Could not update favorite.', true)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    const target = toDelete
    setToDelete(null)

    const { error } = await supabase.from('links').delete().eq('id', target.id)
    if (error) {
      console.error('Error deleting link:', error.message)
      notify('Could not delete the link.', true)
      return
    }
    setLinks(prev => prev.filter(l => l.id !== target.id))
    notify('Link deleted')
  }

  const copyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      notify('Link copied')
    } catch {
      notify('Could not copy the link.', true)
    }
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) notify('Could not log out. Try again.', true)
  }

  if (authLoading) return <div className="auth-page">Loading LinkBridge…</div>
  if (!user) return <Auth />

  const initial = (user.email ?? 'U').charAt(0).toUpperCase()
  const isFavs = activeTab === 'Favorites'

  const searchBox = () => (
    <div className="search-box">
      <Search size={18} />
      <input
        type="search"
        placeholder="Search by title or URL"
        aria-label="Search links"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {search && (
        <button className="icon-btn" aria-label="Clear search" onClick={() => setSearch('')}>
          <X size={16} />
        </button>
      )}
    </div>
  )

  return (
    <div className="app-shell">
      {/* Sidebar (desktop / tablet) */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Link2 size={20} /></div>
          <span>Link<span className="brand-accent">Bridge</span></span>
        </div>

        <nav className="nav-list" aria-label="Collections">
          <button className={`nav-item ${!isFavs ? 'active' : ''}`} onClick={() => setActiveTab('All links')}>
            <LayoutDashboard size={18} /> All links
            <span className="nav-count">{links.length}</span>
          </button>
          <button className={`nav-item ${isFavs ? 'active' : ''}`} onClick={() => setActiveTab('Favorites')}>
            <Star size={18} /> Favorites
            <span className="nav-count">{favoriteCount}</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{initial}</div>
            <div className="profile-text">
              <strong>Signed in</strong>
              <small title={user.email ?? ''}>{user.email}</small>
            </div>
            <button className="icon-btn" title="Log out" aria-label="Log out" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          {searchBox()}
          <div className="topbar-spacer" />
          <button className="btn primary desktop-add" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Add link
          </button>
        </header>

        <section className="page-content">
          <div className="mobile-brand mobile-only">
            <div className="brand">
              <div className="brand-icon"><Link2 size={20} /></div>
              <span>Link<span className="brand-accent">Bridge</span></span>
            </div>
            <button className="icon-btn" title="Log out" aria-label="Log out" onClick={handleLogout}>
              <LogOut size={20} />
            </button>
          </div>

          <div className="page-head">
            <div>
              <h1>{isFavs ? 'Favorites' : 'All links'}</h1>
              <p>
                {filteredLinks.length} {filteredLinks.length === 1 ? 'link' : 'links'}
                {search.trim() ? ` matching “${search.trim()}”` : ''}
              </p>
            </div>
          </div>

          <div className="mobile-search mobile-only">{searchBox()}</div>

          <div className="links-list">
            {linksLoading && [0, 1, 2].map(i => <div className="skeleton" key={i} />)}

            {!linksLoading && filteredLinks.map(link => {
              const host = getHost(link.url)
              return (
                <article className="link-card" key={link.id}>
                  <Favicon host={host} />

                  <div className="link-details">
                    <a className="link-title" href={link.url} target="_blank" rel="noreferrer">
                      {link.title}
                    </a>
                    <div className="link-meta">{host} · {timeAgo(link.created_at)}</div>
                  </div>

                  <div className="link-actions">
                    <button
                      className={`icon-btn fav ${link.favorite ? 'on' : ''}`}
                      title={link.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      aria-label={link.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      aria-pressed={link.favorite}
                      onClick={() => toggleFavorite(link)}
                    >
                      <Star size={18} fill={link.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button className="icon-btn" title="Copy link" aria-label="Copy link" onClick={() => copyLink(link.url)}>
                      <Copy size={18} />
                    </button>
                    <a className="icon-btn" title="Open link" aria-label="Open link" href={link.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={18} />
                    </a>
                    <button className="icon-btn danger" title="Delete link" aria-label="Delete link" onClick={() => setToDelete(link)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              )
            })}

            {!linksLoading && filteredLinks.length === 0 && (
              <div className="empty-state">
                <Link2 size={32} />
                {search.trim() ? (
                  <>
                    <h3>No matches</h3>
                    <p>Try a different title or part of the URL.</p>
                  </>
                ) : isFavs ? (
                  <>
                    <h3>No favorites yet</h3>
                    <p>Tap the star on a link to pin it here.</p>
                  </>
                ) : (
                  <>
                    <h3>Save your first link</h3>
                    <p>Anything you save shows up on all your devices.</p>
                    <button className="btn primary desktop-add" onClick={() => setShowForm(true)}>
                      <Plus size={18} /> Add link
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="bottom-nav" aria-label="Collections">
        <button className={`nav-item ${!isFavs ? 'active' : ''}`} onClick={() => setActiveTab('All links')}>
          <LayoutDashboard size={20} /> All
        </button>
        <button className="fab" aria-label="Add link" onClick={() => setShowForm(true)}>
          <Plus size={26} />
        </button>
        <button className={`nav-item ${isFavs ? 'active' : ''}`} onClick={() => setActiveTab('Favorites')}>
          <Star size={20} /> Favorites
        </button>
      </nav>

      {/* Add link modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <form className="link-modal" onSubmit={addLink} onClick={e => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Add a link</h2>
                <p>Paste a URL. The title is optional.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={closeForm}>
                <X size={20} />
              </button>
            </div>

            <label htmlFor="link-url">URL</label>
            <input
              id="link-url"
              autoFocus={window.matchMedia('(min-width: 821px)').matches}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="example.com/article"
              required
            />

            <label htmlFor="link-title">Title</label>
            <input
              id="link-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Defaults to the site name"
            />

            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={closeForm}>Cancel</button>
              <button type="submit" className="btn primary" disabled={savingLink}>
                {savingLink ? 'Saving…' : 'Save link'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {toDelete && (
        <div className="modal-backdrop" onClick={() => setToDelete(null)}>
          <div className="link-modal" role="alertdialog" aria-labelledby="del-title" onClick={e => e.stopPropagation()}>
            <h2 id="del-title" style={{ fontSize: 20 }}>Delete this link?</h2>
            <p style={{ color: 'var(--muted)' }}>
              “{toDelete.title}” will be removed from all your devices.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setToDelete(null)}>Cancel</button>
              <button className="btn danger" onClick={confirmDelete}>Delete link</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default App