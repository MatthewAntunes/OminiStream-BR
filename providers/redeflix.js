/**
 * RedeFlix Modern Direct Scraper for Nuvio Desktop
 * Re-engineered for 2026 playbackResolveTicket API and Cloudflare R2 direct stream delivery.
 */

async function getStreams(tmdbId, type = 'movie', season = 1, episode = 1) {
  try {
    const isTv = type === 'tv' || type === 'series';
    const pageUrl = isTv 
      ? `https://redeflixapi.store/serie/${tmdbId}/${season}/${episode}`
      : `https://redeflixapi.store/filme/${tmdbId}`;

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const pageRes = await fetch(pageUrl, {
      headers: { 'User-Agent': ua }
    });
    if (!pageRes.ok) return [];
    const html = await pageRes.text();
    const ticketMatch = html.match(/var playbackResolveTicket = "([^"]+)"/);
    if (!ticketMatch) return [];

    const ticket = ticketMatch[1];
    const resolveRes = await fetch('https://redeflixapi.store/playback-resolve.php', {
      method: 'POST',
      headers: {
        'User-Agent': ua,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'RedeFlixPlayer',
        'Origin': 'https://redeflixapi.store',
        'Referer': pageUrl
      },
      body: JSON.stringify({ ticket: ticket, server: 'default' })
    });
    if (!resolveRes.ok) return [];
    const resData = await resolveRes.json();
    if (!resData.launchTicket) return [];

    const playerUrl = `https://redeflixapi.store/playerkys/index.php?v=20260627-6&launch=${encodeURIComponent(resData.launchTicket)}&embed=${encodeURIComponent(pageUrl)}`;
    const playerRes = await fetch(playerUrl, {
      headers: {
        'User-Agent': ua,
        'Referer': pageUrl
      }
    });
    if (!playerRes.ok) return [];
    const playerHtml = await playerRes.text();
    const configMatch = playerHtml.match(/window\.__RF_INITIAL_CONFIG\s*=\s*(\{[\s\S]*?\});/);
    if (!configMatch) return [];

    const cfg = JSON.parse(configMatch[1]);
    if (!cfg.file) return [];

    const isHls = cfg.file.includes('.m3u8');
    return [{
      name: 'RedeFlix',
      title: 'RedeFlix (Dublado HD)',
      url: cfg.file,
      quality: 1080,
      type: isHls ? 'hls' : 'mp4',
      group: 'RedeFlix HD',
      provider: 'redeflix',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://redeflixapi.store/playerkys/index.php',
        'Origin': 'https://redeflixapi.store'
      }
    }];
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
