/**
 * incident-logger.js
 *
 * Logs confirmed fire/smoke/fight incidents to localStorage.
 * Used by both the live detection system (app.js) and the dashboard (dashboard.js).
 */

const IncidentLogger = (() => {
    const STORAGE_KEY = 'godown_incidents';

    function getAll() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function save(incidents) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents));
    }

    /**
     * Log a new incident.
     * @param {Object} opts
     * @param {number} opts.godownId    - 1–5
     * @param {string} opts.type        - 'fire' | 'smoke' | 'fight'
     * @param {number} opts.confidence  - 0.0–1.0
     * @param {string} [opts.status]    - 'active' | 'resolved' (default: 'active')
     */
    function log({ godownId, type, confidence, status = 'active' }) {
        const incidents = getAll();
        const incident = {
            id: `INC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            godownId,
            type,
            confidence: Math.round(confidence * 100) / 100,
            timestamp: new Date().toISOString(),
            status,
            alertSent: true,
        };
        incidents.push(incident);
        save(incidents);
        return incident;
    }

    /**
     * Resolve an active incident for a godown+type combo.
     */
    function resolve(godownId, type) {
        const incidents = getAll();
        for (let i = incidents.length - 1; i >= 0; i--) {
            if (incidents[i].godownId === godownId &&
                incidents[i].type === type &&
                incidents[i].status === 'active') {
                incidents[i].status = 'resolved';
                incidents[i].resolvedAt = new Date().toISOString();
                break;
            }
        }
        save(incidents);
    }

    /**
     * Query incidents with filters.
     */
    function query({ godownId, type, status, since, until } = {}) {
        let results = getAll();
        if (godownId) results = results.filter(i => i.godownId === godownId);
        if (type)     results = results.filter(i => i.type === type);
        if (status)   results = results.filter(i => i.status === status);
        if (since)    results = results.filter(i => new Date(i.timestamp) >= new Date(since));
        if (until)    results = results.filter(i => new Date(i.timestamp) <= new Date(until));
        return results;
    }

    function clear() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function count(filters) {
        return query(filters).length;
    }

    return { log, resolve, query, count, getAll, clear };
})();
