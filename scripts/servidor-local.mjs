/**
 * Serve o site localmente do MESMO jeito que o Vercel serve, lendo o `vercel.json`:
 * endereço sem `.html`, sem barra no fim, cabeçalhos (inclusive a CSP) e o `/api`.
 *
 * 🪤 POR QUE ISTO EXISTE (24/09): as provas de navegador precisam abrir o site, e a
 * prévia que o Vercel gera em cada PR pede login. Um servidor qualquer (`serve`,
 * `http-server`) não aplica a CSP do `vercel.json` — e a CSP é justamente o que
 * bloqueia script de outro domínio no ar. Prova que roda sem a CSP aprova o que a
 * produção quebraria. Este lê as regras do próprio `vercel.json`: mudou lá, muda aqui.
 *
 * 🔒 O `/api` NÃO é repassado para a produção: responde 503. Prova nenhuma pode criar
 * lead de mentira no painel (os formulários do site postam em `/api/...`).
 *
 *   node scripts/servidor-local.mjs [porta]      (padrão 8080)
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.argv[2]) || 8080;
const cfg = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};

// as fontes do vercel.json aqui são regex entre parênteses ("/(.*)", "/(.+\.(?:css|js))");
// as de rewrite usam parâmetro (":path*") e viram prefixo
const regras = (cfg.headers || []).map((h) => ({ re: new RegExp(`^${h.source}$`), headers: h.headers }));
const prefixosApi = (cfg.rewrites || []).map((r) => r.source.replace(/:.*$/, ''));

// o .vercelignore (e o que o Vercel esconde sozinho) dá 404 aqui também — senão a prova
// local veria um arquivo que o visitante não vê
const IGNORE = join(RAIZ, '.vercelignore');
const ignorados = (existsSync(IGNORE) ? readFileSync(IGNORE, 'utf8').split(/\r?\n/) : [])
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const escondido = (rel) => ['vercel.json', '.gitignore', '.vercelignore', 'package.json', 'package-lock.json'].includes(rel)
  || rel.split('/').includes('.git')
  || ignorados.some((l) => (l.startsWith('/') ? rel === l.slice(1) || rel.startsWith(`${l.slice(1)}/`)
    : l.startsWith('*.') && rel.toLowerCase().endsWith(l.slice(1).toLowerCase())));

const arquivo = (rel) => {
  if (escondido(decodeURIComponent(rel))) return null;
  const alvo = normalize(join(RAIZ, decodeURIComponent(rel)));
  if (!alvo.startsWith(RAIZ + sep) && alvo !== RAIZ) return null; // nada fora da pasta
  return existsSync(alvo) && statSync(alvo).isFile() ? alvo : null;
};

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const caminho = url.pathname;
  for (const r of regras) if (r.re.test(caminho)) for (const h of r.headers) res.setHeader(h.key, h.value);

  if (prefixosApi.some((p) => caminho.startsWith(p))) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end('{"ok":false,"motivo":"servidor local de prova: o /api não vai para a produção"}');
  }
  // trailingSlash: false e cleanUrls: true redirecionam, como no Vercel
  if (cfg.trailingSlash === false && caminho.length > 1 && caminho.endsWith('/')) {
    res.writeHead(308, { Location: caminho.slice(0, -1) + url.search }); return res.end();
  }
  if (cfg.cleanUrls && caminho.endsWith('.html')) {
    const limpo = caminho.replace(/(index)?\.html$/, '') || '/';
    res.writeHead(308, { Location: limpo + url.search }); return res.end();
  }

  const achado = caminho === '/' ? arquivo('index.html')
    : arquivo(caminho.slice(1)) || (extname(caminho) ? null : arquivo(`${caminho.slice(1)}.html`));
  if (!achado) {
    const p404 = arquivo('404.html');
    res.writeHead(404, { 'Content-Type': TIPOS['.html'] });
    return res.end(p404 ? readFileSync(p404) : 'não encontrado');
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(achado).toLowerCase()] || 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : readFileSync(achado));
}).listen(PORTA, () => console.log(`site servido como no Vercel em http://localhost:${PORTA}`));
