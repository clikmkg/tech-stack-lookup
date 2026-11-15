# Test report: Website Tech Stack Lookup v0.1 (local, box only)

Date: Nov 14, 2026 (Mountain Time). Runs: `apify run` locally; no deploy. Raw logs: `test/run1.log` (first 26-site pass, before fixes), `test/run2.log`, `test/run3.log`; final rows: `test/sample-output.json`; scorer: `test/score.js` (compares results with independent page markers in `test/truth.js`).

## Final 25-site run
| Group | Sites | Result |
|---|---|---|
| Shopify | allbirds, gymshark, brooklinen, colourpop | 4/4 Shopify |
| WordPress | techcrunch, whitehouse.gov, wordpress.org | 3/3 WordPress (techcrunch also: WordPress VIP hosting) |
| Squarespace | squarespace.com, weddingsbylisanicole.com, jonesbarbq.com | 2/2 Squarespace; jonesbarbq unreachable from box |
| Wix | wix.com, adamgrant.net, thesaltydonut.com | wix.com = Wix; adamgrant.net is now WordPress (correct; list was outdated); saltydonut unreachable from box |
| Webflow | webflow.com, jasper.ai, notarize.com | 3/3 Webflow |
| BigCommerce | solostove, kingarthurbaking, perpetualkid | solostove blocked (Cloudflare); King Arthur = Drupal (store is not on BigCommerce homepage); perpetualkid unreachable from box |
| Big brands | nike, amazon, apple, walmart, target, nytimes | nike/apple/walmart/target read, no off-the-shelf platform (custom); amazon blocked (AWS WAF); nytimes blocked (DataDome) |

