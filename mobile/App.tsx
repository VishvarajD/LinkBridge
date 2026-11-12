import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { Session } from '@supabase/supabase-js'
import { supabase } from './src/lib/supabase'
import Auth from './src/components/Auth'

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

type LinkFilter = 'all' | 'favorites'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [links, setLinks] = useState<SavedLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)

  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState<LinkFilter>('all')

  const [modalVisible, setModalVisible] = useState(false)
  const [editingLink, setEditingLink] = useState<SavedLink | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  // Authentication
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) console.error(error.message)
      setSession(data.session)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Fetch links and subscribe to real-time changes
  useEffect(() => {
    if (!session?.user.id) {
      setLinks([])
      return
    }

    let active = true
    const userId = session.user.id

    async function loadLinks() {
      setLinksLoading(true)

      const { data, error } = await supabase
        .from('links')
        .select('*')
        .order('created_at', { ascending: false })

      if (!active) return

      if (error) {
        console.error('Loading links:', error.message)
      } else {
        setLinks((data || []) as SavedLink[])
      }

      setLinksLoading(false)
    }

    const channel = supabase
      .channel(`mobile-links-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'links',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!active) return

          if (payload.eventType === 'INSERT') {
            const newLink = payload.new as SavedLink
            setLinks((prev) => {
              if (prev.some((link) => link.id === newLink.id)) return prev
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
            if (deletedId) {
              setLinks((prev) => prev.filter((link) => link.id !== deletedId))
            } else {
              loadLinks()
            }
          }
        }
      )
      .subscribe()

    loadLinks()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [session?.user.id])

  // Search and favorites filter
  const filteredLinks = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    return links.filter((link) => {
      const matchesFilter = activeFilter === 'all' || link.favorite
      const matchesSearch =
        !query ||
        link.title.toLowerCase().includes(query) ||
        link.url.toLowerCase().includes(query) ||
        (link.category || 'General').toLowerCase().includes(query)

      return matchesFilter && matchesSearch
    })
  }, [links, searchText, activeFilter])

  // Open a saved link in the device browser
  const handleOpenLink = async (link: SavedLink) => {
    try {
      const parsedUrl = new URL(link.url)

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS links can be opened.')
      }

      const supported = await Linking.canOpenURL(parsedUrl.toString())
      if (!supported) {
        Alert.alert('Unable to open link', 'This URL cannot be opened on your device.')
        return
      }

      await Linking.openURL(parsedUrl.toString())
    } catch (error) {
      Alert.alert(
        'Unable to open link',
        error instanceof Error ? error.message : 'Please check the saved URL.'
      )
    }
  }

  // Validate and normalize a URL before saving
  const getNormalizedUrl = (value: string) => {
    let normalizedUrl = value.trim()

    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`
    }

    const parsedUrl = new URL(normalizedUrl)

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS links are supported.')
    }

    return parsedUrl.toString()
  }

  // Open the form in edit mode with the selected link's current values
  const handleStartEdit = (item: SavedLink) => {
    setEditingLink(item)
    setTitle(item.title)
    setUrl(item.url)
    setModalVisible(true)
  }

  // Open the form in add mode
  const handleStartAdd = () => {
    setEditingLink(null)
    setTitle('')
    setUrl('')
    setModalVisible(true)
  }

  const handleCloseModal = () => {
    if (saving) return
    setModalVisible(false)
    setEditingLink(null)
    setTitle('')
    setUrl('')
  }

  // Save a new link or update the selected existing link
  const handleSaveLink = async () => {
    if (!title.trim() || !url.trim()) {
      Alert.alert('Missing details', 'Please enter a title and URL.')
      return
    }

    let normalizedUrl: string

    try {
      normalizedUrl = getNormalizedUrl(url)
    } catch {
      Alert.alert('Invalid URL', 'Please enter a valid website URL.')
      return
    }

    if (!session?.user.id) return

    setSaving(true)

    try {
      if (editingLink) {
        const { data, error } = await supabase
          .from('links')
          .update({
            title: title.trim(),
            url: normalizedUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingLink.id)
          .eq('user_id', session.user.id)
          .select()
          .single()

        if (error) throw error

        setLinks((prev) =>
          prev.map((link) =>
            link.id === editingLink.id ? (data as SavedLink) : link
          )
        )

        Alert.alert('Updated', 'Your link has been updated successfully.')
      } else {
        const { data, error } = await supabase
          .from('links')
          .insert({
            user_id: session.user.id,
            title: title.trim(),
            url: normalizedUrl,
            category: 'General',
            favorite: false,
          })
          .select()
          .single()

        if (error) throw error

        setLinks((prev) => {
          if (prev.some((link) => link.id === data.id)) return prev
          return [data as SavedLink, ...prev]
        })

        Alert.alert('Success', 'Your link has been saved!')
      }

      setModalVisible(false)
      setEditingLink(null)
      setTitle('')
      setUrl('')
    } catch (error) {
      Alert.alert(
        editingLink ? 'Unable to update link' : 'Unable to save link',
        error instanceof Error ? error.message : 'Something went wrong.'
      )
    } finally {
      setSaving(false)
    }
  }

  // Toggle favorite
  const handleFavorite = async (item: SavedLink) => {
    const newFavorite = !item.favorite

    const { data, error } = await supabase
      .from('links')
      .update({
        favorite: newFavorite,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .select()
      .single()

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setLinks((prev) =>
      prev.map((link) => (link.id === item.id ? (data as SavedLink) : link))
    )
  }

  // Delete link
  const handleDelete = (item: SavedLink) => {
    Alert.alert(
      'Delete link',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('links')
              .delete()
              .eq('id', item.id)

            if (error) {
              Alert.alert('Delete failed', error.message)
              return
            }

            setLinks((prev) => prev.filter((link) => link.id !== item.id))
          },
        },
      ]
    )
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Logout failed', error.message)
  }

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C8CFF" />
      </View>
    )
  }

  if (!session) return <Auth />

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>
          Link<Text style={styles.accent}>Bridge</Text>
        </Text>
        <Pressable onPress={handleLogout}>
          <Text style={styles.logout}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.welcome}>
        <Text style={styles.heading}>My Links</Text>
        <Text style={styles.email}>{session.user.email}</Text>
        <Text style={styles.count}>
          {links.length} saved {links.length === 1 ? 'link' : 'links'}
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Text style={styles.sectionTitle}>Your collection</Text>
        <Pressable style={styles.addButton} onPress={handleStartAdd}>
          <Text style={styles.addButtonText}>+ Add Link</Text>
        </Pressable>
      </View>

      <View style={styles.toolsContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search title or URL..."
          placeholderTextColor="#8993A4"
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        <View style={styles.filterRow}>
          <Pressable
            style={[
              styles.filterButton,
              activeFilter === 'all' && styles.activeFilterButton,
            ]}
            onPress={() => setActiveFilter('all')}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === 'all' && styles.activeFilterText,
              ]}
            >
              All Links ({links.length})
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.filterButton,
              activeFilter === 'favorites' && styles.activeFilterButton,
            ]}
            onPress={() => setActiveFilter('favorites')}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === 'favorites' && styles.activeFilterText,
              ]}
            >
              Favorites ({links.filter((link) => link.favorite).length})
            </Text>
          </Pressable>
        </View>
      </View>

      {linksLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6C8CFF" />
          <Text style={styles.loadingText}>Loading your links...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLinks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {links.length === 0 ? 'No links yet' : 'No matching links'}
              </Text>
              <Text style={styles.emptyText}>
                {links.length === 0
                  ? 'Tap Add Link to save your first link.'
                  : 'Try another search or change the selected filter.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.linkCard}>
              <View style={styles.cardTop}>
                <Pressable
                  style={styles.titlePressable}
                  onPress={() => handleOpenLink(item)}
                >
                  <Text style={styles.linkTitle}>{item.title}</Text>
                </Pressable>

                <Pressable
                  onPress={() => handleFavorite(item)}
                  style={styles.iconButton}
                >
                  <Text style={styles.favorite}>
                    {item.favorite ? '★' : '☆'}
                  </Text>
                </Pressable>
              </View>

              <Pressable onPress={() => handleOpenLink(item)}>
                <Text style={styles.url} numberOfLines={2}>
                  {item.url}
                </Text>
                <Text style={styles.openHint}>Tap to open link</Text>
              </Pressable>

              <View style={styles.cardBottom}>
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => handleStartEdit(item)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleDelete(item)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Add/Edit Link Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingLink ? 'Edit Link' : 'Add New Link'}
            </Text>

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter link title"
              placeholderTextColor="#8993A4"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com"
              placeholderTextColor="#8993A4"
              autoCapitalize="none"
              keyboardType="url"
              value={url}
              onChangeText={setUrl}
            />

            <Pressable
              style={[styles.saveButton, saving && styles.disabledButton]}
              onPress={handleSaveLink}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {editingLink ? 'Update Link' : 'Save Link'}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={handleCloseModal}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101828',
  },
  center: {
    flex: 1,
    backgroundColor: '#101828',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 22,
    paddingTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#263348',
  },
  logo: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  accent: {
    color: '#6C8CFF',
  },
  logout: {
    color: '#FF8080',
    fontSize: 15,
    fontWeight: '600',
  },
  welcome: {
    padding: 22,
    paddingBottom: 12,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
  },
  email: {
    color: '#A0AEC0',
    marginTop: 8,
  },
  count: {
    color: '#6C8CFF',
    marginTop: 12,
    fontWeight: '600',
  },
  actionRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#5578F5',
    borderRadius: 9,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  toolsContainer: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  searchInput: {
    backgroundColor: '#1C2638',
    borderWidth: 1,
    borderColor: '#344054',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#FFFFFF',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  filterButton: {
    borderWidth: 1,
    borderColor: '#344054',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  activeFilterButton: {
    backgroundColor: '#293B5B',
    borderColor: '#6C8CFF',
  },
  filterText: {
    color: '#A0AEC0',
    fontSize: 13,
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    flexGrow: 1,
  },
  linkCard: {
    backgroundColor: '#1C2638',
    borderRadius: 14,
    padding: 17,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#344054',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titlePressable: {
    flex: 1,
  },
  linkTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  iconButton: {
    paddingHorizontal: 8,
  },
  favorite: {
    color: '#FBBF24',
    fontSize: 25,
  },
  url: {
    color: '#91A5C9',
    fontSize: 13,
    marginTop: 10,
  },
  openHint: {
    color: '#6C8CFF',
    fontSize: 11,
    marginTop: 5,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 14,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    padding: 5,
  },
  editText: {
    color: '#8EB4FF',
    fontWeight: '600',
  },
  deleteText: {
    color: '#FF8080',
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#A0AEC0',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  loadingText: {
    color: '#A0AEC0',
    marginTop: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: {
    backgroundColor: '#1C2638',
    borderRadius: 18,
    padding: 22,
  },
  modalTitle: {
    fontSize: 23,
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 13,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#101828',
    borderWidth: 1,
    borderColor: '#344054',
    borderRadius: 10,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: '#5578F5',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButton: {
    padding: 13,
    alignItems: 'center',
    marginTop: 5,
  },
  cancelText: {
    color: '#A0AEC0',
    fontWeight: '600',
  },
})
