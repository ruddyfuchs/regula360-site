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
import { abrirNavegador } from './navegador.mjs';

const BASE = process.argv[2] || 'https://www.regula360.com.br';
const PAGS = ['', 'diagnostico-e-painel', 'regularizacao-e-gestao-ativa', 'gestao-mensal-de-boletos', 'auditoria-e-recuperacao', 'privacidade', 'blog', 'blog-como-conferir-boleto-do-condominio'];

const browser = await abrirNavegador();
const erros = [];

// Abre a página com cache frio e devolve o que foi baixado da própria origem, e o erro da abertura, se houve.
async function medir(p) {
  // contexto novo por página: cache frio, que é o que o visitante novo vive
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const baixados = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BASE).origin) return;
    baixados.push({ arq: u.pathname, versao: u.searchParams.get('v'), status: r.status(), url: r.url() });
  });
  let erroAbrir = null;
  await page.goto(`${BASE}/${p}`, { waitUntil: 'networkidle' }).catch((e) => { erroAbrir = String(e.message || e).split(String.fromCharCode(10))[0]; });
  await page.waitForTimeout(500);
  await ctx.close();
  return { baixados, erroAbrir };
}

for (const p of PAGS) {
  const nome = p || 'home';
  let { baixados, erroAbrir } = await medir(p);
  // 🪤 (16/10) Duas vezes a conferência logo depois de publicar acusou "home: nenhum estático capturado" e,
  // rodada de novo, passou: a abertura falhava nos primeiros segundos do deploy e o erro era engolido em silêncio.
  // Uma 2ª tentativa só quando NADA foi capturado; se falhar de novo, o erro real da abertura vai para a mensagem.
  // O piso continua: página que nunca entrega estático reprova.
  if (!baixados.some((b) => /\.[a-z0-9]+$/i.test(b.arq) && !b.arq.endsWith('/'))) {
    await new Promise((r) => setTimeout(r, 5000));
    ({ baixados, erroAbrir } = await medir(p));
  }
  const porArquivo = new Map();
  for (const b of baixados) {
    if (b.status >= 400) erros.push(`${nome}: ${b.arq} respondeu ${b.status}`);
    if (b.arq.endsWith('/') || !/\.[a-z0-9]+$/i.test(b.arq)) continue; // a própria página
    if (!porArquivo.has(b.arq)) porArquivo.set(b.arq, new Set());
    porArquivo.get(b.arq).add(b.versao || '(sem carimbo)');
  }
  // 🟥 piso: sem estático capturado, a prova não mediu nada e sairia verde. Basta um
  // redirecionamento de domínio (sem www → www) para o filtro de origem descartar tudo.
  if (!porArquivo.size) erros.push(`${nome}: nenhum estático capturado em 2 tentativas — a prova não está medindo a página${erroAbrir ? ` (erro ao abrir: ${erroAbrir})` : ''}`);
  for (const [arq, versoes] of porArquivo) {
    if (versoes.size > 1) {
      erros.push(`${nome}: ${arq} foi baixado ${versoes.size}× com endereços diferentes — ${[...versoes].join(' e ')}`);
    }
  }
}

await browser.close();
console.log(`${PAGS.length} páginas com cache frio`);
if (erros.length) {
  console.log(`❌ ${erros.length} problemas:`);
  erros.forEach((e) => console.log('   ', e));
  process.exit(1);
}
console.log('✅ nada é baixado duas vezes e nada responde erro');
