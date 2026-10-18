/**
 * MegaEmbed Fast & Direct Native Stream Extractor for Nuvio Player
 */

async function getStreams(tmdbId, type = 'movie', season = 1, episode = 1) {
  try {
    const isTv = (type === 'tv' || type === 'series');
    const workerUrl = `https://megaembed-relay.mateusantunesdarosa.workers.dev/?id=${tmdbId}&type=${isTv ? 'tv' : 'movie'}&s=${season}&e=${episode}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(workerUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return [{ name: 'MegaEmbed', title: 'MegaEmbed HTTP Error: ' + res.status, url: 'http://debug/http_' + res.status }];
    }

    const data = await res.json();
    const sources = data?.sources || [];
    if (sources.length === 0) {
      return [{ name: 'MegaEmbed', title: 'MegaEmbed Empty Sources: ' + JSON.stringify(data), url: 'http://debug/empty' }];
    }
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
        provider: 'megaembed'
      });
    }

    return streams;
  } catch (e) {
    return [{ name: 'MegaEmbed', title: 'MegaEmbed Debug: ' + e.message, url: 'http://debug/' + encodeURIComponent(e.message) }];
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