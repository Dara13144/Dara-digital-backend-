import { logger } from '../config/logger.js';

// In-memory cache for Roblox users (5 minutes TTL)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Checks and fetches profile & avatar for a Roblox username or User ID.
 * @param {string|number} query - Username (e.g. "Roblox", "Gamer123") or numeric User ID (e.g. "1")
 * @returns {Promise<{ found: boolean, user?: object, message?: string }>}
 */
export async function checkRobloxUser(query) {
  if (!query || typeof query !== 'string' && typeof query !== 'number') {
    return { found: false, message: 'Invalid Roblox username or ID provided.' };
  }

  const cleanQuery = String(query).trim();
  const isNumeric = /^\d+$/.test(cleanQuery);
  if (!isNumeric && cleanQuery.length < 2) {
    return { found: false, message: 'Roblox username must be at least 2 characters.' };
  }

  const cacheKey = cleanQuery.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const isNumeric = /^\d+$/.test(cleanQuery);
    let targetUser = null;

    if (isNumeric) {
      // Lookup directly by User ID
      try {
        const idRes = await fetch(`https://users.roblox.com/v1/users/${cleanQuery}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(6000)
        });
        if (idRes.ok) {
          const idData = await idRes.json();
          if (idData?.id) {
            targetUser = {
              id: idData.id,
              username: idData.name,
              displayName: idData.displayName || idData.name,
              hasVerifiedBadge: !!idData.hasVerifiedBadge,
              isBanned: !!idData.isBanned
            };
          }
        }
      } catch (err) {
        logger.warn(`Roblox direct ID lookup failed for ${cleanQuery}: ${err.message}`);
      }
    }

    // If not found yet by numeric ID or query is a username
    if (!targetUser) {
      const userRes = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          usernames: [cleanQuery],
          excludeBannedUsers: false
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (!userRes.ok) {
        throw new Error(`Roblox API responded with status ${userRes.status}`);
      }

      const userData = await userRes.json();
      const matched = userData?.data?.find(
        (u) => u.name?.toLowerCase() === cleanQuery.toLowerCase() || u.requestedUsername?.toLowerCase() === cleanQuery.toLowerCase()
      ) || userData?.data?.[0];

      if (matched && matched.id) {
        targetUser = {
          id: matched.id,
          username: matched.name,
          displayName: matched.displayName || matched.name,
          hasVerifiedBadge: !!matched.hasVerifiedBadge,
          isBanned: false
        };
      }
    }

    if (!targetUser) {
      const notFoundResult = {
        found: false,
        message: `No Roblox account found for "${cleanQuery}". Please verify your spelling.`
      };
      cache.set(cacheKey, { timestamp: Date.now(), data: notFoundResult });
      return notFoundResult;
    }

    // Fetch avatar headshot & bust thumbnails
    let avatarUrl = 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-310966282D3529E36976BF6B07B1DC90-Png/150/150/AvatarHeadshot/Png/isCircular';
    try {
      const thumbRes = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUser.id}&size=150x150&format=Png&isCircular=true`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
      );
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json();
        const img = thumbData?.data?.[0]?.imageUrl;
        if (img) avatarUrl = img;
      }
    } catch (err) {
      logger.warn(`Could not fetch Roblox avatar for user ${targetUser.id}: ${err.message}`);
    }

    const result = {
      found: true,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
        hasVerifiedBadge: targetUser.hasVerifiedBadge,
        isBanned: targetUser.isBanned,
        avatarUrl,
        profileUrl: `https://www.roblox.com/users/${targetUser.id}/profile`
      }
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: result });
    // Also cache by username and ID for subsequent fast hits
    cache.set(targetUser.username.toLowerCase(), { timestamp: Date.now(), data: result });
    cache.set(String(targetUser.id), { timestamp: Date.now(), data: result });

    return result;
  } catch (error) {
    logger.error(`Error checking Roblox user "${cleanQuery}": ${error.message}`);
    return {
      found: false,
      message: error.message.includes('timeout')
        ? 'Roblox server verification timed out. Please try again.'
        : `Verification error: ${error.message}`
    };
  }
}
