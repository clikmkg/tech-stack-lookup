// Fingerprint engine for the enthec/webappanalyzer rule format (GPL-3.0).
// Evaluates only what a single plain HTTP fetch can see: final URL, response headers, cookies,
// HTML source, <meta> tags, <script src>, inline <script> content, inline <style>, page text and
// DOM selectors. JavaScript globals, XHR, DNS and TLS rules are not evaluated (no browser).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rules');

const toArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function parsePattern(str) {
    const parts = String(str).split('\\;');
    const out = { regex: null, confidence: 100, version: '' };
    try {
        // Rules are JavaScript regexes; same flags as the reference implementation.
        out.regex = new RegExp(parts[0].replace('/', '\\/'), 'i');
    } catch {
        return null;
    }
    for (const p of parts.slice(1)) {
        const i = p.indexOf(':');
        if (i < 0) continue;
        const k = p.slice(0, i); const v = p.slice(i + 1);
        if (k === 'confidence') out.confidence = Number(v) || 0;
        else if (k === 'version') out.version = v;
    }
    return out;
}

const parseList = (v) => toArray(v).map(parsePattern).filter(Boolean);
const parseMap = (obj) => {
    const out = [];
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj)) {
        for (const p of toArray(v)) { const pp = parsePattern(p); if (pp) out.push([k.toLowerCase(), pp]); }
    }
    return out;
};

function resolveVersion(pattern, value) {
    let resolved = pattern.version;
    if (!resolved) return '';
    const m = pattern.regex.exec(value);
    if (!m) return '';
    m.forEach((match, index) => {
        if (String(match ?? '').length > 15) return; // ignore long captures, as upstream does
        const ternary = new RegExp(`\\\\${index}\\?([^:]+):(.*)$`).exec(pattern.version);
        if (ternary && ternary.length === 3) resolved = pattern.version.replace(ternary[0], match ? ternary[1] : ternary[2]);
        resolved = resolved.trim().replace(new RegExp(`\\\\${index}`, 'g'), match || '');
    });
    return /^[\w.\-+ ]{1,30}$/.test(resolved) ? resolved.trim() : '';
}

// Cheap pre-check for DOM selectors: every word in at least one comma branch must occur in the HTML.
function selectorTokens(sel) {
    return sel.split(',').map((branch) => branch
        .replace(/:[a-z-]+(\([^)]*\))?/gi, ' ') // drop pseudo-classes
        .toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
}

function parseDom(dom) {
    const out = [];
    if (!dom) return out;
    if (typeof dom === 'string' || Array.isArray(dom)) {
        for (const sel of toArray(dom)) {
            const [s, ...rest] = String(sel).split('\\;');
            const conf = rest.map((r) => /^confidence:(\d+)/.exec(r)).find(Boolean);
            out.push({ selector: s, tokens: selectorTokens(s), exists: true, confidence: conf ? Number(conf[1]) : 100 });
        }
        return out;
    }
    for (const [sel, spec] of Object.entries(dom)) {
        const item = { selector: sel, tokens: selectorTokens(sel) };
        if (spec && typeof spec === 'object') {
            if (spec.exists !== undefined) item.exists = parsePattern(spec.exists || '') || { regex: /(?:)/, confidence: 100, version: '' };
            if (spec.text !== undefined) item.text = parsePattern(spec.text);
            if (spec.attributes) item.attributes = parseMap(spec.attributes);
            // spec.properties needs a live browser; ignored.
        }
        if (item.exists || item.text || (item.attributes && item.attributes.length)) out.push(item);
    }
    return out;
}

export function loadRules(dir = RULES_DIR) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'technologies.json'), 'utf8'));
    const categories = JSON.parse(fs.readFileSync(path.join(dir, 'categories.json'), 'utf8'));
    const techs = [];
    for (const [name, t] of Object.entries(raw)) {
        techs.push({
            name,
            cats: toArray(t.cats).map(Number),
            website: t.website,
            url: parseList(t.url),
            html: parseList(t.html),
            scriptSrc: parseList(t.scriptSrc),
            scripts: parseList(t.scripts),
            text: parseList(t.text),
            css: parseList(t.css),
            headers: parseMap(t.headers),
            cookies: parseMap(t.cookies),
            meta: parseMap(t.meta),
            dom: parseDom(t.dom),
            implies: toArray(t.implies).map((s) => { const [n, ...r] = String(s).split('\\;'); const c = r.map((x) => /^confidence:(\d+)/.exec(x)).find(Boolean); return { name: n, confidence: c ? Number(c[1]) : 100 }; }),
            excludes: toArray(t.excludes).map((s) => String(s).split('\\;')[0]),
            requires: toArray(t.requires).map((s) => String(s).split('\\;')[0]),
            requiresCategory: toArray(t.requiresCategory).map(Number),
        });
    }
    const byName = new Map(techs.map((t) => [t.name, t]));
    return { techs, byName, categories };
}

