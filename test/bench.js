// Fetch each test site once (cached in test/cache), then time extract+analyze per site.
import fs from 'node:fs';
import { fetchPage, detectBlock } from '../src/fetch-page.js';
import { loadRules, extractPage, analyze } from '../src/engine.js';
const sites = Object.keys(JSON.parse(fs.readFileSync('test/sites.json')));
fs.mkdirSync('test/cache', { recursive: true });
const rules = loadRules();
for (const s of process.argv.slice(2).length ? process.argv.slice(2) : sites) {
    const f = `test/cache/${s}.json`;
    let p;
    if (fs.existsSync(f)) p = JSON.parse(fs.readFileSync(f));
    else { try { p = await fetchPage(`https://${s}/`); fs.writeFileSync(f, JSON.stringify(p)); } catch (e) { console.log(s, 'ERR', e.message); continue; } }
    const t1 = performance.now();
    const ex = extractPage({ html: p.html, headers: p.headers, cookies: p.cookies, url: p.finalUrl });
    const t2 = performance.now();
    const r = analyze(rules, ex);
    const t3 = performance.now();
    console.log(s.padEnd(16), p.status, String(p.html.length).padStart(8), 'extract', (t2 - t1).toFixed(0).padStart(5), 'analyze', (t3 - t2).toFixed(0).padStart(6), 'ms', detectBlock(p) || '', r.length);
}
