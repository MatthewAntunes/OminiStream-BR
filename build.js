const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'dist/plugin.js',
  format: 'iife',
  target: ['es2018'],
  minify: false,
  sourcemap: false,
}).then(() => {
  console.log('✅ Build concluído com sucesso: dist/plugin.js');
}).catch((err) => {
  console.error('❌ Erro no build:', err);
  process.exit(1);
});
