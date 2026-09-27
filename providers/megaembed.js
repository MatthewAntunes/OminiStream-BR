/**
 * MegaEmbed Fast Direct Extractor for Nuvio Desktop
 * Provides instant HLS & MP4 playback inside Nuvio Native Video Player.
 */

async function getStreams(tmdbId, type = 'movie', season = 1, episode = 1) {
  try {
    const isTv = type === 'tv' || type === 'series';
    const domains = [
      'https://embed.megaembed.com',
      'https://player.megaembed.com',
      'https://d1muf25xa07so8hp28a.megaembed.com'
    ];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://megaembed.com/',
      'Origin': 'https://megaembed.com'
    };

    let html = '';
    let finalUrl = '';

    for (const base of domains) {
      const embedUrl = isTv
        ? `${base}/embed/tv/${tmdbId}/${season}/${episode}`
        : `${base}/embed/${tmdbId}`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);

        const res = await fetch(embedUrl, { headers, signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const body = await res.text();
          if (body && body.includes('var sources =')) {
            html = body;
            finalUrl = res.url || embedUrl;
            break;
          }
        }
      } catch (err) {
        // Tenta o próximo espelho
      }
    }

    if (!html) return [];

    const sourcesMatch = html.match(/var sources = (\[[\s\S]*?\]);/);
    if (!sourcesMatch) return [];

    const sources = JSON.parse(sourcesMatch[1]);
    const streams = [];

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (!src || !src.file) continue;

      const isHls = src.type === 'hls' || src.file.includes('.m3u8');
      const label = src.label || `Opção ${i + 1}`;

      streams.push({
        name: 'MegaEmbed',
        title: `MegaEmbed (${label})`,
        url: src.file,
        quality: 1080,
        type: isHls ? 'hls' : 'mp4',
        group: label,
        provider: 'megaembed',
        headers: {
          'User-Agent': headers['User-Agent'],
          'Referer': finalUrl,
          'Origin': finalUrl
        }
      });
    }

    return streams;
  } catch (e) {
    console.error('[MegaEmbed] Extraction error:', e.message);
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
}
if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
}
if (typeof global !== 'undefined') {
  global.getStreams = getStreams;
}
