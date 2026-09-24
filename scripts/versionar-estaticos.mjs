/**
 * Carimba o endereço de TODO arquivo estático que as páginas pedem, com a impressão
 * digital dele: `style.css?v=ab12cd34`, `main.js?v=…`, `hero-predio.webp?v=…`.
 *
 * 🪤 POR QUE ISTO EXISTE (23/09): o FAQ subiu e o dono abriu a página vendo uma lista
 * crua, sem nada do acordeão. O servidor estava certo; o navegador dele é que tinha o
 * CSS de dias atrás. Estático aqui é servido com 24 h de cache mais 7 dias de
 * `stale-while-revalidate` (e os ícones, com um ANO de `immutable`). Com o `?v=<hash>`
 * no HTML, mudar o arquivo muda o endereço e o navegador é obrigado a buscar.
 *
 * 🟥 E POR QUE ELE PASSOU A COBRIR TUDO, NO MESMO DIA. Este arquivo nasceu com uma
 * LISTA de nomes, e a lista errou CINCO vezes seguidas — sempre do mesmo jeito, sempre
 * descoberta por acidente:
 *   1º o CSS (a lista original)      4º o logo, pedido por `src=` e `srcset=`
 *   2º os ícones, com 1 ano de cache 5º o `main.js`, que monta menu, rodapé e botão —
 *   3º a og-image, que é meta            o dono viu a frase de ANTEONTEM no WhatsApp
 * Na sexta vez eu parei de acrescentar nomes. Uma lista de exceções só protege o que
 * alguém lembrou de escrever nela; quem escreve o próximo arquivo não lê esta lista.
 * Agora a regra é a inversa: **todo arquivo local que uma página pede é carimbado**, e
 * `--conferir` reprova se sobrar UM sem carimbo. Esquecer passou a ser o caminho difícil.
 *
 * Uso:  node scripts/versionar-estaticos.mjs            (carimba)
 *       node scripts/versionar-estaticos.mjs --conferir (só confere; sai 1 se faltar)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFERIR = process.argv.includes('--conferir');

// o que conta como estático servido com cache longo
const ATIVO = /\.(css|js|mjs|png|jpe?g|webp|avif|gif|svg|ico|webmanifest|woff2?|ttf|otf|mp4|webm|pdf)$/i;

// 🪤 a og-image não é pedida por href="arquivo": é META com URL ABSOLUTA, e quem guarda
// a prévia é o WhatsApp/LinkedIn/Facebook — por URL. Sem carimbo, eles seguem mostrando
// a imagem velha depois de trocada.
const SITE = 'https://www.regula360.com.br/';
const ABSOLUTAS = ['og-image.png'];

// 🟥 O HASH PRECISA SER O MESMO EM QUALQUER MÁQUINA (23/09).
// Descoberto logo depois do merge: o portão ficou VERMELHO num repositório recém
// atualizado, sem ninguém ter tocado em nada. O Git reescreve o fim de linha no
// checkout, e o `favicon.svg` vale 5432feec com LF e 62295b78 com CRLF. Duas
// consequências, as duas ruins:
//   · o portão acusa desatualizado em toda máquina que fizer checkout
//   · recarimbar com o hash do Windows põe no HTML um número que NÃO corresponde
//     ao arquivo que a Vercel serve, que vem do repositório, com LF
// Então: arquivo de TEXTO tem o hash calculado com CRLF normalizado para LF, que é
// como ele está guardado no repositório. Binário (png, jpg, webp) vai byte a byte —
// normalizar bytes de imagem corromperia o cálculo.
const TEXTO = /\.(css|js|mjs|svg|webmanifest|json|txt|xml)$/i;
const digitais = new Map();
const digital = (arq) => {
  if (!digitais.has(arq)) {
    let conteudo = readFileSync(join(RAIZ, arq));
    if (TEXTO.test(arq)) conteudo = Buffer.from(conteudo.toString('utf8').split('\r\n').join('\n'));
    digitais.set(arq, createHash('sha1').update(conteudo).digest('hex').slice(0, 8));
  }
  return digitais.get(arq);
};

/** É um arquivo estático DESTE repo? Devolve o nome no disco, ou null. */
const local = (url) => {
  if (/^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(url)) return null;
  const arq = url.split(/[?#]/)[0].replace(/^\.?\//, '');
  if (!arq || !ATIVO.test(arq)) return null;
  return existsSync(join(RAIZ, arq)) ? arq : null;
};

/**
 * 🟥 E A url() DO CSS, QUE EU ESQUECI NA PRIMEIRA VERSÃO DISTO (23/09).
 * Carimbei `href`, `src` e `srcset` e deixei de fora `url('hero-predio.webp')`, que
 * mora num <style> do index. Resultado medido no Lighthouse: o preload pedia
 * `hero-predio.webp?v=4a0c9bd7` e o CSS pedia `hero-predio.webp` — endereços
 * diferentes, MESMA foto, DUAS baixadas de 239 KB. O peso da home subiu de 351 KB
 * para 591 KB e o desempenho caiu de 90 para 73. Meia régua é pior que régua nenhuma:
 * carimbar só metade dos pedidos DUPLICA o download em vez de economizá-lo.
 */
const carimbarUrl = (texto) => texto.replace(/url\((['"]?)([^'")]+)\1\)/g, (inteiro, aspas, url) => {
  const arq = local(url);
  if (!arq) return inteiro;
  return `url(${aspas}${url.split('?')[0]}?v=${digital(arq)}${aspas})`;
});

// 🟥 declarados ANTES de qualquer laço (24/09). Moravam abaixo do laço dos .css, que
// já os usa: em JavaScript, `const` antes da linha dele é erro, não vazio. Este site
// não tem .css próprio, então o laço nunca rodou; no primeiro .css com url() o script
// QUEBRARIA em vez de carimbar. A prova-carimbo-css cobra.
const desatualizadas = [];
const desatualizadasCss = [];
const semCarimbo = new Map(); // arquivo -> páginas, só para o relatório
let mudadas = 0;

// os .css primeiro: o carimbo muda o conteúdo deles, e é o conteúdo que dá o hash
// com que o HTML vai pedi-los. Na ordem inversa, o HTML pediria uma versão que já
// não existe — e o portão ficaria vermelho para sempre.
for (const folha of readdirSync(RAIZ).filter((f) => f.endsWith('.css'))) {
  const antes = readFileSync(join(RAIZ, folha), 'utf8');
  const depois = carimbarUrl(antes);
  if (depois !== antes) {
    desatualizadasCss.push(folha);
    if (!CONFERIR) writeFileSync(join(RAIZ, folha), depois);
  }
}
digitais.clear();

// páginas em qualquer pasta, não só na raiz (24/09, trazido do site da M5, onde a
// primeira página de campanha em `campanha/` ia ao ar sem carimbo nenhum).
const FORA = new Set(['scripts', 'node_modules', '.git', '.github', '.vercel', '.claude']);
const listarPaginas = (dir = '') => readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = dir ? `${dir}/${e.name}` : e.name;
  if (e.isDirectory()) return FORA.has(e.name) || e.name.startsWith('.') ? [] : listarPaginas(rel);
  return e.name.endsWith('.html') ? [rel] : [];
});
const paginas = listarPaginas();

for (const p of paginas) {
  const antes = readFileSync(join(RAIZ, p), 'utf8');

  let depois = antes.replace(/(\b(?:src|href|srcset)=")([^"]+)(")/g, (inteiro, abre, url, fecha) => {
    const arq = local(url);
    if (!arq) return inteiro;
    if (!url.includes('?v=')) {
      if (!semCarimbo.has(arq)) semCarimbo.set(arq, []);
      semCarimbo.get(arq).push(p);
    }
    const limpo = url.split('?')[0];
    return `${abre}${limpo}?v=${digital(arq)}${fecha}`;
  });

  depois = carimbarUrl(depois);

  for (const arq of ABSOLUTAS) {
    if (!existsSync(join(RAIZ, arq))) continue;
    const alvo = (SITE + arq).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(content="${alvo})(\\?v=[a-f0-9]+)?(")`, 'g');
    depois = depois.replace(re, `$1?v=${digital(arq)}$3`);
  }

  if (depois !== antes) {
    desatualizadas.push(p);
    if (!CONFERIR) { writeFileSync(join(RAIZ, p), depois); mudadas++; }
  }
}

const resumo = [...digitais].map(([f, h]) => `${f}=${h}`).join(' · ');

if (CONFERIR) {
  if (desatualizadas.length || desatualizadasCss.length) {
    desatualizadasCss.forEach((f) => console.log(`❌ ${f}: url() sem carimbo (ou com carimbo velho)`));
    console.log(`❌ ${desatualizadas.length} páginas pedem estático com versão velha (ou sem versão):`);
    desatualizadas.forEach((p) => console.log('   ', p));
    if (semCarimbo.size) {
      console.log('   sem carimbo nenhum:');
      for (const [arq, onde] of semCarimbo) console.log(`      ${arq} (${onde.length} página${onde.length > 1 ? 's' : ''})`);
    }
    console.log('   rode: node scripts/versionar-estaticos.mjs');
    process.exit(1);
  }
  console.log(`✅ ${paginas.length} páginas · ${digitais.size} estáticos, todos carimbados na versão atual`);
} else {
  console.log(`✔ ${mudadas} de ${paginas.length} páginas carimbadas · ${digitais.size} estáticos`);
  if (mudadas) console.log(`   ${resumo}`);
}
