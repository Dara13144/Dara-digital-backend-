import { productRepo } from '../repositories/productRepo.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export const productController = {
  async getProducts(req, res) {
    try {
      const {
        categoryId,
        categorySlug,
        search,
        stockType,
        featured,
        minPrice,
        maxPrice,
        sortBy,
        page = 1,
        limit = 20
      } = req.query;

      const result = await productRepo.getProducts({
        categoryId,
        categorySlug,
        search,
        stockType,
        featured: featured !== undefined ? featured === 'true' : undefined,
        minPrice,
        maxPrice,
        sortBy,
        publishedOnly: true,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });

      return successResponse(res, result, 'Products retrieved successfully');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async getProductBySlug(req, res) {
    try {
      const { slug } = req.params;
      const product = await productRepo.findBySlug(slug);
      if (!product) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found', 404);
      }
      return successResponse(res, product, 'Product details retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  },

  async getProductById(req, res) {
    try {
      const { id } = req.params;
      const product = await productRepo.findById(id);
      if (!product) {
        return errorResponse(res, ERROR_CODES.RESOURCE_NOT_FOUND, 'Product not found', 404);
      }
      return successResponse(res, product, 'Product details retrieved');
    } catch (err) {
      return errorResponse(res, ERROR_CODES.INTERNAL_SERVER_ERROR, err.message, 500);
    }
  }
};
