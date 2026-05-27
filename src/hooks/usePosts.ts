import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Post } from '../types'

export function usePosts() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPosts()
  }, [])

  async function fetchPosts() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('is_published', true)
      .order('order_index', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      setPosts(data ?? [])
    }
    setLoading(false)
  }

  return { posts, loading, error, refetch: fetchPosts }
}
