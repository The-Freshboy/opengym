const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'])
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function youtubeId(value) {
  if (!value || typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname.toLowerCase())) return null
    const host = url.hostname.toLowerCase()
    let id = null
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0]
    else if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const parts = url.pathname.split('/').filter(Boolean)
      if (['embed', 'shorts', 'live'].includes(parts[0])) id = parts[1]
    }
    return VIDEO_ID.test(id || '') ? id : null
  } catch { return null }
}

export const canonicalYouTubeUrl = value => {
  const id = youtubeId(value)
  return id ? `https://www.youtube.com/watch?v=${id}` : null
}

export const youtubeEmbedUrl = value => {
  const id = youtubeId(value)
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null
}
