const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

// Carrega os provedores atualizados
let megaembedProvider, redeflixProvider;
try { megaembedProvider = require(path.join(__dirname, 'providers', 'megaembed.js')); } catch (e) {}
try { redeflixProvider = require(path.join(__dirname, 'providers', 'redeflix.js')); } catch (e) {}

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
  description: "Addon Multi-Provedor Nativo de Filmes e Séries para Nuvio Desktop (RedeFlix, MegaEmbed HD)",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

app.get('/', (req, res) => {
  res.json(manifest);
});

app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

/**
 * Converte IMDb ID -> TMDB ID usando Cinemeta
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
            console.log(`✅ [IMDb -> TMDB]: ${imdbId} -> ${json.meta.moviedb_id}`);
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

function withTimeout(promise, ms = 4000) {
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

  let tmdbNumericId = rawId.replace('tt', '');
  if (rawId.startsWith('tt')) {
    const fetchedTmdbId = await getTmdbIdFromCinemeta(type, rawId);
    if (fetchedTmdbId) {
      tmdbNumericId = fetchedTmdbId;
    }
  }

  console.log(`🎯 [STREAM SOLICITADO] Tipo: ${type} | ID: ${cleanId} (TMDB: ${tmdbNumericId}, s:${season}, e:${episode})`);

  const allRawStreams = [];

  const promises = [
    withTimeout(megaembedProvider?.getStreams ? megaembedProvider.getStreams(tmdbNumericId, repoType, season, episode).catch(() => []) : Promise.resolve([]), 6500),
    withTimeout(redeflixProvider?.getStreams ? redeflixProvider.getStreams(tmdbNumericId, repoType, season, episode).catch(() => []) : Promise.resolve([]), 6500)
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
      const providerName = s.name || s.provider || "OmniStream";
      const titleLabel = s.title || `▶ ${providerName} Opção ${optionCount}`;

      streams.push({
        name: `${providerName}`,
        title: `${titleLabel}`,
        url: s.url,
        behaviorHints: {
          notWebReady: false
        }
      });
      optionCount++;
    }
  }

  console.log(`⚡ [RESPOSTA NUVIO] Retornando ${streams.length} opção(ões) de stream.`);
  res.json({ streams });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor do Addon OmniStream BR rodando na porta ${PORT}`);
    console.log(`📌 Adicione no Nuvio: http://localhost:${PORT}/manifest.json`);
  });
}

module.exports = app;
