import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';
import { maxUploadBytes } from '../config/uploadLimits';
import { optimizeUploadedImage } from '../utils/optimizeUploadedImage';

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const imageFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
    return;
  }
  cb(new AppError(400, 'Зөвхөн зураг файл upload хийж болно.'));
};

export const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: maxUploadBytes(),
    fieldSize: 2 * 1024 * 1024,
  },
});

function removeFileIfExists(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export const uploadImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const uploadedPath = req.file?.path;

  try {
    if (!req.file || !uploadedPath) {
      throw new AppError(400, 'Зураг файл шаардлагатай.');
    }

    const optimized = await optimizeUploadedImage(uploadedPath, req.file.mimetype);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/${optimized.filename}`;

    res.status(201).json(<ApiResponse<{ url: string; sizeBytes: number; optimized: boolean }>>{
      success: true,
      message: optimized.optimized
        ? 'Зураг амжилттай upload хийгдэж, шахагдлаа.'
        : 'Зураг амжилттай upload хийгдлээ.',
      data: {
        url: imageUrl,
        sizeBytes: optimized.bytes,
        optimized: optimized.optimized,
      },
    });
  } catch (err) {
    if (uploadedPath) removeFileIfExists(uploadedPath);
    next(err);
  }
};
