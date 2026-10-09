import { authService } from '../services/authService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { ENV } from '../config/env.js';
import { logger } from '../config/logger.js';

export const authController = {
  /**
   * Telegram WebApp Authentication
   */
  async telegramAuth(req, res) {
    try {
      const { initData } = req.body;
      if (!initData) {
        return errorResponse(res, ERROR_CODES.BAD_REQUEST, 'initData is required for Telegram login.', 400);
      }

      const result = await authService.authenticateTelegram(initData);
      return successResponse(res, result, 'Telegram authentication successful');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.TELEGRAM_AUTH_FAILED, err.message, 401);
    }
  },

  /**
   * Direct Mock Login (For browser dev testing)
   */
  async mockLogin(req, res) {
    try {
      const { telegramId, username, firstName } = req.body;
      const result = await authService.mockLogin({ telegramId, username, firstName });
      return successResponse(res, result, 'Logged in with test credentials');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.UNAUTHORIZED, err.message, 401);
    }
  },

  /**
   * Google OAuth / Sign-In for Website Users & Admin Portal (POST /api/auth/google)
   */
  async googleAuth(req, res) {
    try {
      const { credential, email, name, picture, sub, accessToken, isAdminRequired = false } = req.body;
      const result = await authService.authenticateGoogle({
        credential,
        email,
        name,
        picture,
        sub,
        accessToken,
        isAdminRequired: Boolean(isAdminRequired)
      });
      return successResponse(res, result, 'Google authentication successful');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.UNAUTHORIZED, err.message, 401);
    }
  },

  /**
   * Google OAuth Entrypoint (GET /api/auth/google)
   * Redirects user browser directly to Google OAuth consent screen,
   * or returns the authorization URL if requested as JSON.
   */
  async googleOAuthRedirect(req, res) {
    try {
      const returnTo = req.query.returnTo || '/';
      const mode = req.query.mode || 'user'; // 'user' or 'admin'
      const stateObj = {
        returnTo,
        mode,
        ts: Date.now()
      };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64url');
      const url = authService.getGoogleOAuthUrl(state, req);

      // If client explicitly requests JSON (e.g. mobile app or axios probe)
      if (req.query.json === 'true' || req.xhr || req.headers.accept?.includes('application/json')) {
        return successResponse(res, { url }, 'Google OAuth authorization URL generated');
      }

      // Default browser navigation: 302 redirect directly to Google Accounts
      return res.redirect(url);
    } catch (err) {
      return errorResponse(res, ERROR_CODES.BAD_REQUEST, err.message, 400);
    }
  },

  /**
   * Google OAuth Callback (GET /api/auth/google/callback)
   * Receives Google authorization code, exchanges it, and redirects to frontend with JWT
   */
  async googleOAuthCallback(req, res) {
    const { code, state, error: oauthError } = req.query;
    let returnTo = '/';
    let isAdminRequired = false;

    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        if (decoded.returnTo) returnTo = decoded.returnTo;
        if (decoded.mode === 'admin') isAdminRequired = true;
      } catch (e) {
        logger.debug('Google OAuth state parse warning:', e.message);
      }
    }

    const frontendBase = (ENV.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

    if (oauthError) {
      logger.warn(`Google OAuth callback error from Google: ${oauthError}`);
      const errUrl = new URL(frontendBase);
      errUrl.searchParams.set('auth_error', oauthError);
      return res.redirect(errUrl.toString());
    }

    if (!code) {
      const errUrl = new URL(frontendBase);
      errUrl.searchParams.set('auth_error', 'Missing authorization code from Google');
      return res.redirect(errUrl.toString());
    }

    try {
      const result = await authService.handleGoogleOAuthCallback(code, req, isAdminRequired);

      // Determine redirect target on frontend
      let targetUrlStr = frontendBase;
      if (returnTo.startsWith('http://') || returnTo.startsWith('https://')) {
        targetUrlStr = returnTo;
      } else {
        const cleanPath = returnTo.startsWith('/') ? returnTo : `/${returnTo}`;
        targetUrlStr = `${frontendBase}${cleanPath}`;
      }

      const redirectUrl = new URL(targetUrlStr);
      redirectUrl.searchParams.set('token', result.token);
      redirectUrl.searchParams.set('auth_success', 'google');

      logger.info(`Google OAuth completed for ${result.user.email}, redirecting to ${redirectUrl.pathname}`);
      return res.redirect(redirectUrl.toString());
    } catch (err) {
      logger.error(`Google OAuth callback exchange failed: ${err.message}`);
      const errUrl = new URL(frontendBase);
      errUrl.searchParams.set('auth_error', err.message);
      return res.redirect(errUrl.toString());
    }
  }
};

