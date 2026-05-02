(function (global) {
  function parseYouTubeStartSeconds(rawValue) {
    if (!rawValue) return null;
    if (/^\d+$/.test(String(rawValue))) return Number(rawValue);
    const match = String(rawValue).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!match) return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const total = (hours * 3600) + (minutes * 60) + seconds;
    return total > 0 ? total : null;
  }

  function toYouTubeEmbedUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      const parsed = new URL(rawUrl, global.location.origin);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      let videoId = '';
      if (host === 'youtu.be') {
        videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
      } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
        if (parsed.pathname === '/watch') {
          videoId = parsed.searchParams.get('v') || '';
        } else if (parsed.pathname.startsWith('/embed/')) {
          videoId = parsed.pathname.split('/')[2] || '';
        } else if (parsed.pathname.startsWith('/shorts/')) {
          videoId = parsed.pathname.split('/')[2] || '';
        }
      }
      if (!videoId) return null;
      const embed = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
      embed.searchParams.set('playsinline', '1');
      embed.searchParams.set('rel', '0');
      embed.searchParams.set('modestbranding', '1');
      embed.searchParams.set('enablejsapi', '1');
      if (/^https?:$/i.test(global.location.protocol)) {
        embed.searchParams.set('origin', global.location.origin);
      }
      const start = parseYouTubeStartSeconds(parsed.searchParams.get('t') || parsed.searchParams.get('start'));
      if (start) embed.searchParams.set('start', String(start));
      return embed.toString();
    } catch (err) {
      return null;
    }
  }

  function setYouTubeFrameSource(frameEl, embedUrl) {
    if (!frameEl) return;
    if (embedUrl) {
      frameEl.src = embedUrl;
      frameEl.classList.remove('hidden');
    } else {
      frameEl.src = 'about:blank';
      frameEl.classList.add('hidden');
    }
  }

  function pauseYouTubeFrame(frameEl) {
    try {
      frameEl?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
        '*'
      );
    } catch (err) {
      console.warn('暫停 YouTube 影片失敗', err);
    }
  }

  function getTaskVideoUrl(task) {
    return String(task?.video_url || task?.youtubeUrl || task?.youtube_url || '').trim() || null;
  }

  global.AiLabMedia = {
    parseYouTubeStartSeconds,
    toYouTubeEmbedUrl,
    setYouTubeFrameSource,
    pauseYouTubeFrame,
    getTaskVideoUrl
  };
})(window);
