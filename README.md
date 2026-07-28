# Nuvio Plugin / Provider Template

Este projeto é um template pronto para desenvolvimento de **Plugins/Providers nativos para o Nuvio Desktop**.

## 📁 Estrutura do Projeto

- `manifest.json`: Manifesto do repositório/plugin registrado no Nuvio.
- `src/index.js`: Código-fonte do seu plugin/provedor onde fica a lógica de busca e extração de links de vídeo (HLS / MP4).
- `build.js`: Script de bundle via `esbuild` focado na compatibilidade com o motor JavaScript Hermes do Nuvio.
- `dist/plugin.js`: Arquivo final gerado após o build.

---

## 🚀 Como Desenvolver

### 1. Instalar as dependências
```bash
npm install
```

### 2. Gerar o arquivo compilado (Build)
```bash
npm run build
```

### 3. Iniciar o servidor local de testes
```bash
npm run serve
```
O servidor estará rodando em: `http://localhost:3000/manifest.json`

---

## 🧪 Testando no Nuvio Desktop

1. Abra o app **Nuvio Desktop**.
2. Vá até **Configurações > Plugins** (ou **Developer Settings > Plugin Tester**).
3. Adicione a URL do seu manifesto local: `http://localhost:3000/manifest.json` (ou substitua pelo IP da máquina local se testar na rede local).
4. Abra qualquer filme/série e verifique se as fontes do seu plugin aparecem no reprodutor.
