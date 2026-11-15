# Website Tech Stack Lookup: before publishing

Status (Nov 14, 2026): **built and tested locally on the box only.** Not deployed, not pushed, not published. Nothing spent.

## Must do before publishing (needs Scott's OK at each step)
1. **Scott approves publishing** this Actor under the existing Apify account (clikmkg).
2. **Platform test run** (`apify push`, then one run of ~50 sites). Our box sits behind a network proxy, so 3 of 25 test sites could not be reached here at all; re-check those on Apify, and measure the real compute cost per 1,000 sites from the run's usage. Cost on the Free plan: a few cents of the free $5 credit.
3. **Pricing in Console > Publication > Monetization** (see `.actor/pay_per_event.json`):
   - Custom event `site-read`, title "Website read", **$0.005** (= $5 per 1,000), primary event.
   - Keep `apify-actor-start` at Apify's default ($0.00005).
   - **Delete `apify-default-dataset-item`** (price must be 0), otherwise free blocked/error rows would be billed and read sites billed twice. The code warns in the log and in `RUN_SUMMARY.charging.warnings` if this is priced.
   - Leave "pay per event + usage" off.
4. **GPL compliance:** publish the source code publicly (e.g. a public GitHub repo) with `LICENSE`, `rules/LICENSE`, `rules/NOTICE.md` and `rules/SOURCE.json` kept. Link it from the README.
5. **Listing text:** never use the old upstream product name in the Actor name, title, description or README. (Checked: none of our files use it.)
6. **Store default input** must return results within 5 minutes (the prefill of 3 sites takes ~5 seconds).
7. Generate an icon; categories: Lead generation, Developer tools / SEO tools.

## Nice to have later
- Optional "full browser" mode (separate event, higher price) to catch ad pixels and analytics loaded by scripts.
- DNS-based detection (email provider via MX records, hosting via IP), which the rules support but v0.1 skips.
- Weekly refresh of the fingerprints from upstream (`node scripts/build-rules.js <checkout>`).
