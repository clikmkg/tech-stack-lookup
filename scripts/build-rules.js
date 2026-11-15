// Builds rules/ from a local checkout of https://github.com/enthec/webappanalyzer (GPL-3.0).
// Usage: node scripts/build-rules.js /path/to/webappanalyzer
// MODIFICATIONS (recorded in rules/NOTICE.md): technologies merged into one file; fields that this
// Actor cannot evaluate from a single plain HTTP fetch (js, xhr, dns, certIssuer, robots, probe) and
// non-detection metadata (description, icon, pricing, cpe) are removed. Patterns are otherwise unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const src = process.argv[2];
if (!src) { console.error('usage: build-rules.js <webappanalyzer dir>'); process.exit(1); }
const KEEP = ['cats', 'website', 'saas', 'oss', 'implies', 'excludes', 'requires', 'requiresCategory',
    'url', 'html', 'scriptSrc', 'scripts', 'meta', 'headers', 'cookies', 'dom', 'text', 'css'];
const DETECT = ['url', 'html', 'scriptSrc', 'scripts', 'meta', 'headers', 'cookies', 'dom', 'text', 'css'];

const techDir = path.join(src, 'src', 'technologies');
const out = {};
let total = 0; let noPassive = 0;
for (const f of fs.readdirSync(techDir).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(techDir, f), 'utf8'));
    for (const [name, t] of Object.entries(d)) {
        total++;
        const o = {};
        for (const k of KEEP) if (t[k] !== undefined) o[k] = t[k];
        if (!DETECT.some((k) => o[k] !== undefined)) noPassive++;
        out[name] = o;
    }
}
const dst = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'rules');
fs.mkdirSync(dst, { recursive: true });
fs.writeFileSync(path.join(dst, 'technologies.json'), JSON.stringify(out));
const cats = JSON.parse(fs.readFileSync(path.join(src, 'src', 'categories.json'), 'utf8'));
fs.writeFileSync(path.join(dst, 'categories.json'), JSON.stringify(cats));
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(dst, 'LICENSE'));
let commit = 'unknown'; let date = 'unknown';
try {
    commit = execSync('git rev-parse HEAD', { cwd: src }).toString().trim();
    date = execSync('git log -1 --format=%cI', { cwd: src }).toString().trim();
} catch { /* not a git checkout */ }
fs.writeFileSync(path.join(dst, 'SOURCE.json'), JSON.stringify({
    upstream: 'https://github.com/enthec/webappanalyzer', commit, commitDate: date, license: 'GPL-3.0',
    technologies: total, technologiesWithoutPlainHttpPatterns: noPassive, builtAt: new Date().toISOString(),
}, null, 2));
console.log(`rules: ${total} technologies (${noPassive} only detectable with a browser/DNS, kept for implies), commit ${commit}`);
