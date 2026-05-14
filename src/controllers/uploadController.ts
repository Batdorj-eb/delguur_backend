import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';

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
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadImage = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.file) {
      throw new AppError(400, 'Зураг файл шаардлагатай.');
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.status(201).json(<ApiResponse<{ url: string }>>{
      success: true,
      message: 'Зураг амжилттай upload хийгдлээ.',
      data: { url: imageUrl },
    });
  } catch (err) {
    next(err);
  }
};