- Read OK: 19/25 (76%). Blocked: 3/25 (12%). Unreachable: 3/25 (12%); our box's network proxy fails them (curl gets the same proxy 500), so this is likely our test network, not the tool. Re-check on Apify.
- Platform/CMS: of the 19 read, 15 run a known platform; **15/15 identified correctly** (14 confirmed by independent markers, King Arthur's Drupal not independently checked). The other 4 are custom-built brand sites, correctly shown with no platform.
- Earlier pass also tried time.com (Contentstack), bathhouse.com (Sanity/Next.js, no longer Squarespace), slite.com (Sanity), objective.com (Craft CMS), soilboy.com and skullcandy.com (both now Shopify), bensherman.com (custom ASP.NET, no platform), bestbuy.com (custom). Several "example" lists were out of date; the tool showed the current platform.
- Ad pixels/analytics: mostly missed, as expected (e.g. gymshark shows no analytics). Google Tag Manager is usually seen.

## Speed and cost
- Average time per site: ~2.1 s (10 sites at once). Whole 26-site run: 6.6 s on the box.
- CPU: ~0.33 s of analysis per read site; ~7.4 CPU-seconds for the 26-site run including start-up.
- Peak memory: ~450-490 MB with 10 at once, so default memory is set to 1 GB.
- **Estimated** Apify compute: ~$0.10-$0.30 per 1,000 sites on Free/Starter ($0.20 per compute unit; 1 GB = 1/4 CPU core). Assumes Apify CPUs are 1-2x slower than the box. Not yet measured on Apify. At 1 GB, 1,000 sites would take roughly 25-50 minutes (estimate); more memory makes it faster at about the same cost.
- Planned revenue: $5 per 1,000 sites read, ~$4.00 to us after Apify's 20%. Estimated compute is ~3-8% of that.

## Charging checks (local, fake prices)
- Max charge $5, $1 per site: stopped cleanly at 4 sites, never over the cap (`stopReason: max charge per run reached`).
- Normal run: 19 `site-read` events for 19 read sites; blocked and error rows had no charge (`charged: false`).
- Unit tests: `npm test` (6 pass).

## Fixed during testing
- Generic labels ("Cart Functionality", "WebsiteBuilder") were showing up as the platform; now ignored for the summary fields.
- "Wix eCommerce" / "Squarespace Commerce" now report Wix / Squarespace as the platform.
- Analysis was ~1-3 s per big page; a word-index pre-check cut it ~3.5x with identical results.
- A plain-http fallback that gets a 5xx no longer hides the real https error.

## Known gaps
- No browser: script-loaded pixels and analytics are often missed (stated in README).
- Some big retailers/publishers block plain requests (12% of this sample).
- Rules for JS variables, DNS, TLS certificates are skipped in v0.1.
- One regex rule (for a Russian counter) is slow on very large pages (~0.25 s); harmless but could be optimized.
- On the box, DNS failures look like connection resets (proxy); on Apify, real DNS errors will show as `errorCode: DNS`.

## Scorer output
```
┌─────────┬────────────────────────────┬───────────────┬───────────┬───────────────┬───────────────┬────────────────────────┬───────────────────────┬───────────────────────────────────────────────────────────────┬───────────────┬──────────────────────────────────┬──────┬──────────────────────────────────────┐
│ (index) │ d                          │ listedAs      │ status    │ platform      │ cms           │ ecom                   │ hosting               │ cdn                                                           │ markers       │ verdict                          │ ms   │ why                                  │
├─────────┼────────────────────────────┼───────────────┼───────────┼───────────────┼───────────────┼────────────────────────┼───────────────────────┼───────────────────────────────────────────────────────────────┼───────────────┼──────────────────────────────────┼──────┼──────────────────────────────────────┤
│ 0       │ 'allbirds.com'             │ 'Shopify'     │ 'ok'      │ 'Shopify'     │ null          │ 'Shopify'              │ ''                    │ 'Cloudflare'                                                  │ 'Shopify'     │ 'MATCH'                          │ 3228 │ ''                                   │
│ 1       │ 'gymshark.com'             │ 'Shopify'     │ 'ok'      │ 'Shopify'     │ null          │ 'Shopify'              │ 'Amazon Web Services' │ 'Cloudflare'                                                  │ 'Shopify'     │ 'MATCH'                          │ 1881 │ ''                                   │
│ 2       │ 'brooklinen.com'           │ 'Shopify'     │ 'ok'      │ 'Shopify'     │ null          │ 'Shopify'              │ ''                    │ 'Cloudflare'                                                  │ 'Shopify'     │ 'MATCH'                          │ 2811 │ ''                                   │
│ 3       │ 'colourpop.com'            │ 'Shopify'     │ 'ok'      │ 'Shopify'     │ null          │ 'Shopify'              │ 'Amazon Web Services' │ 'Cloudflare'                                                  │ 'Shopify'     │ 'MATCH'                          │ 1625 │ ''                                   │
│ 4       │ 'techcrunch.com'           │ 'WordPress'   │ 'ok'      │ 'WordPress'   │ 'WordPress'   │ null                   │ 'WordPress VIP'       │ 'Cloudflare'                                                  │ 'WordPress'   │ 'MATCH'                          │ 475  │ ''                                   │
│ 5       │ 'whitehouse.gov'           │ 'WordPress'   │ 'ok'      │ 'WordPress'   │ 'WordPress'   │ null                   │ ''                    │ ''                                                            │ 'WordPress'   │ 'MATCH'                          │ 654  │ ''                                   │
│ 6       │ 'wordpress.org'            │ 'WordPress'   │ 'ok'      │ 'WordPress'   │ 'WordPress'   │ null                   │ ''                    │ ''                                                            │ 'WordPress'   │ 'MATCH'                          │ 1734 │ ''                                   │
│ 7       │ 'squarespace.com'          │ 'Squarespace' │ 'ok'      │ 'Squarespace' │ 'Squarespace' │ 'Squarespace Commerce' │ ''                    │ ''                                                            │ 'Squarespace' │ 'MATCH'                          │ 2174 │ ''                                   │
│ 8       │ 'weddingsbylisanicole.com' │ 'Squarespace' │ 'ok'      │ 'Squarespace' │ 'Squarespace' │ 'Squarespace Commerce' │ ''                    │ ''                                                            │ 'Squarespace' │ 'MATCH'                          │ 1815 │ ''                                   │
│ 9       │ 'jonesbarbq.com'           │ 'Squarespace' │ 'error'   │ undefined     │ undefined     │ undefined              │ ''                    │ ''                                                            │ ''            │ 'error'                          │ 28   │ 'ECONNRESET'                         │
│ 10      │ 'wix.com'                  │ 'Wix'         │ 'ok'      │ 'Wix'         │ 'Wix'         │ 'Wix eCommerce'        │ 'Google Cloud'        │ 'Google Cloud CDN'                                            │ 'Wix'         │ 'MATCH'                          │ 4536 │ ''                                   │
│ 11      │ 'adamgrant.net'            │ 'Wix'         │ 'ok'      │ 'WordPress'   │ 'WordPress'   │ null                   │ 'Flywheel'            │ ''                                                            │ 'WordPress'   │ 'MATCH'                          │ 1264 │ ''                                   │
│ 12      │ 'thesaltydonut.com'        │ 'Wix'         │ 'error'   │ undefined     │ undefined     │ undefined              │ ''                    │ ''                                                            │ ''            │ 'error'                          │ 1067 │ 'ECONNRESET'                         │
│ 13      │ 'webflow.com'              │ 'Webflow'     │ 'ok'      │ 'Webflow'     │ 'Webflow'     │ null                   │ 'Amazon Web Services' │ 'Amazon S3/cdnjs/Cloudflare/Google Hosted Libraries/jsDelivr' │ 'Webflow'     │ 'MATCH'                          │ 1753 │ ''                                   │
│ 14      │ 'jasper.ai'                │ 'Webflow'     │ 'ok'      │ 'Webflow'     │ 'Webflow'     │ null                   │ ''                    │ 'Cloudflare/jsDelivr'                                         │ 'Webflow'     │ 'MATCH'                          │ 3137 │ ''                                   │
│ 15      │ 'notarize.com'             │ 'Webflow'     │ 'ok'      │ 'Webflow'     │ 'Webflow'     │ null                   │ ''                    │ 'Cloudflare/jsDelivr/Unpkg'                                   │ 'Webflow'     │ 'MATCH'                          │ 2871 │ ''                                   │
│ 16      │ 'solostove.com'            │ 'BigCommerce' │ 'blocked' │ undefined     │ undefined     │ undefined              │ ''                    │ ''                                                            │ ''            │ 'blocked'                        │ 2735 │ 'Cloudflare'                         │
│ 17      │ 'kingarthurbaking.com'     │ 'BigCommerce' │ 'ok'      │ 'Drupal'      │ 'Drupal'      │ null                   │ 'Pantheon'            │ 'Fastly'                                                      │ ''            │ 'no-marker (engine says Drupal)' │ 3070 │ ''                                   │
│ 18      │ 'perpetualkid.com'         │ 'BigCommerce' │ 'error'   │ undefined     │ undefined     │ undefined              │ ''                    │ ''                                                            │ ''            │ 'error'                          │ 1033 │ 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' │
│ 19      │ 'nike.com'                 │ 'brand'       │ 'ok'      │ null          │ null          │ null                   │ ''                    │ 'Akamai/cdnjs/Cloudflare'                                     │ ''            │ 'no platform (custom?)'          │ 4518 │ ''                                   │
│ 20      │ 'amazon.com'               │ 'brand'       │ 'blocked' │ undefined     │ undefined     │ undefined              │ ''                    │ ''                                                            │ ''            │ 'blocked'                        │ 2279 │ 'AWS WAF'                            │
│ 21      │ 'apple.com'                │ 'brand'       │ 'ok'      │ null          │ null          │ null                   │ ''                    │ ''                                                            │ ''            │ 'no platform (custom?)'          │ 2574 │ ''                                   │
│ 22      │ 'walmart.com'              │ 'brand'       │ 'ok'      │ null          │ null          │ null                   │ ''                    │ 'Akamai'                                                      │ ''            │ 'no platform (custom?)'          │ 3809 │ ''                                   │
│ 23      │ 'target.com'               │ 'brand'       │ 'ok'      │ null          │ null          │ null                   │ ''                    │ ''                                                            │ ''            │ 'no platform (custom?)'          │ 3811 │ ''                                   │
│ 24      │ 'nytimes.com'              │ 'brand'       │ 'blocked' │ undefined     │ undefined     │ undefined              │ ''                    │ ''                                                            │ ''            │ 'blocked'                        │ 806  │ 'DataDome'                           │
└─────────┴────────────────────────────┴───────────────┴───────────┴───────────────┴───────────────┴────────────────────────┴───────────────────────┴───────────────────────────────────────────────────────────────┴───────────────┴──────────────────────────────────┴──────┴──────────────────────────────────────┘
{
  sites: 25,
  ok: 19,
  blocked: 3,
  error: 3,
  withPlatformMarkers: 14,
  engineAgrees: 14
}
```
