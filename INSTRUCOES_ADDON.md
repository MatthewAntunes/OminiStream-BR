# 📖 OmniStream BR — Manual Técnico e Guia de Manutenção do Addon

> **Repositório GitHub:** `https://github.com/MatthewAntunes/OminiStream-BR`  
> **Endpoint Vercel (Produção):** `https://omini-stream-br.vercel.app`  
> **Manifest URL:** `https://omini-stream-br.vercel.app/manifest.json`  
> **Arquitetura:** Node.js (Express) compatível com padrão Stremio Addon Protocol v3 / Nuvio Native Addon.

---

## 🧭 Visão Geral da Arquitetura

O **OmniStream BR** opera estritamente no **Modo Addon (Stremio Protocol)**. Ele expõe uma API HTTP que o Nuvio consome para obter links de vídeo diretos (`.mp4`, `.m3u8` ou `externalUrl`).

### Fluxo de Requisição de Stream
```
[Nuvio Player] 
      │
      ▼  GET /stream/:type/:id.json (Ex: /stream/series/tt0903747:1:1.json)
[server.js (Express / Vercel Serverless)]
      │
      ├─► 1. Cinemeta API (Converte IMDb 'tt...' -> TMDB numérico)
      │
      ├─► 2. Promise.allSettled:
      │       ├── providers/redeflix.js (Scraper RedeFlix -> R2 signed direct MP4)
      │       ├── providers/fshd.js     (Extractor FSHD -> HLS master stream)
      │       └── providers/megaembed.js(Extractor MegaEmbed -> HLS/MP4)
      │
      └─► 3. Agregação e Fallback Inteligente (Garante fontes mesmo com bloqueio de Datacenter)
              │
              ▼
       JSON { streams: [...] } -> Retorno ao Nuvio
```

---

## 🛠️ Como os Provedores Funcionam

### 1. RedeFlix (`providers/redeflix.js`)
* **Endpoint Base:** `https://redeflixapi.store/filme/{tmdbId}` ou `/serie/{tmdbId}/{season}/{episode}`
* **Fluxo de Extração:**
  1. Faz `GET` na página do título e busca a variável `var playbackResolveTicket = "..."`.
  2. Envia um `POST` para `https://redeflixapi.store/playback-resolve.php` com `{ ticket, server: 'default' }` e cabeçalho `X-Requested-With: RedeFlixPlayer`.
  3. Recebe um `launchTicket`.
  4. Faz `GET` em `https://redeflixapi.store/playerkys/index.php?v=...&launch={launchTicket}&embed=...`.
  5. Extrai a variável global `window.__RF_INITIAL_CONFIG = { file: "https://...r2.cloudflarestorage.com/..." }`.
  6. Retorna a URL assinada direta do Cloudflare R2 (`video/mp4`).

### 2. FSHD (`providers/fshd.js`)
* **Endpoint Base:** `https://112234152.xyz/player/index.php?data={tmdbId}&season={season}&episode={episode}`
* **Fluxo de Extração:**
  1. Acessa a página do player e extrai o `data-contentid` interno da série/episódio.
  2. Envia requisição POST para a API interna de opções (`/api/options.php`).
  3. Descriptografa o script packed/obfuscated (`eval(function(p,a,c,k,e,d)...)`).
  4. Extrai a URL final do HLS Master (`https://112234152.xyz/player/hls/.../master.txt`).
  5. Retorna stream HLS pronto para reprodução nativa.

### 3. MegaEmbed (`providers/megaembed.js`)
* **Endpoint Base:** `https://d1muf25xa07so8hp28a.megaembed.com/embed/{tmdbId}` ou `/embed/tv/{tmdbId}/{season}/{episode}`
* **Fluxo de Extração:**
  1. Requisita a URL com headers de navegador real (`User-Agent: Firefox/150`, `Sec-Fetch-*`).
  2. Extrai o array `var sources = [...]`.
  3. Em IPs residenciais/locais, extrai 4 a 5 opções diretas de HLS/MP4.
  4. Em ambientes de Datacenter (onde a Cloudflare pode apresentar desafio JS), o `server.js` ativa o fallback de `externalUrl`, mantendo o botão acessível no player.

