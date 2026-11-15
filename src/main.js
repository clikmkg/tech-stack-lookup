// Website platform & tech stack lookup. One plain HTTP fetch per site (browser-like headers, no
// browser, no proxy), fingerprinted with the enthec/webappanalyzer rules (GPL-3.0).
// Pay per event: only sites we actually read are charged ("site-read"). Blocked and error rows are free.
import { Actor, log } from 'apify';
import { loadRules, extractPage, analyze, summarize } from './engine.js';
import { fetchPage, detectBlock, detectParked } from './fetch-page.js';
import { createChargeGuard } from './charging-guard.js';
import { connectionCandidates, errorCode, isRetryableConnectionError } from './connection-plan.js';

const CHARGE_EVENT = 'site-read';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const t0 = Date.now();

const rawList = [...(input.domains || []), ...(input.urls || [])].map((x) => (typeof x === 'string' ? x : x?.url)).filter(Boolean);
const maxConcurrency = Math.min(50, Math.max(1, Number(input.maxConcurrency) || 10));
const timeoutMs = Math.min(60, Math.max(5, Number(input.timeoutSecs) || 20)) * 1000;
const includeAllTechnologies = input.includeAllTechnologies !== false;

function normalize(raw) {
    let s = String(raw).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
    let u;
    try { u = new URL(s); } catch { return null; }
    if (!u.hostname.includes('.') || /[^a-z0-9.\-]/i.test(u.hostname)) return null;
    // Block local / private targets: this Actor only reads public websites.
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) || /^(\d+\.){3}\d+$/.test(u.hostname)) return null;
    u.hash = '';
    return { input: String(raw).trim(), domain: u.hostname.toLowerCase().replace(/^www\./, ''), url: u.toString() };
}

const seen = new Set(); const targets = []; const invalid = [];
for (const r of rawList) {
    const n = normalize(r);
    if (!n) { invalid.push(String(r)); continue; }
    if (seen.has(n.domain + new URL(n.url).pathname)) continue;
    seen.add(n.domain + new URL(n.url).pathname);
    targets.push(n);
}
if (!targets.length) {
    await Actor.setValue('RUN_SUMMARY', { invalidInputs: invalid, message: 'No valid domains or URLs in the input' });
    await Actor.fail('No valid domains or URLs found. Provide at least one, e.g. "allbirds.com".');
}
log.info(`Checking ${targets.length} sites (concurrency ${maxConcurrency}, timeout ${timeoutMs / 1000}s). ${invalid.length} invalid inputs skipped.`);

let rules;
try {
    rules = loadRules();
    log.info(`Loaded ${rules.techs.length} technology fingerprints.`);
} catch (err) {
    const message = String(err?.message || err).slice(0, 500);
    log.exception(err, 'Unable to load technology fingerprint rules');
    await Actor.setValue('RUN_SUMMARY', {
        sitesRequested: targets.length,
        invalidInputs: invalid,
        ok: 0,
        blocked: 0,
        error: 0,
        charged: 0,
        stopReason: 'rules failed to load',
        errorCode: 'RULES_INVALID',
        errorMessage: message,
    });
    await Actor.fail(`Unable to load technology fingerprint rules: ${message}`);
}

const charging = Actor.getChargingManager();
const datasetInfo = await (await Actor.openDataset()).getInfo().catch(() => null);
const isDefaultDataset = !Actor.isAtHome() || !datasetInfo || datasetInfo.id === Actor.getEnv().defaultDatasetId;
const guard = createChargeGuard(charging, { eventName: CHARGE_EVENT, isAtHome: Actor.isAtHome(), isDefaultDataset });
for (const w of guard.warnings) log.warning(w);
log.info(`Max charge for this run: ${charging.getMaxTotalChargeUsd()} USD; price per site read: ${guard.isPpe ? guard.perItemUsd : 'n/a (not pay-per-event)'}`);

const counts = { ok: 0, blocked: 0, error: 0, charged: 0, notStartedBudget: 0 };
let inFlight = 0; let stopReason = null;
const timings = [];
let analysisMsTotal = 0; let analysedCount = 0;
const cpuStart = process.cpuUsage();

