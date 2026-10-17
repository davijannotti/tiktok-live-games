/**
 * tiktokEventNormalizer.js
 * Pure functions that normalize raw PirateTok payloads
 * into a consistent shape for downstream consumers (games, bridge, debug).
 *
 * @module lib/tiktokEventNormalizer
 */

/**
 * Extract consistent user object from raw TikTok data.
 * @param {Object} raw - Raw event data from PirateTok
 * @returns {{uniqueId: string, nickname: string, profilePictureUrl: string}}
 */
export function normalizeUser(raw) {
	return {
		uniqueId: raw.uniqueId || String(raw.id || ""),
		nickname: raw.nickname || raw.uniqueId || "Anonymous",
		profilePictureUrl: raw.avatarThumb?.urlList?.[0] || "",
	};
}

/**
 * Normalize chat event.
 * @param {Object} raw - Raw chat event
 * @returns {{user: Object, comment: string, timestamp: number}}
 */
export function normalizeChat(raw) {
	return {
		user: normalizeUser(raw.user || {}),
		comment: (raw.content || "").toLowerCase().trim(),
		timestamp: Date.now(),
	};
}

/**
 * Normalize like event.
 * @param {Object} raw - Raw like event
 * @returns {{user: Object, likeCount: number, totalLikeCount: number, timestamp: number}}
 */
export function normalizeLike(raw) {
	return {
		user: normalizeUser(raw.user || {}),
		likeCount: Number(raw.count || 0),
		totalLikeCount: Number(raw.total || 0),
		timestamp: Date.now(),
	};
}

/**
 * Normalize share event.
 * @param {Object} raw - Raw social event (filtered for shares only)
 * @returns {{user: Object, timestamp: number}}
 */
export function normalizeShare(raw) {
	return {
		user: normalizeUser(raw.user || {}),
		timestamp: Date.now(),
	};
}

/**
 * Categorize gift by diamond value.
 * @param {number} value - Diamond count
 * @returns {"small"|"medium"|"large"}
 */
export function categorizeGift(value) {
	if (value >= 100) return "large";
	if (value >= 10) return "medium";
	return "small";
}

/**
 * Normalize gift event — the canonical shape for all consumers.
 * Adds giftId which was previously missing.
 *
 * @param {Object} raw - Raw gift event from PirateTok
 * @returns {{user: Object, giftId: number, giftName: string, giftValue: number, repeatCount: number, streakType: number, repeatEnd: boolean, eventId: string, giftType: string, timestamp: number}}
 */
export function normalizeGift(raw) {
	const giftValue = Number(raw.gift?.diamondCount ?? 0);
	return {
		user: normalizeUser(raw.user || {}),
		giftId: Number(raw.giftId || raw.gift?.id || 0),
		giftName: raw.gift?.name || "Unknown Gift",
		giftValue,
		repeatCount: Number(raw.repeatCount ?? 1),
		streakType: Number(raw.gift?.type ?? 0),
		repeatEnd: Number(raw.repeatEnd) === 1,
		eventId: String(raw.common?.msgId || ""),
		giftType: categorizeGift(giftValue),
		timestamp: Date.now(),
	};
}
