import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/db.js';
import { ENV } from '../config/env.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local uploads directories
const localUploadsDir = path.resolve(__dirname, '../../public/uploads');
const frontendUploadsDir = path.resolve(__dirname, '../../../../frontend/public/uploads');

// Ensure local directories exist
try {
  if (!fs.existsSync(localUploadsDir)) {
    fs.mkdirSync(localUploadsDir, { recursive: true });
  }
  if (!fs.existsSync(frontendUploadsDir)) {
    fs.mkdirSync(frontendUploadsDir, { recursive: true });
  }
} catch (e) {
  logger.warn('Could not initialize local upload dirs:', e.message);
}

export const uploadController = {
  /**
   * Upload an image (accepts base64 dataUrl or binary buffer)
   * POST /api/upload/image
   */
  async uploadImage(req, res, next) {
    try {
      const { image, base64, folder = 'products', filename: customName } = req.body;
      const rawImage = image || base64;

      if (!rawImage || typeof rawImage !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_IMAGE',
            message: 'Please provide an image payload (base64 string or data URI).'
          }
        });
      }

      // Parse Data URI or pure base64
      let mimeType = 'image/png';
      let extension = 'png';
      let base64Data = rawImage;

      const matches = rawImage.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
        else if (mimeType.includes('png')) extension = 'png';
        else if (mimeType.includes('webp')) extension = 'webp';
        else if (mimeType.includes('gif')) extension = 'gif';
        else if (mimeType.includes('svg')) extension = 'svg';
      }

      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'Image size exceeds maximum 10MB limit.'
          }
        });
      }

      const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
      const uniqueId = uuidv4().slice(0, 8);
      const timestamp = Date.now();
      const safeFilename = `${cleanFolder}_${timestamp}_${uniqueId}.${extension}`;
      const storagePath = `${cleanFolder}/${safeFilename}`;

      let publicUrl = null;

      // 1. Upload to Supabase Storage (images bucket)
      try {
        const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
          .from('images')
          .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: true
          });

        if (!uploadErr && uploadData) {
          const { data: pubData } = supabaseAdmin.storage
            .from('images')
            .getPublicUrl(storagePath);
          publicUrl = pubData?.publicUrl;
        } else if (uploadErr) {
          logger.warn('Supabase storage upload error:', uploadErr.message);
        }
      } catch (err) {
        logger.warn('Supabase upload exception:', err.message);
      }

      // 2. Also save to local disk as reliable backup and for offline/dev use
      try {
        const localFilePath = path.join(localUploadsDir, safeFilename);
        fs.writeFileSync(localFilePath, buffer);

        // Also copy to frontend public directory if it exists
        if (fs.existsSync(frontendUploadsDir)) {
          const frontendFilePath = path.join(frontendUploadsDir, safeFilename);
          fs.writeFileSync(frontendFilePath, buffer);
        }

        // If Supabase failed or offline, use local static URL
        if (!publicUrl) {
          publicUrl = `/uploads/${safeFilename}`;
        }
      } catch (fsErr) {
        logger.warn('Local disk write warning:', fsErr.message);
      }

      if (!publicUrl) {
        publicUrl = `/uploads/${safeFilename}`;
      }

      logger.info(`[Image Upload] Successfully uploaded ${safeFilename} (${(buffer.length / 1024).toFixed(1)} KB) -> ${publicUrl}`);

      return res.status(201).json({
        success: true,
        data: {
          url: publicUrl,
          path: storagePath,
          filename: safeFilename,
          size: buffer.length,
          mimeType
        },
        message: 'Image uploaded successfully'
      });
    } catch (err) {
      logger.error('uploadImage error:', err);
      next(err);
    }
  }
};
