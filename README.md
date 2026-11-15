# Website Tech Stack Lookup: CMS, Ecommerce Platform & Hosting

Find out **what a website is built on**. Paste a list of domains and get, for each site, its **ecommerce platform** (Shopify, BigCommerce, WooCommerce, Magento...), **CMS or site builder** (WordPress, Wix, Squarespace, Webflow, Drupal...), **hosting**, **CDN**, web server and frameworks, plus the full list of technologies we found with versions and confidence.

Built for lead lists: "every Shopify store in this list", "which of these prospects run WordPress", "who hosts on WP Engine".

**$5 per 1,000 websites read.** You pay only for sites we actually read. Sites that block us, time out, don't exist or return an error come back **free**, clearly flagged.

## What it's good at, and what it isn't

This is a **platform and stack lookup**, not a full marketing-tag audit.

- **Good at:** the platform layer. Ecommerce platform, CMS/site builder, hosting, CDN, web server, front-end frameworks, many payment and review widgets. These show up in the page source and response headers, which is exactly what we read.
- **Will miss some marketing tags:** ad pixels (for example Facebook/Meta, TikTok), analytics and other tags that are **loaded later by scripts or by a tag manager** are often not in the page source, so we may not see them. When we do see them in the source we report them, but an empty `analytics` or `advertising` field does **not** mean the site doesn't use any.
- **Big sites with bot protection** (some large retailers and publishers) may block automated requests. Those rows are returned as `blocked`, free of charge.
- **Custom-built sites** (many big brands) correctly show no off-the-shelf platform; you still get CDN, frameworks and other detected tech.

## How it works

For each site we make **one normal web request to the page you give** (the homepage for a bare domain), the same way a browser asks for a page, and compare the response against roughly **7,700 open-source technology fingerprints**. No browser, no proxy, no logins. That keeps it fast and cheap.

## Input

| Field | What it does |
|---|---|
| `domains` | Domains (`allbirds.com`) or full URLs (`https://www.allbirds.com/pages/about`). Duplicates are removed. |
| `maxConcurrency` | Sites checked at the same time (default 10). |
| `timeoutSecs` | Give up on a site after this many seconds (default 20). Timeouts are free. |
| `includeAllTechnologies` | Include the full technology list (default on). Turn off for just the summary fields. |

```json
{ "domains": ["allbirds.com", "wordpress.org", "webflow.com"], "maxConcurrency": 10, "timeoutSecs": 20 }
```

## Output

One row per site.

| Field | What it is |
|---|---|
| `domain`, `input`, `finalUrl` | The site, what you typed, and the page we ended up on after redirects |
| `status` | `ok` (read and analyzed, charged), `blocked` (bot protection, free), `error` (unreachable, timeout, HTTP error, not a web page; free) |
| `charged` | Whether this row was billed |
| `platform` | The main platform: the ecommerce platform if there is one, otherwise the CMS / site builder |
| `cms`, `ecommercePlatform` | CMS or site builder, and ecommerce platform, when detected |
| `hosting`, `cdn`, `webServer`, `frameworks` | Infrastructure we could see |
| `analytics`, `tagManagers`, `advertising`, `marketingAutomation`, `paymentProcessors`, `liveChat` | Found in the page source (may be incomplete, see above) |
| `technologies` | Every technology found: `name`, `categories`, `version` (when known), `confidence` (0-100), `detectedVia` (`pattern` = seen directly, `implied` = inferred, e.g. WordPress implies PHP) |
| `blockedBy`, `errorCode`, `errorMessage`, `httpStatus` | Why a row is blocked or failed |
| `connectionAttempts`, `recoveredVia` | Public URL variants attempted after a connection-level failure; `recoveredVia` is present when an alternate origin succeeded |
| `checkedAt` | When we checked (ISO 8601, UTC) |

Example (shortened):

```json
{
  "domain": "gymshark.com",
  "status": "ok",
  "platform": "Shopify",
  "ecommercePlatform": "Shopify",
  "cms": null,
  "hosting": ["Amazon Web Services"],
  "cdn": ["Cloudflare"],
  "paymentProcessors": ["Apple Pay", "PayPal"],
  "technologies": [
    { "name": "Shopify", "categories": ["Ecommerce"], "version": null, "confidence": 100, "detectedVia": "pattern" }
  ],
  "checkedAt": "2026-11-15T05:02:08.444Z"
}
```

A blocked row is free:

```json
{ "domain": "solostove.com", "status": "blocked", "charged": false, "httpStatus": 403, "blockedBy": "Cloudflare", "technologies": [] }
```

A `RUN_SUMMARY` record in the run's key-value store has counts of read / blocked / failed sites, timing, and charging details.

## Pricing

Pay per event: **$5.00 per 1,000 websites read** (`site-read` event). Blocked sites, errors, timeouts and invalid inputs are not charged. Set a maximum cost per run and the run stops cleanly before going over it. Check the **Pricing** tab for the current rate.

## FAQ

**Why is a site I know uses Google Analytics showing no analytics?** Most analytics and ad tags are injected by scripts after the page loads. We read the page source only, so we can miss them. This tool is meant for the platform layer.

**Is this legal?** We request one public page per site, like any visitor's browser does, and read only what the site publicly serves. We don't log in or bypass protections: if a site blocks us, we stop and mark it `blocked`. You are responsible for how you use the results.

**How fresh is it?** Every run checks the live site. Nothing comes from a cached database.

**Need more speed?** Give the run more memory (for example 2-4 GB); it gets more CPU and checks more sites per minute.

## Open source and license

The technology fingerprints come from the open-source project **enthec/webappanalyzer** (https://github.com/enthec/webappanalyzer), licensed under **GPL-3.0**. We modified them (merged into one file and removed fields we don't use; see `rules/NOTICE.md`). This Actor's code is also released under **GPL-3.0** (see `LICENSE`). Thanks to the webappanalyzer contributors.
