
import { useMemo, useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'

import {
  Link2, Plus, Search, Star, Trash2, ExternalLink,
  Globe, Code2, BookOpen, Smartphone, Laptop,
  LayoutDashboard, Heart, Copy, X
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

function App() {
  // Authentication state
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Links state
  const [links, setLinks] = useState<SavedLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [savingLink, setSavingLink] = useState(false)

  // Dashboard state
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('All Links')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')


useEffect(() => {
  if (!user) return

  const channel = supabase
    .channel(`links-changes-${user.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'links',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          const newLink = payload.new as SavedLink

          setLinks((prev) => {
            if (prev.some((link) => link.id === newLink.id)) {
              return prev
            }

            return [newLink, ...prev]
          })
        }

        if (payload.eventType === 'UPDATE') {
          const updatedLink = payload.new as SavedLink

          setLinks((prev) =>
            prev.map((link) =>
              link.id === updatedLink.id ? updatedLink : link
            )
          )
        }

        if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id

          setLinks((prev) =>
            prev.filter((link) => link.id !== deletedId)
          )
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [user])


  // Get authenticated user session
  useEffect(() => {
    let mounted = true

    const getSession = async () => {
      const { data: { session }, error } =
        await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        console.error('Session error:', error.message)
      }

      setUser(session?.user ?? null)
      setAuthLoading(false)
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    getSession()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Fetch links belonging to the logged-in user
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
        alert('Unable to load your links: ' + error.message)
      } else {
        setLinks((data ?? []) as SavedLink[])
      }

      setLinksLoading(false)
    }

    fetchLinks()

    return () => {
      active = false
    }
  }, [user])

  // Filter links by search and selected tab
  const filteredLinks = useMemo(() => {
    return links.filter(link => {
      const searchTerm = search.toLowerCase()

      const matchesSearch =
        link.title.toLowerCase().includes(searchTerm) ||
        link.url.toLowerCase().includes(searchTerm)

      const matchesTab =
        activeTab === 'All Links' ||
        (activeTab === 'Favorites' && link.favorite)

      return matchesSearch && matchesTab
    })
  }, [links, search, activeTab])

  // Add new link to Supabase
  const addLink = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !url.trim() || !user) return

    let formattedUrl = url.trim()

    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`
    }

    try {
      new URL(formattedUrl)
    } catch {
      alert('Please enter a valid URL.')
      return
    }

    setSavingLink(true)

    try {
      const { data, error } = await supabase
        .from('links')
        .insert({
          user_id: user.id,
          title: title.trim(),
          url: formattedUrl,
          category: 'General',
          favorite: false,
        })
        .select()
        .single()

      if (error) {
        console.error('Error adding link:', error.message)
        alert('Unable to save link: ' + error.message)
        return
      }

      setLinks(prev => [data as SavedLink, ...prev])

      setTitle('')
      setUrl('')
      setShowForm(false)
    } finally {
      setSavingLink(false)
    }
  }

  // Toggle favorite in Supabase
  const toggleFavorite = async (id: string) => {
    const link = links.find(item => item.id === id)

    if (!link) return

    const { data, error } = await supabase
      .from('links')
      .update({
        favorite: !link.favorite,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating favorite:', error.message)
      alert('Unable to update favorite: ' + error.message)
      return
    }

    setLinks(prev =>
      prev.map(item =>
        item.id === id ? data as SavedLink : item
      )
    )
  }

  // Delete link from Supabase
  const deleteLink = async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this link?'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('links')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting link:', error.message)
      alert('Unable to delete link: ' + error.message)
      return
    }

    setLinks(prev => prev.filter(link => link.id !== id))
  }

  // Copy URL
  const copyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      alert('Link copied!')
    } catch {
      alert('Could not copy link.')
    }
  }

  // Logout
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Logout error:', error.message)
      alert('Unable to logout: ' + error.message)
    }
  }

  // Authentication loading screen
  if (authLoading) {
    return (
      <div className="auth-page">
        Loading LinkBridge...
      </div>
    )
  }

  // Show authentication screen when logged out
  if (!user) {
    return <Auth />
  }

  // Main dashboard
  return (
    <div className="app-shell">

      {/* Sidebar */}
      <aside className="sidebar">

        <div className="brand">
          <div className="brand-icon">
            <Link2 size={23} />
          </div>

          <span>
            Link<span className="brand-accent">Bridge</span>
          </span>
        </div>

        <div className="sidebar-label">
          WORKSPACE
        </div>

        <nav>
          <button
            className={`nav-item ${
              activeTab === 'All Links' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('All Links')}
          >
            <LayoutDashboard size={18} />
            All Links
            <span className="nav-count">
              {links.length}
            </span>
          </button>

          <button
            className={`nav-item ${
              activeTab === 'Favorites' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('Favorites')}
          >
            <Heart size={18} />
            Favorites
          </button>
        </nav>

        <div className="sidebar-bottom">

          <div className="sync-card">
            <div className="sync-icon">
              <Globe size={19} />
            </div>

            <strong>Access everywhere</strong>

            <p>
              Your links are securely stored in the cloud
              and available across your devices.
            </p>
          </div>

          <div className="profile">
            <div className="avatar">LB</div>

            <div>
              <strong>My Workspace</strong>
              <small>{user.email}</small>
            </div>
          </div>

        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">

        <header className="topbar">

          <div className="breadcrumb">
            Workspace <span>/</span> {activeTab}
          </div>

          <div className="device-status">
            <span className="status-dot" />
            Cloud connected

            <button
              className="primary-button"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>

        </header>

        <section className="page-content">

          {/* Welcome section */}
          <div className="welcome-row">

            <div>
              <div className="eyebrow">
                YOUR PERSONAL LINK MANAGER
              </div>

              <h1>
                {activeTab === 'All Links'
                  ? 'Your links, one place.'
                  : 'Your favorites.'}
              </h1>

              <p className="subtitle">
                Save it once. Access it anywhere.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => setShowForm(true)}
            >
              <Plus size={18} />
              Add new link
            </button>

          </div>

          {/* Statistics */}
          <div className="stats-grid">

            <div className="stat-card">
              <div className="stat-icon blue">
                <Link2 size={20} />
              </div>

              <div>
                <span>Total links</span>
                <strong>{links.length}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon yellow">
                <Star size={20} />
              </div>

              <div>
                <span>Favorites</span>
                <strong>
                  {links.filter(link => link.favorite).length}
                </strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <Smartphone size={20} />
              </div>

              <div>
                <span>Connected devices</span>
                <strong>1</strong>
              </div>
            </div>

          </div>

          {/* Links section */}
          <div className="section-heading">

            <div>
              <h2>{activeTab}</h2>

              <p>
                {filteredLinks.length} saved{' '}
                {filteredLinks.length === 1 ? 'link' : 'links'}
              </p>
            </div>

            <div className="search-box">
              <Search size={17} />

              <input
                placeholder="Search your links..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              {search && (
                <button onClick={() => setSearch('')}>
                  <X size={15} />
                </button>
              )}
            </div>

          </div>

          {/* Links list */}
          <div className="links-list">

            {linksLoading && (
              <div className="empty-state">
                Loading your links...
              </div>
            )}

            {!linksLoading && filteredLinks.map(link => (

              <article className="link-card" key={link.id}>

                <div className="link-type-icon">
                  {link.category === 'Development'
                    ? <Code2 size={21} />
                    : link.category === 'Learning'
                      ? <BookOpen size={21} />
                      : <Globe size={21} />}
                </div>

                <div className="link-details">

                  <h3>{link.title}</h3>

                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.url}
                  </a>

                  <span className="category-tag">
                    {link.category}
                  </span>

                </div>

                <div className="link-actions">

                  <button
                    title="Copy link"
                    onClick={() => copyLink(link.url)}
                  >
                    <Copy size={17} />
                  </button>

                  <button
                    title="Favorite"
                    className={
                      link.favorite
                        ? 'favorite selected'
                        : 'favorite'
                    }
                    onClick={() => toggleFavorite(link.id)}
                  >
                    <Star
                      size={18}
                      fill={
                        link.favorite
                          ? 'currentColor'
                          : 'none'
                      }
                    />
                  </button>

                  <a
                    title="Open link"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={18} />
                  </a>

                  <button
                    title="Delete link"
                    onClick={() => deleteLink(link.id)}
                  >
                    <Trash2 size={18} />
                  </button>

                </div>

              </article>

            ))}

            {!linksLoading && filteredLinks.length === 0 && (
              <div className="empty-state">

                <Link2 size={32} />

                <h3>No links found</h3>

                <p>
                  Try another search or add your first link.
                </p>

              </div>
            )}

          </div>

          <div className="preview-note">
            <Laptop size={17} />

            <span>
              Your links are securely synced with Supabase.
            </span>
          </div>

        </section>
      </main>

      {/* Add link modal */}
      {showForm && (

        <div
          className="modal-backdrop"
          onClick={() => setShowForm(false)}
        >

          <form
            className="link-modal"
            onSubmit={addLink}
            onClick={e => e.stopPropagation()}
          >

            <div className="modal-heading">

              <div>
                <h2>Add a new link</h2>

                <p>
                  Save a URL to your LinkBridge collection.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
              >
                <X size={20} />
              </button>

            </div>

            <label>Link title</label>

            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. My favourite website"
              required
            />

            <label>URL</label>

            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />

            <button
              className="primary-button modal-submit"
              type="submit"
              disabled={savingLink}
            >
              <Plus size={17} />

              {savingLink ? 'Saving...' : 'Save link'}
            </button>

          </form>

        </div>

      )}

    </div>
  )
}

export default App
