const fetch = globalThis.fetch;
const https = require('https');

/**
 * Converte IMDb ID -> TMDB ID usando a API do Cinemeta (strem.io)
 */
function getTmdbIdFromCinemeta(type, imdbId) {
  return new Promise((resolve) => {
    if (!imdbId.startsWith('tt')) return resolve(imdbId);

    const mediaType = type === 'series' ? 'series' : 'movie';
    const url = `https://v3-cinemeta.strem.io/meta/${mediaType}/${imdbId}.json`;

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.meta && json.meta.moviedb_id) {
            console.log(`✅ [IMDb -> TMDB Convertido]: ${imdbId} -> ${json.meta.moviedb_id}`);
            return resolve(String(json.meta.moviedb_id));
          }
        } catch (e) {}
        resolve(null);
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Extrator e Resolver Oficial do EmbedMovies.org / MyEmbed.biz para Filmes e Séries
 * Suporta múltiplos servidores (WatchPlayer, VIP Player, etc.)
 */
async function getEmbedMoviesStreams(type, id) {
  const cleanId = id.replace(/\.json$/, '');
  const parts = cleanId.split(':');
  const rawId = parts[0].replace('tmdb:', '');
  const season = parts[1] || '1';
  const episode = parts[2] || '1';

  const streams = [];

  // Lista de IDs candidatos a testar (IMDb ID e TMDB ID se aplicável)
  const candidateIds = [rawId];
  if (rawId.startsWith('tt')) {
    const tmdbId = await getTmdbIdFromCinemeta(type, rawId);
    if (tmdbId && !candidateIds.includes(tmdbId)) {
      candidateIds.push(tmdbId);
    }
  }

  for (const candId of candidateIds) {
    let ajaxUrl;
    let refererUrl;

    if (type === 'series') {
      ajaxUrl = `https://playerflix.ink/pages/ajax.php?id=${candId}&type=tv&season=${season}&episode=${episode}`;
      refererUrl = `https://playerflix.ink/serie/${candId}/${season}/${episode}`;
    } else {
      ajaxUrl = `https://playerflix.ink/pages/ajax.php?id=${candId}&type=movie`;
      refererUrl = `https://playerflix.ink/filme/${candId}`;
    }

    console.log(`🔍 [EmbedMovies Resolver] Verificando disponibilidade (${type} - ID: ${candId}): ${ajaxUrl}`);

    try {
      const res = await fetch(ajaxUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': refererUrl,
          'Origin': 'https://playerflix.ink',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!res.ok) continue;
      const html = await res.text();
      if (!html || html.length < 50) continue;

      const regex = /<div class="player-option"[^>]*data-embed="([^"]+)"[^>]*>[\s\S]*?<div class="player-name">([^<]+)<\/div>/g;
      let match;

      while ((match = regex.exec(html)) !== null) {
        const rawB64 = match[1];
        const playerName = match[2].trim();
        const decodedUrl = Buffer.from(rawB64, 'base64').toString('utf-8');

        // 1. Servidor WatchPlayer
        if (playerName.toLowerCase().includes('watchplayer') || decodedUrl.includes('watchplay')) {
          try {
            const wpRes = await fetch(decodedUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://playerflix.ink/' }
            });
            const wpHtml = await wpRes.text();

            if (type === 'series') {
              const contentIdMatch = wpHtml.match(new RegExp(`data-contentid="(\\d+)"[^>]*data-season="${season}"[^>]*data-episode="${episode}"`, 'i')) || wpHtml.match(/data-contentid="(\\d+)"/i);
              const contentId = contentIdMatch ? contentIdMatch[1] : null;

              if (contentId) {
                const optionsRes = await fetch('https://v1.watchplay.shop/api', {
                  method: 'POST',
                  headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Referer': decodedUrl,
                    'X-Requested-With': 'XMLHttpRequest'
                  },
                  body: new URLSearchParams({ action: 'getOptions', contentid: contentId }).toString()
                });
                const optionsJson = await optionsRes.json();
                if (optionsJson && optionsJson.data && Array.isArray(optionsJson.data.options)) {
                  for (let i = 0; i < optionsJson.data.options.length; i++) {
                    const opt = optionsJson.data.options[i];
                    if (opt && opt.ID) {
                      const apiRes = await fetch('https://v1.watchplay.shop/api', {
                        method: 'POST',
                        headers: {
                          'User-Agent': 'Mozilla/5.0',
                          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                          'Referer': decodedUrl,
                          'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: new URLSearchParams({ action: 'getPlayer', video_id: opt.ID }).toString()
                      });

                      const apiData = await apiRes.json();
                      if (apiData && apiData.data && apiData.data.video_url) {
                        const optLabel = optionsJson.data.options.length > 1 ? ` (Opção ${i + 1})` : '';
                        console.log(`⚡ [STREAM REAL ENCONTRADO - WatchPlayer]: ${apiData.data.video_url}`);
                        streams.push({
                          name: `EmbedMovies [WatchPlayer]`,
                          title: `▶ Servidor 1 - WatchPlayer HD${optLabel}`,
                          url: apiData.data.video_url
                        });
                      }
                    }
                  }
                }
              }
            } else {
              const dataIdMatches = [...wpHtml.matchAll(/data-id="(\\d+)"/gi)];
              const videoIds = dataIdMatches.length > 0 ? [...new Set(dataIdMatches.map(m => m[1]))] : [];

              for (let i = 0; i < videoIds.length; i++) {
                const videoId = videoIds[i];
                const apiRes = await fetch('https://v1.watchplay.shop/api', {
                  method: 'POST',
                  headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Referer': decodedUrl,
                    'X-Requested-With': 'XMLHttpRequest'
                  },
                  body: new URLSearchParams({ action: 'getPlayer', video_id: videoId }).toString()
                });

                const apiData = await apiRes.json();
                if (apiData && apiData.data && apiData.data.video_url) {
                  const optLabel = videoIds.length > 1 ? ` (Opção ${i + 1})` : '';
                  console.log(`⚡ [STREAM REAL ENCONTRADO - WatchPlayer]: ${apiData.data.video_url}`);
                  streams.push({
                    name: `EmbedMovies [WatchPlayer]`,
                    title: `▶ Servidor 1 - WatchPlayer HD${optLabel}`,
                    url: apiData.data.video_url
                  });
                }
              }
            }
          } catch (err) {
            console.error("❌ Erro ao extrair WatchPlayer:", err.message);
          }
        }

        // 2. Servidor VIP Player / EmbedPlayer (embedplayer1.xyz / embedplayer2.xyz / embedplayer.site)
        if (playerName.toLowerCase().includes('vip') || decodedUrl.includes('embedplayer') || decodedUrl.includes('vip') || decodedUrl.includes('video/')) {
          try {
            const hashMatch = decodedUrl.match(/video\/([a-f0-9]+)/i);
            if (hashMatch) {
              const hash = hashMatch[1];
              const hostMatch = decodedUrl.match(/(https?:\/\/[^\/]+)/i);
              const host = hostMatch ? hostMatch[1] : 'https://embedplayer2.xyz';

              const apiRes = await fetch(`${host}/player/index.php?data=${hash}&do=getVideo`, {
                method: 'POST',
                headers: {
                  'User-Agent': 'Mozilla/5.0',
                  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                  'Referer': decodedUrl,
                  'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams({ hash: hash, r: 'https://playerflix.ink/' }).toString()
              });

              const apiData = await apiRes.json();
              const streamUrl = apiData?.securedLink || apiData?.videoSource;
              if (streamUrl) {
                console.log(`⚡ [STREAM REAL ENCONTRADO - VIP Player]: ${streamUrl}`);
                streams.push({
                  name: `EmbedMovies [VIP Player]`,
                  title: `▶ Servidor 2 - VIP Player HD`,
                  url: streamUrl
                });
              }
            }
          } catch (err) {
            console.error("❌ Erro ao extrair VIP Player:", err.message);
          }
        }
      }

      // Se encontrou streams HLS reais e funcionais para esse candidato, encerra busca
      if (streams.length > 0) break;

    } catch (err) {
      console.error("❌ Erro ao consultar candidato:", err.message);
    }
  }

  return streams;
}

module.exports = {
  getEmbedMoviesStreams,
  getTmdbIdFromCinemeta
};
