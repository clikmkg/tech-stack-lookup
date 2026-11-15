import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRules, extractPage, analyze, summarize } from '../src/engine.js';
import { detectBlock, detectParked } from '../src/fetch-page.js';
import { connectionCandidates, isRetryableConnectionError } from '../src/connection-plan.js';

const rules = loadRules();
const run = (html, headers = {}, cookies = [], url = 'https://example.com/') => {
    const techs = analyze(rules, extractPage({ html, headers, cookies, url }));
    return { techs, sum: summarize(techs.map((t) => ({ ...t, categoryIds: t.categoryIds }))) };
};

test('loads all rules', () => { assert.ok(rules.techs.length > 7000); });

test('Shopify store from script src + cookie', () => {
    const { sum } = run('<html><head><script src="https://cdn.shopify.com/s/files/1/theme.js"></script></head><body>x</body></html>', {}, [['_shopify_y', 'abc']]);
    assert.equal(sum.ecommercePlatform, 'Shopify');
    assert.equal(sum.platform, 'Shopify');
});

test('WordPress with version from generator meta, implies PHP', () => {
    const { techs, sum } = run('<html><head><meta name="generator" content="WordPress 6.4.2"></head><body><link rel="stylesheet" href="/wp-content/themes/x/style.css"></body></html>');
    assert.equal(sum.cms, 'WordPress');
    assert.equal(techs.find((t) => t.name === 'WordPress').version, '6.4.2');
    assert.ok(techs.some((t) => t.name === 'PHP' && t.detectedVia === 'implied'));
});

test('header-based CDN', () => {
    const { sum } = run('<html><body>hello world page</body></html>', { server: 'cloudflare', 'cf-ray': '123-DEN' });
    assert.ok(sum.cdn.includes('Cloudflare'));
});

test('generic labels never become the platform', () => {
    const { sum } = run('<html><body><div class="checkout-button">Checkout</div><a href="/cart">Cart</a></body></html>');
    assert.notEqual(sum.ecommercePlatform, 'Cart Functionality');
});

test('block detection', () => {
    assert.equal(detectBlock({ status: 403, html: '<title>Just a moment...</title><script>cf_chl_opt={}</script>', headers: {} }), 'Cloudflare');
    assert.equal(detectBlock({ status: 200, html: '<html><title>Shop</title>' + 'x'.repeat(70000), headers: {} }), null);
    assert.equal(detectBlock({ status: 429, html: '', headers: {} }), 'HTTP 429');
    assert.equal(detectBlock({ status: 200, html: '<html><title>Bot Verification</title><p>Enable JavaScript and cookies</p></html>', headers: {} }), 'generic bot check');
    assert.equal(detectBlock({ status: 200, html: '<html><title>Client Challenge</title></html>', headers: {} }), 'generic bot check');
});

test('parked domains are identified as free non-reads', () => {
    assert.equal(detectParked({ status: 200, html: '<html><title>This Domain Is For Sale</title><p>Buy this domain</p></html>' }), 'parked domain');
    assert.equal(detectParked({ status: 200, html: '<html><title>Real website</title><p>Welcome to our store.</p></html>' }), null);
});

test('connection candidates preserve paths and cover both host/protocol variants', () => {
    assert.deepEqual(connectionCandidates('https://example.com/about?q=1'), [
        'https://example.com/about?q=1',
        'https://www.example.com/about?q=1',
        'http://example.com/about?q=1',
        'http://www.example.com/about?q=1',
    ]);
    assert.equal(connectionCandidates('https://www.example.com/')[1], 'https://example.com/');
});

test('connection fallback recognizes common proxy and TLS failures', () => {
    assert.equal(isRetryableConnectionError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })), true);
    assert.equal(isRetryableConnectionError(Object.assign(new Error('tls alert'), { code: 'ERR_SSL_PROTOCOL_ERROR' })), true);
    assert.equal(isRetryableConnectionError(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), true);
    assert.equal(isRetryableConnectionError(Object.assign(new Error('forbidden'), { code: 'HTTP_403' })), false);
});
