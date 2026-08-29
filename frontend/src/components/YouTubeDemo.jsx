import { useState } from 'react'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n.js'
import { canonicalYouTubeUrl, youtubeEmbedUrl } from '../lib/youtube.js'

export default function YouTubeDemo({ url, title, compact = false }) {
  const [playing, setPlaying] = useState(false)
  const embed = youtubeEmbedUrl(url)
  const canonical = canonicalYouTubeUrl(url)
  if (!embed) return null
  return <div className={'yt-demo' + (compact ? ' compact' : '')}>
    {playing
      ? <iframe className="yt-frame" src={embed} title={t('{0} exercise demonstration', title || t('Exercise'))}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      : <button className="yt-launch" onClick={() => setPlaying(true)}>
          <span className="yt-play"><Icon name="play" /></span>
          <span><b>{t('Watch exercise demonstration')}</b><small>{t('YouTube loads only after you tap play')}</small></span>
        </button>}
    <a className="yt-open" href={canonical} target="_blank" rel="noreferrer">{t('Open on YouTube')}</a>
  </div>
}
