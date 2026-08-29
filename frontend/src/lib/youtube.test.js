import { describe, expect, it } from 'vitest'
import { canonicalYouTubeUrl, youtubeEmbedUrl, youtubeId } from './youtube.js'

describe('YouTube exercise links', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  ])('accepts a genuine YouTube URL: %s', value => expect(youtubeId(value)).toBe('dQw4w9WgXcQ'))

  it.each([
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=too-short',
    'not a url'
  ])('rejects an unsafe or invalid URL: %s', value => expect(youtubeId(value)).toBeNull())

  it('normalises storage and uses the privacy-enhanced player', () => {
    expect(canonicalYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0')
  })
})
