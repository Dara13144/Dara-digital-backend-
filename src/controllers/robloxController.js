import { checkRobloxUser } from '../services/robloxService.js';

export const robloxController = {
  async checkUser(req, res, next) {
    try {
      const query = req.query.username || req.query.query || req.params.username;
      if (!query) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Roblox username or Player ID is required'
          }
        });
      }

      const result = await checkRobloxUser(query);
      if (!result.found) {
        return res.status(200).json({
          success: false,
          found: false,
          message: result.message || 'Roblox user not found'
        });
      }

      return res.status(200).json({
        success: true,
        found: true,
        data: result.user
      });
    } catch (error) {
      next(error);
    }
  }
};
