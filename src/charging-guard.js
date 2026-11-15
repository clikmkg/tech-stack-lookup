// Pay-per-event guard. Actor.pushData(items, 'site-read') into the DEFAULT dataset can trigger two
// events per item: our 'site-read' AND Apify's synthetic 'apify-default-dataset-item' (if the
// creator left a price on it in Console). The SDK (3.7.2 calculatePushDataLimits) budgets with the
// combined price; this guard does the same up front so we (a) never push items the SDK would trim,
// (b) never hit the SDK's "push one extra item so the platform stops the run" path, (c) count
// delivered/charged items exactly, and (d) can warn loudly when the default event is priced.

export const DEFAULT_DATASET_ITEM_EVENT = 'apify-default-dataset-item';

export function createChargeGuard(charging, { eventName, isAtHome, isDefaultDataset = true }) {
    const info = charging.getPricingInfo();
    const isPpe = !!info.isPayPerEvent;
    const prices = info.perEventPrices || {};
    // Mirror the SDK: on the platform the configured price (unset = free); locally every event costs
    // 1 USD so budget limits can be tested.
    const priceOf = (e) => (isAtHome ? Number(prices[e] || 0) : 1);
    const sitePrice = priceOf(eventName);
    // The SDK only adds the default-dataset event when the push goes to the run's default dataset
    // (dataset.id === config defaultDatasetId); that is always true on the platform.
    const defaultItemPrice = isDefaultDataset ? priceOf(DEFAULT_DATASET_ITEM_EVENT) : 0;
    const perItemUsd = sitePrice + defaultItemPrice;
    const events = [...new Set([...Object.keys(prices), eventName, DEFAULT_DATASET_ITEM_EVENT])];

    const spentUsd = () => events.reduce((sum, e) => sum + charging.getChargedEventCount(e) * priceOf(e), 0);
    const maxTotal = () => charging.getMaxTotalChargeUsd();

    /** How many more items can be pushed (each costing perItemUsd) within the user's max charge. */
    function room() {
        if (!isPpe || perItemUsd <= 0) return Infinity;
        const raw = (maxTotal() - spentUsd()) / perItemUsd;
        return Math.max(0, Math.floor(Number(raw.toFixed(4))));
    }

    /** Trim a batch so pushData will push and charge every item in it (never more than the SDK allows). */
    function fit(batch) {
        const n = Math.min(batch.length, room());
        if (n <= 0) return [];
        if (isPpe) {
            // Cross-check with the SDK's own per-event budget so we never trigger its overcharge-by-one.
            if (sitePrice > 0 && charging.calculateMaxEventChargeCountWithinLimit(eventName) <= 0) return [];
            if (defaultItemPrice > 0 && charging.calculateMaxEventChargeCountWithinLimit(DEFAULT_DATASET_ITEM_EVENT) <= 0) return [];
        }
        // The SDK's exact pushData budgeting (combined price of both events) has the final word.
        const { limitedItems } = charging.calculatePushDataLimits({ items: batch.slice(0, n), eventName, isDefaultDataset });
        return limitedItems.slice(0, n);
    }

    const warnings = [];
    if (isPpe && isAtHome && Number(prices[DEFAULT_DATASET_ITEM_EVENT] || 0) > 0) {
        warnings.push(`Pricing has a price on "${DEFAULT_DATASET_ITEM_EVENT}" ($${prices[DEFAULT_DATASET_ITEM_EVENT]}/item) in addition to "${eventName}" ($${sitePrice}/item). Every site is charged BOTH (combined $${perItemUsd}/site). Delete the default dataset item event in Console > Publication > Monetization. The run caps sites using the combined price so the user's max charge is respected.`);
    }
    if (isPpe && isAtHome && !(Number(prices[eventName] || 0) > 0)) {
        warnings.push(`Pay-per-event pricing is active but "${eventName}" has no price configured; sites are not being charged by this Actor's event.`);
    }

    return {
        isPpe, sitePrice, defaultItemPrice, perItemUsd, room, fit, warnings,
        sitesChargedSoFar: () => charging.getChargedEventCount(eventName),
        summary: () => ({
            payPerEvent: isPpe, siteReadPriceUsd: sitePrice, defaultDatasetItemPriceUsd: defaultItemPrice,
            combinedPricePerJobUsd: perItemUsd, maxTotalChargeUsd: maxTotal(), spentUsd: +spentUsd().toFixed(6),
            isAtHome, pushesToDefaultDataset: isDefaultDataset, warnings,
        }),
    };
}
