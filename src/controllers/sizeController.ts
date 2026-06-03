import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { ApiResponse, Size } from '../types';
import { AppError } from '../middleware/errorHandler';

export const listSizes = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<Size>(
      `SELECT id, name, sort_order, created_at FROM sizes ORDER BY sort_order ASC, name ASC`
    );
    res.json(<ApiResponse<Size[]>>{ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

export const createSize = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const name = (req.body?.name as string | undefined)?.trim();
    if (!name) {
      throw new AppError(400, 'Хэмжээний нэр шаардлагатай.');
    }
    if (name.length > 30) {
      throw new AppError(400, 'Хэмжээний нэр 30 тэмдэгтээс ихгүй байх ёстой.');
    }

    const sortOrder = Math.floor(Number(req.body?.sort_order) || 0);

    const result = await pool.query<Size>(
      `INSERT INTO sizes (name, sort_order) VALUES ($1, $2)
       RETURNING id, name, sort_order, created_at`,
      [name, sortOrder]
    );

    res.status(201).json(<ApiResponse<Size>>{
      success: true,
      message: 'Хэмжээ нэмэгдлээ.',
      data: result.rows[0],
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      next(new AppError(409, 'Ийм нэртэй хэмжээ аль хэдийн байна.'));
      return;
    }
    next(err);
  }
};

export const deleteSize = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sizeRow = await pool.query<{ name: string }>(
      'SELECT name FROM sizes WHERE id = $1',
      [req.params.id]
    );
    if (!sizeRow.rows[0]) {
      throw new AppError(404, 'Хэмжээ олдсонгүй.');
    }
    const sizeName = sizeRow.rows[0].name;

    const usage = await pool.query(
      `SELECT COUNT(*)::bigint AS n
       FROM product_colors pc,
            jsonb_array_elements(pc.size_stocks) elem
       WHERE elem->>'size' = $1`,
      [sizeName]
    );
    const n = Number(usage.rows[0].n);
    if (n > 0) {
      throw new AppError(
        400,
        `Энэ хэмжээг ${n} барааны өнгө ашиглаж байна. Эхлээд бараанаас хасна уу.`
      );
    }

    const result = await pool.query('DELETE FROM sizes WHERE id = $1 RETURNING id', [
      req.params.id,
    ]);
    if (!result.rows[0]) {
      throw new AppError(404, 'Хэмжээ олдсонгүй.');
    }

    res.json(<ApiResponse>{ success: true, message: 'Хэмжээ устгагдлаа.' });
  } catch (err) {
    next(err);
  }
};