---

## 📁 Estrutura de Arquivos do Projeto

```
git-repo/
├── providers/
│   ├── redeflix.js        # Scraper do RedeFlix (R2 Direct)
│   ├── fshd.js            # Extrator do FSHD (Fsplay HLS)
│   └── megaembed.js       # Extrator rápido do MegaEmbed
├── server.js              # Servidor Express, rotas do Addon e Cinemeta converter
├── vercel.json            # Configuração de build e rotas do Vercel Serverless
├── package.json           # Dependências (express, cors)
└── README.md              # Documentação básica do repositório
```

---

## 🚀 Como Fazer Atualizações e Deploy

O deploy é **100% automático via Git**. Toda alteração enviada para o branch `main` é detectada pela Vercel e publicada em segundos.

### Passo a Passo no Terminal (PowerShell):

1. **Acessar a pasta do repositório:**
   ```powershell
   cd "c:\Users\mateu\OneDrive\Scripts\2026\OminiStream BR\git-repo"
   ```

2. **Testar alterações localmente:**
   ```powershell
   # Iniciar servidor local
   node server.js
   
   # Em outro terminal, testar se os streams respondem:
   node -e "fetch('http://localhost:3000/stream/series/tt0903747:1:1.json').then(r=>r.json()).then(d=>console.log(d))"
   ```

3. **Subir atualização para o GitHub e Vercel:**
   ```powershell
   git add .
   git commit -m "feat: descricao da atualizacao"
   git push origin main
   ```

4. **Verificar produção na Vercel:**
   ```powershell
   node -e "fetch('https://omini-stream-br.vercel.app/stream/series/tt0903747:1:1.json').then(r=>r.json()).then(d=>console.log(d.streams.map(x=>x.title)))"
   ```

---

## 🔧 Diagnóstico de Problemas Comuns

### 1. "Fontes não aparecem no Nuvio"
* Verifique se o manifest está respondendo com HTTP 200:
  ```powershell
  curl -I https://omini-stream-br.vercel.app/manifest.json
  ```
* Verifique no Nuvio Desktop o arquivo de preferências:
  `%APPDATA%\Nuvio\nuvio_addons.properties`
  Certifique-se de que `omini-stream-br.vercel.app/manifest.json` está em `installed_addon_urls_1` e marcado como `true`.

### 2. "Um dos provedores parou de retornar stream"
* Execute o provedor individualmente pelo terminal para ver logs de erro:
  ```powershell
  node -e "require('./providers/redeflix.js').getStreams('1396', 'tv', '1', '1').then(console.log)"
  node -e "require('./providers/fshd.js').getStreams('1396', 'tv', '1', '1').then(console.log)"
  node -e "require('./providers/megaembed.js').getStreams('1396', 'tv', '1', '1').then(console.log)"
  ```
* Se o domínio de algum provedor mudou (ex: `redeflixapi.store`), basta alterar a URL base dentro do respectivo arquivo em `providers/` e fazer o `git push`.

### 3. "Como adicionar um novo provedor"
1. Crie o arquivo `providers/novoprovedor.js` exportando `async function getStreams(tmdbId, type, season, episode)`.
2. O formato retornado deve ser uma lista de objetos:
   ```javascript
   return [{
     name: "NomeDoProvedor",
     title: "NomeDoProvedor (Dublado HD)",
     url: "https://link-direto-de-video.mp4",
     quality: 1080,
     type: "mp4" // ou "hls"
   }];
   ```
3. Importe no `server.js` (`const novoProvider = require('./providers/novoprovedor');`) e adicione à lista de `promises`.
4. Faça o `git push origin main`.
