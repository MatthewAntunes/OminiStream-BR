/**
 * MegaEmbed Direct Extractor with exact browser fingerprint headers
 * Returns instant streams without probe delays.
 */

async function getStreams(tmdbId, type = 'movie', season = 1, episode = 1) {
  try {
    const isTv = (type === 'tv' || type === 'series');
    const embedUrl = isTv
      ? `https://d1muf25xa07so8hp28a.megaembed.com/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://d1muf25xa07so8hp28a.megaembed.com/embed/${tmdbId}`;

    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0';
    const referer = isTv
      ? `https://megaembed.com/embed/${tmdbId}/${season}/${episode}`
      : `https://megaembed.com/embed/${tmdbId}`;

    const headers = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': referer,
      'Origin': 'https://megaembed.com',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-User': '?1',
      'TE': 'trailers'
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(embedUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const finalUrl = res.url || embedUrl;
    const html = await res.text();

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
          'User-Agent': ua,
          'Referer': finalUrl,
          'Origin': finalUrl
        }
      });
    }

    return streams;
  } catch (e) {
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