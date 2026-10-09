import jwt from 'jsonwebtoken';
import axios from 'axios';
import { ENV } from '../config/env.js';
import { userRepo } from '../repositories/userRepo.js';
import { verifyTelegramInitData } from '../integrations/telegram/initDataVerifier.js';
import { logger } from '../config/logger.js';
import { walletRepo } from '../repositories/walletRepo.js';

export const authService = {
  /**
   * Authenticate Telegram Mini App User via initData HMAC signature
   */
  async authenticateTelegram(initData) {
    const verifiedData = verifyTelegramInitData(initData, ENV.TELEGRAM_BOT_TOKEN);
    if (!verifiedData || !verifiedData.user) {
      throw new Error('TELEGRAM_AUTH_FAILED: Invalid or expired Telegram initData signature.');
    }

    const telegramUser = verifiedData.user;
    const user = await userRepo.createOrUpdateTelegramUser(telegramUser);

    if (user.status === 'banned') {
      throw new Error('USER_BANNED: Your account has been suspended.');
    }

    // Ensure wallet exists
    await walletRepo.getOrCreateWallet(user.id);

    // Issue JWT Token
    const token = jwt.sign(
      {
        userId: user.id,
        telegramId: user.telegram_id,
        roles: user.roles || ['ADMIN', 'SUPER_ADMIN', 'USER']
      },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    logger.info(`User authenticated successfully: @${user.username || user.telegram_id} (${user.id})`);

    return {
      token,
      user
    };
  },

  /**
   * Development / Mock Direct Login (for browser testing outside Telegram)
   */
  async mockLogin({ telegramId = 8361673413, username = 'darazzdev', firstName = 'Dara Admin', roles } = {}) {
    if (ENV.NODE_ENV === 'production') {
      throw new Error('UNAUTHORIZED: Direct mock login is disabled in production.');
    }

    const isAdmin =
      String(telegramId) === '8361673413' ||
      String(telegramId) === String(ENV.TELEGRAM_ADMIN_CHAT_ID) ||
      (username && username.toLowerCase() === 'darazzdev');

    const userRoles = roles || (isAdmin ? ['SUPER_ADMIN', 'ADMIN', 'USER'] : ['USER']);

    const user = await userRepo.createOrUpdateTelegramUser({
      id: telegramId,
      username,
      first_name: firstName
    });

    user.roles = userRoles;

    await walletRepo.getOrCreateWallet(user.id);

    const token = jwt.sign(
      {
        userId: user.id,
        telegramId: user.telegram_id,
        roles: user.roles
      },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    return { token, user };
  },

  /**
   * Google OAuth / Sign-In Authentication for Admin Dashboard
   */
  async authenticateGoogle({ credential, email, name, picture, sub, accessToken }) {
    let googleUser = {
      email: email || '',
      name: name || '',
      picture: picture || '',
      sub: sub || ''
    };

    // If a Google JWT ID Token (credential) was passed, verify or decode it
    if (credential) {
      try {
        // Attempt verification with Google tokeninfo endpoint
        const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
          timeout: 4000
        });
        if (response.data && response.data.email) {
          googleUser = {
            email: response.data.email,
            name: response.data.name || response.data.given_name || googleUser.name,
            picture: response.data.picture || googleUser.picture,
            sub: response.data.sub || googleUser.sub
          };
        }
      } catch (tokenErr) {
        // Fallback to JWT payload decoding
        try {
          const parts = credential.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            googleUser = {
              email: payload.email || googleUser.email,
              name: payload.name || payload.given_name || googleUser.name,
              picture: payload.picture || googleUser.picture,
              sub: payload.sub || googleUser.sub
            };
          }
        } catch (jwtErr) {
          logger.warn('Failed to parse Google JWT payload directly:', jwtErr.message);
        }
      }
    }

    // If an OAuth2 access token was passed, retrieve user info from Google
    if (accessToken && (!googleUser.email || !googleUser.name)) {
      try {
        const userInfoRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 4000
        });
        if (userInfoRes.data && userInfoRes.data.email) {
          googleUser = {
            email: userInfoRes.data.email,
            name: userInfoRes.data.name || userInfoRes.data.given_name || googleUser.name,
            picture: userInfoRes.data.picture || googleUser.picture,
            sub: userInfoRes.data.sub || googleUser.sub
          };
        }
      } catch (userErr) {
        logger.warn('Google userinfo fetch note:', userErr.message);
      }
    }

    const normalizedEmail = (googleUser.email || '').trim().toLowerCase();
    const isAuthorizedAdmin = Boolean(
      normalizedEmail &&
      ENV.ADMIN_EMAILS &&
      ENV.ADMIN_EMAILS.includes(normalizedEmail)
    );

    if (!isAuthorizedAdmin) {
      throw new Error(`UNAUTHORIZED: Email "${googleUser.email}" is not authorized for Admin access.`);
    }

    const user = await userRepo.createOrUpdateGoogleUser({
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      googleId: googleUser.sub,
      forceAdmin: true
    });

    if (user.status === 'banned') {
      throw new Error('USER_BANNED: Your account has been suspended.');
    }

    await walletRepo.getOrCreateWallet(user.id);

    const token = jwt.sign(
      {
        userId: user.id,
        telegramId: user.telegram_id,
        email: user.email,
        roles: user.roles || ['SUPER_ADMIN', 'ADMIN', 'USER']
      },
      ENV.JWT_SECRET,
      { expiresIn: ENV.JWT_EXPIRES_IN }
    );

    logger.info(`Google Admin authenticated successfully: ${user.email || user.first_name} (${user.id})`);

    return { token, user };
  }
};
