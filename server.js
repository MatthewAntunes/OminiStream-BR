const express = require('express');
const cors = require('cors');
const path = require('path');
const { getEmbedMoviesStreams, getTmdbIdFromCinemeta } = require('./embedmovies-resolver');

// Carrega os provedores da pasta do repositório saimuel-nuvio-repo-main
const repoProvidersPath = path.join(__dirname, 'saimuel-nuvio-repo-main', 'providers');
let fshdProvider, megaembedProvider, peachifyProvider, redeflixProvider;

try { fshdProvider = require(path.join(repoProvidersPath, 'fshd.js')); } catch (e) {}
try { megaembedProvider = require(path.join(repoProvidersPath, 'megaembed.js')); } catch (e) {}
try { peachifyProvider = require(path.join(repoProvidersPath, 'peachify.js')); } catch (e) {}
try { redeflixProvider = require(path.join(repoProvidersPath, 'redeflix.js')); } catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Manifest do Addon Stremio / Nuvio
const manifest = {
  id: "org.nuvioplugin.omnistream.br",
  version: "1.0.0",
  name: "OmniStream BR",
  description: "Addon Multi-Provedor Nativo de Filmes e Séries para Nuvio Desktop (RedeFlix, MegaEmbed, FSHD, VIP Player, WatchPlayer e Peachify)",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

/**
 * PROXY DE MÍDIA NATIVA (Entrega HLS .m3u8 puro com Content-Type e fMP4 init.mp4 reescritos)
 */
app.get('/hls-master.m3u8', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("URL ausente");

  console.log(`🎬 [HLS MASTER PROXY]: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://v1.watchplay.shop/',
        'Origin': 'https://v1.watchplay.shop'
      }
    });

    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status}`);
      return res.status(response.status).send("Erro na busca do stream");
    }

    const playlistText = await response.text();
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

    const host = req.headers.host || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';

    // 1. Reescreve URIs de inicialização como #EXT-X-MAP:URI="init.mp4"
    let rewrittenPlaylist = playlistText.replace(/URI="([^"]+)"/g, (match, uri) => {
      let fullUrl = uri;
      if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
        fullUrl = baseUrl + uri;
      }
      return `URI="${protocol}://${host}/hls-segment?url=${encodeURIComponent(fullUrl)}"`;
    });

    // 2. Reescreve URLs de segmentos (.ts / .m4s)
    rewrittenPlaylist = rewrittenPlaylist.replace(/^(?!#)(.+)$/gm, (line) => {
      const segmentLine = line.trim();
      if (!segmentLine) return line;

      let fullSegmentUrl = segmentLine;
      if (!segmentLine.startsWith('http://') && !segmentLine.startsWith('https://')) {
        fullSegmentUrl = baseUrl + segmentLine;
      }

      return `${protocol}://${host}/hls-segment?url=${encodeURIComponent(fullSegmentUrl)}`;
    });

    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(rewrittenPlaylist);

  } catch (err) {
    console.error("❌ Erro no Master Proxy:", err.message);
    res.status(500).send("Erro no servidor proxy");
  }
});

/**
 * PROXY DE SEGMENTOS TS/M4S E INIT.MP4
 */
app.get('/hls-segment', async (req, res) => {
  const segmentUrl = req.query.url;
  if (!segmentUrl) return res.status(400).send("URL ausente");

  try {
    const response = await fetch(segmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://v1.watchplay.shop/',
        'Origin': 'https://v1.watchplay.shop'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send("Erro de segmento");
    }

    const contentType = response.headers.get('content-type') || (segmentUrl.includes('init.mp4') ? 'video/mp4' : 'video/MP2T');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (err) {
    console.error("❌ Erro no Segment Proxy:", err.message);
    res.status(500).send("Erro de segmento");
  }
});

// Helper para limite de tempo máximo por provedor (ex: 3.5s) para resposta completa e rápida no Nuvio
function withTimeout(promise, ms = 3500) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve([]), ms))
  ]);
}

// Endpoint de Streams Multi-Provedor para Filmes e Séries
app.get(['/stream/:type/:id.json', '/stream/:type/:id'], async (req, res) => {
  const { type, id } = req.params;
  const cleanId = id.replace(/\.json$/, '');
  const parts = cleanId.split(':');
  let rawId = parts[0].replace('tmdb:', '');
  const season = parts[1] || '1';
  const episode = parts[2] || '1';
  const repoType = type === 'series' ? 'tv' : 'movie';

  // Se o ID for IMDb (ex: tt0903747), converte para TMDB ID (ex: 1396)
  let tmdbNumericId = rawId.replace('tt', '');
  if (rawId.startsWith('tt')) {
    const fetchedTmdbId = await getTmdbIdFromCinemeta(type, rawId);
    if (fetchedTmdbId) {
      tmdbNumericId = fetchedTmdbId;
    }
  }

  console.log(`🎯 [STREAM SOLICITADO] Tipo: ${type} | ID: ${cleanId} (IMDb/Raw: ${rawId}, TMDB: ${tmdbNumericId}, s:${season}, e:${episode})`);

  const host = req.headers.host || `localhost:${PORT}`;
  const protocol = req.protocol || 'http';

  const allRawStreams = [];

  // Consulta todos os provedores com limite de tempo de 2.5s para resposta rápida
  const promises = [
    withTimeout(getEmbedMoviesStreams(type, cleanId).catch(() => []), 2500),
    withTimeout(megaembedProvider?.getStreams ? megaembedProvider.getStreams(tmdbNumericId, repoType, season, episode).catch(() => []) : Promise.resolve([]), 2500),
    withTimeout(redeflixProvider?.getStreams ? redeflixProvider.getStreams(tmdbNumericId, repoType, season, episode).catch(() => []) : Promise.resolve([]), 2500),
    withTimeout(fshdProvider?.getStreams ? fshdProvider.getStreams(tmdbNumericId, repoType, season, episode).catch(() => []) : Promise.resolve([]), 2500),
    withTimeout(peachifyProvider?.getStreams ? peachifyProvider.getStreams(tmdbNumericId, repoType, season, episode).catch(() => []) : Promise.resolve([]), 2500)
  ];

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allRawStreams.push(...r.value);
    }
  }

  const streams = [];
  let optionCount = 1;

  for (const s of allRawStreams) {
    if (s && s.url) {
      const isM3u8 = s.url.includes('.m3u8') || s.url.includes('.txt') || s.type === 'hls';
      const streamUrl = isM3u8 ? `${protocol}://${host}/hls-master.m3u8?url=${encodeURIComponent(s.url)}` : s.url;
      const providerName = s.name || s.provider || "Nuvio Stream";
      const titleLabel = s.title || `▶ ${providerName} Opção ${optionCount}`;

      streams.push({
        name: `${providerName}`,
        title: `${titleLabel}`,
        url: streamUrl
      });
      optionCount++;
    }
  }

  if (streams.length === 0) {
    console.log(`ℹ️ [DISPONIBILIDADE] Título ${cleanId} não possui fontes disponíveis.`);
  } else {
    console.log(`⚡ [RESPOSTA RÁPIDA NUVIO] Retornando ${streams.length} opção(ões) de stream.`);
  }

  res.json({ streams });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor do Addon Nuvio Multi-Provedor rodando em http://localhost:${PORT}`);
  console.log(`📌 Adicione no Nuvio: http://localhost:${PORT}/manifest.json`);
});
