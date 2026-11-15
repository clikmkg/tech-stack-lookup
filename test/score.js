// Scores a local run: compares dataset rows with independent page markers (test/truth.js).
import fs from 'node:fs';
import { fetchPage } from '../src/fetch-page.js';
import { markerPlatform } from './truth.js';
const expected = JSON.parse(fs.readFileSync('test/sites.json'));
const rows = fs.readdirSync('storage/datasets/default').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(`storage/datasets/default/${f}`)));
const byDomain = new Map(rows.map((r) => [r.domain, r]));
const out = []; let withMarker = 0; let agree = 0;
for (const [d, exp] of Object.entries(expected)) {
    const r = byDomain.get(d.replace(/^www\./, ''));
    if (!r) { out.push({ d, exp, status: 'missing' }); continue; }
    let truth = [];
    if (r.status === 'ok') {
        const f = `test/cache/${d}.json`;
        let p = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : null;
        if (!p) { try { p = await fetchPage(r.finalUrl); fs.writeFileSync(f, JSON.stringify(p)); } catch { p = null; } }
        truth = p ? markerPlatform(p) : [];
    }
    const got = [r.platform, r.cms, r.ecommercePlatform].filter(Boolean);
    let verdict = '';
    if (r.status !== 'ok') verdict = r.status;
    else if (truth.length) { withMarker++; const ok = truth.some((t) => got.some((g) => g.startsWith(t))); if (ok) agree++; verdict = ok ? 'MATCH' : 'MISS'; }
    else verdict = got.length ? 'no-marker (engine says ' + got[0] + ')' : 'no platform (custom?)';
    out.push({ d, listedAs: exp, status: r.status, platform: r.platform, cms: r.cms, ecom: r.ecommercePlatform, hosting: (r.hosting || []).join('/'), cdn: (r.cdn || []).join('/'), markers: truth.join('/'), verdict, ms: r.responseTimeMs, why: r.blockedBy || r.errorCode || '' });
}
console.table(out);
console.log({ sites: out.length, ok: out.filter((o) => o.status === 'ok').length, blocked: out.filter((o) => o.status === 'blocked').length, error: out.filter((o) => o.status === 'error').length, withPlatformMarkers: withMarker, engineAgrees: agree });
