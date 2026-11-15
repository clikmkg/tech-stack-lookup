// Build a small, bounded set of public URL variants for sites that fail before
// returning an HTTP response. This does not bypass bot protection: challenge
// responses are handled by fetch-page.js and remain blocked/free.

const RETRYABLE_CODES = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE',
    'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
    'ERR_CONNECTION_RESET', 'ERR_CONNECTION_REFUSED', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR', 'ERR_SSL_PROTOCOL_ERROR',
    'ERR_TLS_HANDSHAKE_TIMEOUT', 'TIMEOUTERROR', 'FETCH_ERROR', 'DNS', 'ENOTFOUND', 'EAI_AGAIN',
]);

export function errorCode(err) {
    return String(err?.cause?.code || err?.code || err?.name || 'FETCH_ERROR').toUpperCase();
}

export function isRetryableConnectionError(err) {
    const code = errorCode(err);
    if (RETRYABLE_CODES.has(code)) return true;
    const message = String(err?.cause?.message || err?.message || '').toLowerCase();
    return /connection reset|connection refused|socket hang up|tls|ssl|network|dns|timed out|timeout/.test(message);
}

function add(out, value) {
    if (!out.includes(value)) out.push(value);
}

/** Return at most four equivalent public endpoints, preserving path/query. */
export function connectionCandidates(startUrl) {
    const original = new URL(startUrl);
    const out = [original.toString()];
    const host = original.hostname.toLowerCase();
    const alternateHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;

    const hostVariant = new URL(original);
    hostVariant.hostname = alternateHost;
    add(out, hostVariant.toString());

    // If TLS or the origin's HTTPS endpoint is unavailable, an HTTP endpoint
    // may still redirect to a live canonical host. Never replace a successful
    // HTTPS response with HTTP; callers only use these after a failed attempt.
    const http = new URL(original);
    http.protocol = 'http:';
    add(out, http.toString());
    const httpHostVariant = new URL(hostVariant);
    httpHostVariant.protocol = 'http:';
    add(out, httpHostVariant.toString());
    return out;
}

