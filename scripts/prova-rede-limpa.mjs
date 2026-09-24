/**
 * Nenhum arquivo é baixado duas vezes, e nada volta 404.
 *
 * 🪤 POR QUE ISTO EXISTE (trazida do site da M5 em 24/09): lá, carimbar o preload da
 * foto do topo com `?v=` e esquecer a `url()` do CSS fez o navegador baixar a MESMA
 * foto duas vezes, 239 KB a mais, e o desempenho caiu de 90 para 73. Nenhuma prova de
 * arquivo vê isso; só olhando o que o navegador realmente pede é que a cópia aparece.
 *
 * Roda de onde o playwright estiver instalado:
 *   node caminho/para/scripts/prova-rede-limpa.mjs [endereço]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'https://www.regula360.com.br';
const PAGS = ['', 'diagnostico-e-painel', 'regularizacao-e-gestao-ativa', 'gestao-mensal-de-boletos', 'auditoria-e-recuperacao', 'privacidade'];

const browser = await chromium.launch({ channel: 'chrome' });
const erros = [];

for (const p of PAGS) {
  const nome = p || 'home';
  // contexto novo por página: cache frio, que é o que o visitante novo vive
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const baixados = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BASE).origin) return;
    baixados.push({ arq: u.pathname, versao: u.searchParams.get('v'), status: r.status(), url: r.url() });
  });

  await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);

  const porArquivo = new Map();
  for (const b of baixados) {
    if (b.status >= 400) erros.push(`${nome}: ${b.arq} respondeu ${b.status}`);
    if (b.arq.endsWith('/') || !/\.[a-z0-9]+$/i.test(b.arq)) continue; // a própria página
    if (!porArquivo.has(b.arq)) porArquivo.set(b.arq, new Set());
    porArquivo.get(b.arq).add(b.versao || '(sem carimbo)');
  }
  // 🟥 piso: sem estático capturado, a prova não mediu nada e sairia verde. Basta um
  // redirecionamento de domínio (sem www → www) para o filtro de origem descartar tudo.
  if (!porArquivo.size) erros.push(`${nome}: nenhum estático capturado — a prova não está medindo a página`);
  for (const [arq, versoes] of porArquivo) {
    if (versoes.size > 1) {
      erros.push(`${nome}: ${arq} foi baixado ${versoes.size}× com endereços diferentes — ${[...versoes].join(' e ')}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log(`${PAGS.length} páginas com cache frio`);
if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ nada é baixado duas vezes e nada responde erro');
