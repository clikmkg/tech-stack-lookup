// Independent "ground truth" for the main platforms, from raw markers in the fetched page
// (asset hosts / headers each platform always serves). Used only to score the engine.
export function markerPlatform(p) {
    const h = p.html || ''; const hd = JSON.stringify(p.headers || {}).toLowerCase();
    const m = [];
    if (/cdn\.shopify\.com|shopify\.theme|myshopify\.com/i.test(h) || /x-shopid|shopify/i.test(hd)) m.push('Shopify');
    if (/cdn11\.bigcommerce\.com|bigcommerce\.com\/s-|stencil-utils/i.test(h)) m.push('BigCommerce');
    if (/\/wp-content\/|\/wp-includes\//i.test(h)) m.push('WordPress');
    if (/static1\.squarespace\.com|squarespace-cdn\.com|Static\.SQUARESPACE_CONTEXT/i.test(h)) m.push('Squarespace');
    if (/static\.parastorage\.com|static\.wixstatic\.com/i.test(h) || /x-wix-request-id/i.test(hd)) m.push('Wix');
    if (/data-wf-site|data-wf-page|website-files\.com|assets\.website-files\.com/i.test(h)) m.push('Webflow');
    return m;
}
