import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { LoginDto, ApiResponse, User } from '../types';
import { AppError } from '../middleware/errorHandler';

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password }: LoginDto = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Имэйл болон нууц үг шаардлагатай.');
    }

    const result = await pool.query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user) {
      throw new AppError(401, 'Имэйл эсвэл нууц үг буруу.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError(401, 'Имэйл эсвэл нууц үг буруу.');
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    res.json(<ApiResponse>{
      success: true,
      message: 'Амжилттай нэвтэрлээ.',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<User>(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user?.userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new AppError(404, 'Хэрэглэгч олдсонгүй.');
    }

    res.json(<ApiResponse>{ success: true, data: user });
  } catch (err) {
    next(err);
  }
};