/** Extract everything the rules can look at from one fetched page. */
export function extractPage({ html, headers, cookies, url }) {
    const $ = cheerio.load(html, { scriptingEnabled: false });
    const scriptSrc = []; const scripts = []; const meta = [];
    $('script').each((_, el) => {
        const src = $(el).attr('src');
        if (src) scriptSrc.push(src);
        else { const c = $(el).text(); if (c) scripts.push(c.slice(0, 200000)); }
    });
    $('meta').each((_, el) => {
        const key = ($(el).attr('name') || $(el).attr('property') || $(el).attr('http-equiv') || '').toLowerCase();
        const content = $(el).attr('content');
        if (key && content !== undefined) meta.push([key, content]);
    });
    const css = $('style').map((_, el) => $(el).text()).get().join('\n').slice(0, 300000);
    const text = $('body').text().replace(/\s+/g, ' ').slice(0, 300000);
    // Sorted unique words of the HTML: lets DOM selectors be skipped cheaply (binary-search prefix check)
    // instead of scanning the whole page once per selector.
    const words = [...new Set(html.toLowerCase().split(/[^a-z0-9]+/))].filter((w) => w.length >= 3).sort();
    return { $, html, words, headers, cookies, url, scriptSrc, scripts, scriptsJoined: scripts.join('\n'), meta, css, text };
}

function hasWordPrefix(words, tok) {
    let lo = 0; let hi = words.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (words[mid] < tok) lo = mid + 1; else hi = mid; }
    return lo < words.length && words[lo].startsWith(tok);
}

