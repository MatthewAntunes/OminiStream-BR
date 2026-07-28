const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

const REAL_CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

app.userAgentFallback = REAL_CHROME_USER_AGENT;

let mainWindow;

const AD_DOMAINS = [
  'doubleclick.net', 'adservice.google.com', 'popads.net', 'adsterra.com',
  'clickadu.com', 'exoclick.com', 'bet365', '1xbet', 'propellerads.com',
  'juicyads.com', 'hilltopads.com', 'popcash.net', 'adnxs.com', 'adsystem',
  'banner', 'popunder', 'redirect', 'analytics', 'telemetry'
];

function createWindow() {
  session.defaultSession.setUserAgent(REAL_CHROME_USER_AGENT);

  mainWindow = new BrowserWindow({
    width: 1350,
    height: 880,
    title: "Nuvio Standalone Embed Sniffer & Diagnostic Tool",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'electron-ui.html'));

  // 1. INJETAR CABEÇALHO REFERER APENAS PARA MYEMBED/EMBEDMOVIES (evita tela preta local)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url.toLowerCase();
    if (url.includes('myembed') || url.includes('embedmovies')) {
      details.requestHeaders['Referer'] = 'https://embedmovies.org/';
      details.requestHeaders['Origin'] = 'https://embedmovies.org';
    }
    details.requestHeaders['User-Agent'] = REAL_CHROME_USER_AGENT;
    callback({ requestHeaders: details.requestHeaders });
  });

  // 2. Ocultar assinaturas de automação (Anti-Cloudflare Bypass)
  app.on('web-contents-created', (event, contents) => {
    contents.on('dom-ready', () => {
      contents.executeJavaScript(`
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        } catch(e){}
      `).catch(() => {});
    });

    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        console.log('🚫 [WEBVIEW POPUP BLOQUEADO]:', url);
        return { action: 'deny' };
      });
    }
  });

  // 3. Bloqueador de Popups Principais
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('🚫 [POPUP BLOQUEADO]:', url);
    return { action: 'deny' };
  });

  // 4. Interceptador de Rede & AdBlocker
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const url = details.url;
      const lowerUrl = url.toLowerCase();

      const isAd = AD_DOMAINS.some(domain => lowerUrl.includes(domain));
      if (isAd && !lowerUrl.includes('.m3u8')) {
        console.log('🛑 [ADBLOCK CANCELOU]:', url);
        return callback({ cancel: true });
      }

      if (
        lowerUrl.includes('.m3u8') ||
        (lowerUrl.includes('.mp4') && !lowerUrl.includes('preview'))
      ) {
        console.log('⚡ [ELECTRON SNIFFER INTERCEPTADO]:', url);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('stream-detected', {
            url: url,
            method: details.method,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      callback({});
    }
  );
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
