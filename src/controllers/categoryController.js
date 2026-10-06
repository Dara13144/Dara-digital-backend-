import { categoryRepo } from '../repositories/categoryRepo.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const categoryController = {
  async getCategories(req, res) {
    try {
      const categories = await categoryRepo.getAllCategories(true);
      return successResponse(res, categories, 'Categories retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async getCategoryBySlug(req, res) {
    try {
      const { slug } = req.params;
      const category = await categoryRepo.findBySlug(slug);
      if (!category) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'Category not found', 404);
      }
      return successResponse(res, category, 'Category retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  }
};