/** Run all rules against an extracted page. Returns technologies sorted by category priority/confidence. */
export function analyze(rules, page) {
    const found = new Map(); // name -> { confidence, versions:Set }
    const hit = (t, pattern, value, conf = pattern?.confidence ?? 100) => {
        let f = found.get(t.name);
        if (!f) { f = { confidence: 0, versions: new Set() }; found.set(t.name, f); }
        f.confidence = Math.min(100, f.confidence + conf);
        if (pattern && pattern.version) { const v = resolveVersion(pattern, value); if (v) f.versions.add(v); }
    };
    const testList = (t, patterns, values) => {
        for (const p of patterns) for (const v of values) { if (p.regex.test(v)) { hit(t, p, v); break; } }
    };
    const testMap = (t, patterns, map) => {
        for (const [k, p] of patterns) {
            const vals = map.get(k);
            if (!vals) continue;
            for (const v of vals) { if (p.regex.test(v)) { hit(t, p, v); break; } }
        }
    };
    const headerMap = new Map(Object.entries(page.headers).map(([k, v]) => [k.toLowerCase(), toArray(v)]));
    const cookieMap = new Map(); for (const [k, v] of page.cookies) cookieMap.set(k.toLowerCase(), [...(cookieMap.get(k.toLowerCase()) || []), v]);
    const metaMap = new Map(); for (const [k, v] of page.meta) metaMap.set(k, [...(metaMap.get(k) || []), v]);
    const badSelectors = analyze.badSelectors || (analyze.badSelectors = new Set());

    const evalTech = (t) => {
        if (t.url.length) testList(t, t.url, [page.url]);
        if (t.html.length) testList(t, t.html, [page.html]);
        if (t.scriptSrc.length && page.scriptSrc.length) testList(t, t.scriptSrc, page.scriptSrc);
        if (t.scripts.length && page.scriptsJoined) testList(t, t.scripts, [page.scriptsJoined]);
        if (t.text.length && page.text) testList(t, t.text, [page.text]);
        if (t.css.length && page.css) testList(t, t.css, [page.css]);
        if (t.headers.length) testMap(t, t.headers, headerMap);
        if (t.cookies.length) testMap(t, t.cookies, cookieMap);
        if (t.meta.length) testMap(t, t.meta, metaMap);
        for (const d of t.dom) {
            if (badSelectors.has(d.selector)) continue;
            if (!d.tokens.some((branch) => branch.every((tok) => hasWordPrefix(page.words, tok)))) continue;
            let els;
            try { els = page.$(d.selector); } catch { badSelectors.add(d.selector); continue; }
            if (!els.length) continue;
            if (d.exists === true) { hit(t, null, '', d.confidence); continue; }
            if (d.exists) hit(t, d.exists, '');
            if (d.text) { const txt = els.first().text(); if (d.text.regex.test(txt)) hit(t, d.text, txt); }
            if (d.attributes) {
                for (const [attr, p] of d.attributes) {
                    let done = false;
                    els.each((_, el) => { if (done) return; const v = page.$(el).attr(attr); if (v !== undefined && p.regex.test(v)) { hit(t, p, v); done = true; } });
                }
            }
        }
    };

    const withReq = [];
    for (const t of rules.techs) {
        if (t.requires.length || t.requiresCategory.length) { withReq.push(t); continue; }
        evalTech(t);
    }
    const applyImplies = () => {
        let changed = true; let guard = 0;
        while (changed && guard++ < 10) {
            changed = false;
            for (const [name, f] of [...found]) {
                const t = rules.byName.get(name);
                if (!t) continue;
                for (const imp of t.implies) {
                    if (!rules.byName.has(imp.name)) continue;
                    const c = Math.round((f.confidence * imp.confidence) / 100);
                    const g = found.get(imp.name);
                    if (!g) { found.set(imp.name, { confidence: c, versions: new Set(), implied: true }); changed = true; }
                    else if (g.confidence < c) { g.confidence = Math.min(100, Math.max(g.confidence, c)); changed = true; }
                }
            }
        }
    };
    applyImplies();
    const foundCats = () => new Set([...found.keys()].flatMap((n) => rules.byName.get(n)?.cats || []));
    const cats = foundCats();
    for (const t of withReq) {
        if (t.requires.length && !t.requires.every((r) => found.has(r))) continue;
        if (t.requiresCategory.length && !t.requiresCategory.some((c) => cats.has(c))) continue;
        evalTech(t);
    }
    applyImplies();
    for (const name of [...found.keys()]) {
        const t = rules.byName.get(name);
        for (const ex of t?.excludes || []) found.delete(ex);
    }

    const out = [];
    for (const [name, f] of found) {
        const t = rules.byName.get(name);
        if (!t || f.confidence <= 0) continue;
        const versions = [...f.versions].sort((a, b) => b.length - a.length);
        out.push({
            name,
            categories: t.cats.map((c) => rules.categories[c]?.name).filter(Boolean),
            categoryIds: t.cats,
            version: versions[0] || null,
            confidence: f.confidence,
            detectedVia: f.implied ? 'implied' : 'pattern',
            website: t.website || null,
            _priority: Math.min(...t.cats.map((c) => rules.categories[c]?.priority ?? 9)),
        });
    }
    out.sort((a, b) => a._priority - b._priority || b.confidence - a.confidence || a.name.localeCompare(b.name));
    return out.map(({ _priority, ...r }) => r);
}

// Generic labels that describe a feature, not a platform; never reported as cms/ecommercePlatform.
const GENERIC = new Set(['Cart Functionality', 'WebsiteBuilder']);
const pick = (techs, catIds) => techs.filter((t) => t.categoryIds.some((c) => catIds.includes(c)));
const firstReal = (techs, catIds) => {
    const list = pick(techs, catIds).filter((t) => !GENERIC.has(t.name));
    // Prefer direct pattern hits over implied ones, then confidence.
    list.sort((a, b) => (a.detectedVia === 'implied') - (b.detectedVia === 'implied') || b.confidence - a.confidence);
    return list[0]?.name ?? null;
};
const first = (techs, catIds) => pick(techs, catIds)[0]?.name ?? null;
const names = (techs, catIds) => pick(techs, catIds).map((t) => t.name);

/** Convenience top-level fields. */
export function summarize(techs) {
    const ecommercePlatform = firstReal(techs, [6]);
    const cms = firstReal(techs, [1, 51]);
    // "Wix eCommerce" / "Squarespace Commerce" are add-ons of the builder: report the builder as platform.
    const builderAddon = cms && ecommercePlatform && ecommercePlatform.toLowerCase().startsWith(cms.toLowerCase());
    return {
        platform: builderAddon ? cms : (ecommercePlatform || cms),
        cms,
        ecommercePlatform,
        hosting: names(techs, [62, 88, 63]),
        cdn: names(techs, [31]),
        webServer: first(techs, [22]),
        frameworks: names(techs, [12, 18, 57]),
        analytics: names(techs, [10]),
        tagManagers: names(techs, [42]),
        advertising: names(techs, [36, 77]),
        marketingAutomation: names(techs, [32, 75]),
        paymentProcessors: names(techs, [41, 91]),
        liveChat: names(techs, [52]),
    };
}
