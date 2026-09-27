/**
 * MegaEmbed Fast Direct Extractor for Nuvio Desktop
 * Provides instant HLS & MP4 playback inside Nuvio Native Video Player.
 */

async function getStreams(tmdbId, type = 'movie', season = 1, episode = 1) {
  try {
    const isTv = type === 'tv' || type === 'series';
    const embedUrl = isTv
      ? `https://d1muf25xa07so8hp28a.megaembed.com/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://d1muf25xa07so8hp28a.megaembed.com/embed/${tmdbId}`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://megaembed.com/',
      'Origin': 'https://megaembed.com'
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(embedUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    console.log(`[MegaEmbed] URL: ${embedUrl} | Status: ${res.status}`);
    if (!res.ok) {
      console.warn(`[MegaEmbed] Failed with status ${res.status}`);
      return [];
    }

    const finalUrl = res.url || embedUrl;
    const html = await res.text();
    console.log(`[MegaEmbed] Received HTML length: ${html.length}`);

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
