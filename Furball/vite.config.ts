import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Só no `npm run dev`: recebe um print do jogo (POST /__screenshot com { name, data })
 * e salva em screenshots/<name>.png. Útil para mandar capturas durante o desenvolvimento.
 */
function screenshots(): Plugin {
  const dir = fileURLToPath(new URL('./screenshots/', import.meta.url));
  return {
    name: 'furball-screenshots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__screenshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { name, data } = JSON.parse(body) as { name: string; data: string };
            const safe = String(name).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'print';
            mkdirSync(dir, { recursive: true });
            writeFileSync(`${dir}${safe}.png`, Buffer.from(data.split(',')[1], 'base64'));
            res.end('ok');
          } catch {
            res.statusCode = 400;
            res.end('erro');
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 }, // o Phaser sozinho já tem ~1,4 MB
  plugins: [screenshots()],
});
