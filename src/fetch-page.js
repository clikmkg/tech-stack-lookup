// One polite, browser-like GET of a site's page (no browser, no proxy). Follows redirects by hand
// so cookies set on each hop are kept (some sites loop or 403 without them) and recorded for rules.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE_HEADERS = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
};

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 10;

async function readCapped(res) {
    if (!res.body) return { text: '', bytes: 0, truncated: false };
    const reader = res.body.getReader();
    const chunks = []; let bytes = 0; let truncated = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length; chunks.push(value);
        if (bytes >= MAX_BYTES) { truncated = true; await reader.cancel().catch(() => {}); break; }
    }
    return { text: new TextDecoder('utf-8').decode(Buffer.concat(chunks)), bytes, truncated };
}

/**
 * @returns {{ finalUrl, status, headers: Record<string,string>, cookies: [string,string][], html, bytes, truncated, redirects }}
 */
export async function fetchPage(startUrl, { timeoutMs = 20000 } = {}) {
    const signal = AbortSignal.timeout(timeoutMs);
    const jar = new Map();
    const cookies = [];
    let url = startUrl;
    const hops = [];
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        const headers = { ...BASE_HEADERS };
        const host = new URL(url).hostname;
        const cookieHeader = [...jar.entries()].filter(([, c]) => host.endsWith(c.domain)).map(([k, c]) => `${k}=${c.value}`).join('; ');
        if (cookieHeader) headers.Cookie = cookieHeader;
        const res = await fetch(url, { headers, redirect: 'manual', signal });
        for (const sc of res.headers.getSetCookie?.() || []) {
            const [pair, ...attrs] = sc.split(';');
            const eq = pair.indexOf('=');
            if (eq <= 0) continue;
            const name = pair.slice(0, eq).trim(); const value = pair.slice(eq + 1).trim();
            const dAttr = attrs.map((a) => a.trim()).find((a) => /^domain=/i.test(a));
            jar.set(name, { value, domain: dAttr ? dAttr.slice(7).replace(/^\./, '').toLowerCase() : host });
            cookies.push([name, value]);
        }
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
            await res.body?.cancel().catch(() => {});
            hops.push({ url, status: res.status });
            url = new URL(loc, url).toString();
            continue;
        }
        const { text, bytes, truncated } = await readCapped(res);
        const hdrs = {};
        res.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
        return { finalUrl: url, status: res.status, headers: hdrs, cookies, html: text, bytes, truncated, redirects: hops };
    }
    throw Object.assign(new Error(`Too many redirects (>${MAX_REDIRECTS})`), { code: 'TOO_MANY_REDIRECTS' });
}

// Bot-wall / challenge pages. Matching any of these means we did not see the real site.
const CHALLENGES = [
    { by: 'Cloudflare', re: /<title>\s*(just a moment|attention required|access denied)[^<]*<\/title>|cf-chl-|challenge-platform|cf_chl_opt/i },
    { by: 'Akamai', re: /<title>\s*access denied\s*<\/title>[\s\S]{0,2000}(edgesuite|akamai|reference\s*#)/i },
    { by: 'PerimeterX / HUMAN', re: /px-captcha|<title>\s*access to this page has been denied/i },
    { by: 'DataDome', re: /geo\.captcha-delivery\.com|ct\.captcha-delivery\.com/i },
    { by: 'Imperva / Incapsula', re: /_Incapsula_Resource|incapsula incident|Request unsuccessful\. Incapsula/i },
    { by: 'AWS WAF', re: /awsWafCookieDomainList|gokuProps/ },
    { by: 'Vercel', re: /vercel security checkpoint/i },
    { by: 'Sucuri', re: /sucuri website firewall|sucuri-cloudproxy/i },
    { by: 'generic bot check', re: /<title>[^<]*(captcha|are you a robot|verify you are human|bot check|client challenge|bot verification|checking your browser|security check)[^<]*<\/title>|enable javascript and cookies|please wait while we verify/i },
];

const PARKED = [
    /<title>[^<]*(domain|website)[^<]*(for sale|parked|coming soon)[^<]*<\/title>/i,
    /(?:this domain|this website)\s+(?:is\s+)?(?:for sale|parked)/i,
    /buy this domain|domain parking|domain may be for sale/i,
];

/** Returns null when the page looks real, or a short reason when it's a block/challenge. */
export function detectBlock({ status, html, headers }) {
    const small = html.length < 60000;
    for (const c of CHALLENGES) {
        // Big real pages can mention vendor names (e.g. a DataDome-protected store loads its tag);
        // only treat markers as a block on small pages or on blocking status codes.
        if ((small || [401, 403, 429, 503].includes(status)) && c.re.test(html)) return c.by;
    }
    if (headers['cf-mitigated'] === 'challenge') return 'Cloudflare';
    if (status === 403 || status === 429 || status === 401) return `HTTP ${status}`;
    if (status === 503 && small) return 'HTTP 503';
    return null;
}

/** Returns a reason when a response is a low-value parked/placeholder domain. */
export function detectParked({ status, html }) {
    if (status >= 400 || html.length > 100000) return null;
    return PARKED.find((re) => re.test(html)) ? 'parked domain' : null;
}
