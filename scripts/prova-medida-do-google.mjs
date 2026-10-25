// Título de 30 a 60 caracteres e descrição de 120 a 160 em TODA página .html do site (a mesma
// régua do painel Saúde do site, IDEAL em src/api/lib/site/saudeDoSite.ts do M5Group; 25/10 o painel
// acusou descrição curta que esta prova deixava passar).
// Acima disso o Google corta no resultado e a medição de SEO cai (19/10: 9,7 → 8,6 por 3 títulos e 3 descrições longas).
// Uso: node scripts/prova-medida-do-google.mjs [--sabotar]
import { readFileSync, readdirSync } from 'node:fs';
const sabotar = process.argv.includes('--sabotar');
const des = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const falhas = [];
let paginas = 0;
for (const a of readdirSync('.').filter(f => f.endsWith('.html'))) {
  let h = readFileSync(a, 'utf8');
  if (sabotar && a === 'index.html') h = h.replace(/<title>/, '<title>' + 'x'.repeat(70));
  if (!/<meta name="robots" content="[^"]*noindex/.test(h)) paginas++; else continue;
  const t = h.match(/<title>([^<]*)<\/title>/);
  const d = h.match(/<meta name="description" content="([^"]*)"/);
  if (!t) falhas.push(`${a}: sem <title>`);
  else if ([...des(t[1])].length > 60 || [...des(t[1])].length < 30) falhas.push(`${a}: título com ${[...des(t[1])].length} caracteres (de 30 a 60)`);
  if (!d) falhas.push(`${a}: sem descrição`);
  else if ([...des(d[1])].length > 160 || [...des(d[1])].length < 120) falhas.push(`${a}: descrição com ${[...des(d[1])].length} caracteres (de 120 a 160)`);
}
if (paginas < 10) falhas.push(`só ${paginas} páginas lidas: a prova não está olhando o site`);
if (falhas.length) { console.error('❌ medida do Google:\n' + falhas.join('\n')); process.exit(1); }
console.log(`✅ ${paginas} páginas com título de 30 a 60 e descrição de 120 a 160`);
