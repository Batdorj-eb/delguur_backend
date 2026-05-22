import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { ApiResponse, Color } from '../types';
import { AppError } from '../middleware/errorHandler';
import { normalizeHex } from '../services/productRelations';

export const listColors = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<Color>(
      `SELECT id, name, hex_code, created_at FROM colors ORDER BY name`
    );
    res.json(<ApiResponse<Color[]>>{ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

export const createColor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const name = (req.body?.name as string | undefined)?.trim();
    const hexRaw = req.body?.hex_code as string | undefined;
    if (!name) {
      throw new AppError(400, 'Өнгийн нэр шаардлагатай.');
    }
    const hex_code = normalizeHex(hexRaw || '#000000');

    const result = await pool.query<Color>(
      `INSERT INTO colors (name, hex_code) VALUES ($1, $2) RETURNING id, name, hex_code, created_at`,
      [name, hex_code]
    );

    res.status(201).json(<ApiResponse<Color>>{
      success: true,
      message: 'Өнгө нэмэгдлээ.',
      data: result.rows[0],
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      next(new AppError(409, 'Ийм нэртэй өнгө аль хэдийн байна.'));
      return;
    }
    next(err);
  }
};

export const deleteColor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const usage = await pool.query(
      'SELECT COUNT(*)::bigint AS n FROM product_colors WHERE color_id = $1',
      [req.params.id]
    );
    const n = Number(usage.rows[0].n);
    if (n > 0) {
      throw new AppError(
        400,
        `Энэ өнгийг ${n} бараа ашиглаж байна. Эхлээд бараанаас хасна уу.`
      );
    }

    const result = await pool.query('DELETE FROM colors WHERE id = $1 RETURNING id', [
      req.params.id,
    ]);
    if (!result.rows[0]) {
      throw new AppError(404, 'Өнгө олдсонгүй.');
    }

    res.json(<ApiResponse>{ success: true, message: 'Өнгө устгагдлаа.' });
  } catch (err) {
    next(err);
  }
};
