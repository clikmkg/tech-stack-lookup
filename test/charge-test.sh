#!/usr/bin/env bash
# Local pay-per-event checks (no Apify account needed). Prices are fake test values.
set -e
cd "$(dirname "$0")/.."
run() { name=$1; shift; echo "== $name"; env "$@" apify run --purge 2>&1 | grep -E "Done|WARN|Max charge" || true
  python3 -c "import json;d=json.load(open('storage/key_value_stores/default/RUN_SUMMARY.json'));print({k:d.get(k) for k in ['ok','blocked','error','charged','notChecked','stopReason']}); print('charging', d['charging'])"; }
run ppe_cap5 ACTOR_TEST_PAY_PER_EVENT=true ACTOR_USE_CHARGING_LOG_DATASET=true ACTOR_MAX_TOTAL_CHARGE_USD=5 \
  APIFY_ACTOR_PRICING_INFO='{"pricingModel":"PAY_PER_EVENT","pricingPerEvent":{"actorChargeEvents":{"site-read":{"eventTitle":"Website read","eventPriceUsd":1}}}}' APIFY_CHARGED_ACTOR_EVENT_COUNTS='{}'
run ppe_nocap ACTOR_TEST_PAY_PER_EVENT=true ACTOR_USE_CHARGING_LOG_DATASET=true ACTOR_MAX_TOTAL_CHARGE_USD=1000 \
  APIFY_ACTOR_PRICING_INFO='{"pricingModel":"PAY_PER_EVENT","pricingPerEvent":{"actorChargeEvents":{"site-read":{"eventTitle":"Website read","eventPriceUsd":1}}}}' APIFY_CHARGED_ACTOR_EVENT_COUNTS='{}'
ls storage/datasets/ 
