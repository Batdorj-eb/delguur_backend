import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ApiResponse } from '../types';
import { uploadLimitMessage } from '../config/uploadLimits';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('❌ Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json(<ApiResponse>{
      success: false,
      error: err.message,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json(<ApiResponse>{
        success: false,
        error: uploadLimitMessage(),
      });
      return;
    }
    res.status(400).json(<ApiResponse>{
      success: false,
      error: 'Файл upload хийхэд алдаа гарлаа.',
    });
    return;
  }

  // PostgreSQL unique violation
  if ((err as NodeJS.ErrnoException).code === '23505') {
    res.status(409).json(<ApiResponse>{
      success: false,
      error: 'Давхардсан өгөгдөл байна.',
    });
    return;
  }

  // PostgreSQL foreign key violation (e.g. deleting ordered products)
  if ((err as NodeJS.ErrnoException).code === '23503') {
    res.status(409).json(<ApiResponse>{
      success: false,
      error: 'Энэ бараа захиалгад орсон тул устгах боломжгүй.',
    });
    return;
  }

  res.status(500).json(<ApiResponse>{
    success: false,
    error: 'Серверийн алдаа гарлаа. Дахин оролдоно уу.',
  });
};

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json(<ApiResponse>{
    success: false,
    error: 'Хуудас олдсонгүй.',
  });
};
