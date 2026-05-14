import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, ApiResponse } from '../types';

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(<ApiResponse>{
      success: false,
      error: 'Нэвтрэх эрх байхгүй. Token олдсонгүй.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'secret'
    ) as JwtPayload;

    req.user = decoded;
    next();
  } catch {
    res.status(401).json(<ApiResponse>{
      success: false,
      error: 'Token буруу эсвэл хугацаа дууссан.',
    });
  }
};

export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== 'superadmin') {
    res.status(403).json(<ApiResponse>{
      success: false,
      error: 'Энэ үйлдлийг зөвхөн superadmin хийж чадна.',
    });
    return;
  }
  next();
};
