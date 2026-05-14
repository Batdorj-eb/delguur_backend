import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

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

  // PostgreSQL unique violation
  if ((err as NodeJS.ErrnoException).code === '23505') {
    res.status(409).json(<ApiResponse>{
      success: false,
      error: 'Давхардсан өгөгдөл байна.',
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