async function attempt(url, budgetMs = timeoutMs) {
    try { return { page: await fetchPage(url, { timeoutMs: Math.max(1000, budgetMs) }) }; } catch (err) { return { err }; }
}
const errText = (err) => {
    const code = errorCode(err);
    if (err?.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return { code: 'TIMEOUT', message: `No response within ${timeoutMs / 1000}s` };
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { code: 'DNS', message: 'Domain does not resolve' };
    return { code: code || 'FETCH_ERROR', message: String(err?.cause?.message || err?.message || err).slice(0, 200) };
};

async function checkSite(t) {
    const started = Date.now();
    const connectionAttempts = [t.url];
    let recoveredVia = null;
    const base = { domain: t.domain, input: t.input, requestedUrl: t.url, connectionAttempts };
    const remaining = () => timeoutMs - (Date.now() - started);
    const candidates = connectionCandidates(t.url);
    // Reserve half the site budget for alternate origins so a timeout can still
    // try www/apex and HTTP variants without exceeding timeoutSecs overall.
    let { page, err } = await attempt(t.url, candidates.length > 1 ? Math.floor(timeoutMs / 2) : timeoutMs);
    // Try the alternate public origin only for connection-level failures. A
    // 401/403/429/challenge is a real response and must stay blocked, not be
    // retried as if it were an unreachable site.
    if (err && isRetryableConnectionError(err)) {
        const fallbacks = candidates.slice(1);
        for (let i = 0; i < fallbacks.length; i++) {
            const candidate = fallbacks[i];
            if (remaining() <= 0) break;
            connectionAttempts.push(candidate);
            const attemptsLeft = fallbacks.length - i;
            const r = await attempt(candidate, Math.floor(remaining() / attemptsLeft));
            if (r.page && r.page.status < 500) { page = r.page; err = null; recoveredVia = candidate; break; }
            if (r.err) err = r.err;
        }
    }
    const checkedAt = new Date().toISOString();
    let row;
    if (err) {
        const e = errText(err);
        row = { ...base, finalUrl: null, status: 'error', charged: false, httpStatus: null, errorCode: e.code, errorMessage: e.message, technologies: [], checkedAt };
    } else {
        const blockedBy = detectBlock(page);
        const parkedBy = detectParked(page);
        const isHtml = /html|xml/i.test(page.headers['content-type'] || 'text/html');
        if (blockedBy) {
            row = { ...base, finalUrl: page.finalUrl, status: 'blocked', charged: false, httpStatus: page.status, blockedBy, technologies: [], checkedAt };
        } else if (parkedBy) {
            row = { ...base, finalUrl: page.finalUrl, status: 'error', charged: false, httpStatus: page.status,
                errorCode: 'PARKED_DOMAIN', errorMessage: 'Parked or placeholder domain', technologies: [], checkedAt };
        } else if (page.status >= 400 || !isHtml || page.html.trim().length < 50) {
            row = { ...base, finalUrl: page.finalUrl, status: 'error', charged: false, httpStatus: page.status,
                errorCode: page.status >= 400 ? `HTTP_${page.status}` : (!isHtml ? 'NOT_HTML' : 'EMPTY_PAGE'),
                errorMessage: page.status >= 400 ? `Site answered HTTP ${page.status}` : (!isHtml ? `Content-Type ${page.headers['content-type']}` : 'Empty page'), technologies: [], checkedAt };
        } else {
            const a0 = performance.now();
            const ex = extractPage({ html: page.html, headers: page.headers, cookies: page.cookies, url: page.finalUrl });
            const techs = analyze(rules, ex);
            analysisMsTotal += performance.now() - a0; analysedCount++;
            const title = ex.$('title').first().text().trim().slice(0, 200) || null;
            row = {
                ...base, finalUrl: page.finalUrl, status: 'ok', charged: guard.isPpe, httpStatus: page.status, pageTitle: title,
                ...summarize(techs),
                technologyCount: techs.length,
                technologies: includeAllTechnologies ? techs.map(({ categoryIds, ...r }) => r) : [],
                pageBytes: page.bytes, pageTruncated: page.truncated,
                checkedAt,
            };
        }
    }
    if (recoveredVia && row.status === 'ok') row.recoveredVia = recoveredVia;
    row.responseTimeMs = Date.now() - started;
    timings.push({ ms: row.responseTimeMs, status: row.status });
    return row;
}

let pushChain = Promise.resolve();
const push = (row) => (pushChain = pushChain.then(async () => {
    if (row.status === 'ok') {
        const batch = guard.fit([row]);
        if (!batch.length) { stopReason = 'max charge per run reached'; counts.notStartedBudget++; return; }
        await Actor.pushData(batch, CHARGE_EVENT);
        counts.charged++;
    } else {
        if (guard.defaultItemPrice > 0 && guard.room() < 1) { stopReason = 'max charge per run reached'; return; }
        await Actor.pushData(row); // free row: no charge event
    }
    counts[row.status]++;
}));

let next = 0;
await Promise.all(Array.from({ length: Math.min(maxConcurrency, targets.length) }, async () => {
    while (next < targets.length) {
        // Never start more sites than the user's max charge can pay for (each in-flight site may be billable).
        if (guard.isPpe && guard.room() - inFlight <= 0) { stopReason = stopReason || 'max charge per run reached'; break; }
        const t = targets[next++];
        inFlight++;
        let row;
        try { row = await checkSite(t); } catch (e) {
            row = { domain: t.domain, input: t.input, requestedUrl: t.url, finalUrl: null, status: 'error', charged: false, errorCode: 'INTERNAL', errorMessage: String(e.message).slice(0, 200), technologies: [], checkedAt: new Date().toISOString() };
            log.exception(e, `Internal error on ${t.domain}`);
        }
        await push(row);
        inFlight--;
        log.info(`${row.status.padEnd(7)} ${t.domain} ${row.platform ? `-> ${row.platform}` : row.blockedBy || row.errorCode || ''} (${row.responseTimeMs ?? '?'} ms)`);
    }
}));
await pushChain;

const ms = timings.map((x) => x.ms);
const summary = {
    sitesRequested: targets.length, invalidInputs: invalid, ...counts,
    notChecked: targets.length - (counts.ok + counts.blocked + counts.error),
    stopReason,
    avgResponseMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null,
    avgAnalysisMsPerReadSite: analysedCount ? Math.round(analysisMsTotal / analysedCount) : null,
    processCpuSec: +((process.cpuUsage(cpuStart).user + process.cpuUsage(cpuStart).system) / 1e6).toFixed(2),
    durationSec: +((Date.now() - t0) / 1000).toFixed(1),
    maxRssMb: Math.round(process.memoryUsage().rss / 1e6),
    rules: { technologies: rules.techs.length, source: 'https://github.com/enthec/webappanalyzer (GPL-3.0), modified' },
    charging: guard.summary(),
};
await Actor.setValue('RUN_SUMMARY', summary);
const msg = `Done: ${counts.ok} read (charged ${counts.charged}), ${counts.blocked} blocked (free), ${counts.error} errors (free)${stopReason ? `; stopped: ${stopReason}` : ''}.`;
log.info(msg);
await Actor.exit(msg);
