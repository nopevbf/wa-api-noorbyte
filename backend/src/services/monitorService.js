const db = require('../config/database');
const { normalizePhoneNumber } = require('../helpers/validators');

/**
 * Builds a standard PN JID from a normalized phone number.
 */
function buildPnJid(phone) {
    if (!phone) return null;
    return `${phone}@s.whatsapp.net`;
}

/**
 * Adds or updates a monitor target.
 */
function addMonitorTarget(apiKey, targetInput) {
    const isGroup = targetInput.endsWith('@g.us');
    const targetType = isGroup ? 'group' : 'personal';
    const phone = isGroup ? null : normalizePhoneNumber(targetInput);
    const pnJid = isGroup ? null : buildPnJid(phone);
    const groupJid = isGroup ? targetInput : null;
    const status = isGroup ? 'resolved' : 'waiting_first_message';

    try {
        db.prepare(`
            INSERT INTO monitor_targets (api_key, target_input, target_type, phone, pn_jid, group_jid, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(api_key, target_input) DO UPDATE SET
                target_type = excluded.target_type,
                phone = excluded.phone,
                pn_jid = excluded.pn_jid,
                group_jid = excluded.group_jid
        `).run(apiKey, targetInput, targetType, phone, pnJid, groupJid, status);

        console.log(`[MonitorService] Saved monitor target:`, {
            target_input: targetInput,
            target_type: targetType,
            phone,
            pn_jid: pnJid,
            lid_jid: null,
            group_jid: groupJid,
            status
        });
    } catch (err) {
        console.error('[MonitorService] Error adding target:', err.message);
    }
}

/**
 * Syncs the list of targets from a raw comma-separated string.
 */
function syncTargets(apiKey, rawTargetsString) {
    const rawTargets = (rawTargetsString || '').split(',')
        .map(t => t.trim())
        .filter(t => t !== '');

    // Get current targets in DB
    const currentTargets = db.prepare('SELECT target_input FROM monitor_targets WHERE api_key = ?').all(apiKey)
        .map(row => row.target_input);

    // Add new targets
    rawTargets.forEach(t => {
        if (!currentTargets.includes(t)) {
            addMonitorTarget(apiKey, t);
        }
    });

    // Remove deleted targets
    currentTargets.forEach(t => {
        if (!rawTargets.includes(t)) {
            db.prepare('DELETE FROM monitor_targets WHERE api_key = ? AND target_input = ?').run(apiKey, t);
        }
    });
}

/**
 * Finds a resolved target for an incoming JID.
 */
function findResolvedTarget(apiKey, incomingJid) {
    // Normalize JID (remove device ID if present)
    const cleanJid = incomingJid.split(':')[0].split('@')[0] + '@' + incomingJid.split('@')[1];

    return db.prepare(`
        SELECT * FROM monitor_targets 
        WHERE api_key = ? 
          AND (pn_jid = ? OR lid_jid = ? OR group_jid = ? OR phone = ?)
          AND status = 'resolved'
    `).get(apiKey, cleanJid, cleanJid, cleanJid, cleanJid.split('@')[0]);
}

/**
 * Saves an unknown incoming JID as a candidate for manual binding.
 */
function saveUnknownIncomingCandidate(apiKey, incomingJid, remoteJid, participantJid) {
    const cleanJid = incomingJid.split(':')[0].split('@')[0] + '@' + incomingJid.split('@')[1];
    
    db.prepare(`
        INSERT INTO monitor_identity_candidates (api_key, incoming_jid, remote_jid, participant_jid, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(api_key, incoming_jid) DO UPDATE SET
            remote_jid = excluded.remote_jid,
            participant_jid = excluded.participant_jid,
            updated_at = CURRENT_TIMESTAMP
    `).run(apiKey, cleanJid, remoteJid, participantJid);
}

/**
 * Tries to resolve a waiting target automatically using "First Message Sync".
 */
function tryResolveWaitingTarget(apiKey, incomingJid, remoteJid, participantJid) {
    const cleanJid = incomingJid.split(':')[0].split('@')[0] + '@' + incomingJid.split('@')[1];
    const isLid = cleanJid.endsWith('@lid');
    const isPn = cleanJid.endsWith('@s.whatsapp.net');

    if (isPn) {
        // Direct match by Phone Number
        const target = db.prepare(`
            SELECT * FROM monitor_targets 
            WHERE api_key = ? AND pn_jid = ? AND status = 'waiting_first_message'
        `).get(apiKey, cleanJid);

        if (target) {
            db.prepare(`
                UPDATE monitor_targets 
                SET status = 'resolved', last_resolved_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(target.id);
            console.log(`[MonitorService] Auto-resolved PN target: ${target.target_input} -> ${cleanJid}`);
            return { ...target, status: 'resolved' };
        }
    }

    if (isLid) {
        // Check how many targets are waiting for this device
        const waitingTargets = db.prepare(`
            SELECT * FROM monitor_targets 
            WHERE api_key = ? AND status = 'waiting_first_message' AND target_type = 'personal'
        `).all(apiKey);

        if (waitingTargets.length === 1) {
            // Auto-bind because there is only one ambiguity
            const target = waitingTargets[0];
            db.prepare(`
                UPDATE monitor_targets 
                SET lid_jid = ?, status = 'resolved', last_resolved_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(cleanJid, target.id);
            console.log(`[MonitorService] Auto-bind LID target: ${target.target_input} -> ${cleanJid}`);
            return { ...target, status: 'resolved', lid_jid: cleanJid };
        } else if (waitingTargets.length > 1) {
            // Multiple targets waiting, cannot auto-bind safely
            saveUnknownIncomingCandidate(apiKey, cleanJid, remoteJid, participantJid);
            console.log(`[MonitorService] Multiple targets pending, saved candidate: ${cleanJid}`);
        }
    }

    return null;
}

/**
 * Manually binds a candidate to a target.
 */
function bindCandidateToTarget(candidateId, targetId) {
    const candidate = db.prepare('SELECT * FROM monitor_identity_candidates WHERE id = ?').get(candidateId);
    const target = db.prepare('SELECT * FROM monitor_targets WHERE id = ?').get(targetId);

    if (!candidate || !target) throw new Error('Candidate or Target not found.');

    db.prepare(`
        UPDATE monitor_targets 
        SET lid_jid = ?, status = 'resolved', last_resolved_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `).run(candidate.incoming_jid, target.id);

    db.prepare(`
        UPDATE monitor_identity_candidates 
        SET status = 'assigned', monitor_target_id = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `).run(target.id, candidate.id);

    return { success: true };
}

module.exports = {
    syncTargets,
    findResolvedTarget,
    tryResolveWaitingTarget,
    bindCandidateToTarget,
    saveUnknownIncomingCandidate
};
