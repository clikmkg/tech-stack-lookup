# Fingerprint rules: source, license and changes

The files `technologies.json` and `categories.json` in this folder are derived from
**enthec/webappanalyzer** (https://github.com/enthec/webappanalyzer), licensed under the
**GNU General Public License v3.0** (full text: `LICENSE` in this folder).
Credit and copyright belong to the webappanalyzer project and its contributors.

Upstream snapshot: see `SOURCE.json` (commit `71132ddc2714cbff7e66d520f98767412e304d03`, 2026-11-10).

## We modified these files

Changes made by Clik Marketing LLC on 2026-11-14 with `scripts/build-rules.js`:

1. All per-letter technology files were merged into one `technologies.json`.
2. Removed fields this Actor does not use: `description`, `icon`, `pricing`, `cpe`.
3. Removed detection fields that need a real browser or other network lookups, which this Actor
   does not perform: `js`, `xhr`, `dns`, `certIssuer`, `robots`, `probe`.
4. All other patterns are unchanged.

To rebuild from a newer upstream checkout: `node scripts/build-rules.js /path/to/webappanalyzer`.
These modified files are distributed under the same GPL-3.0 license.
