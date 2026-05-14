import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { ApiResponse, Category } from '../types';
import { AppError } from '../middleware/errorHandler';

// ── GET /categories (public — sidebar) ───────────────────────────────
export const listCategoriesWithCounts = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<{
      id: string;
      name: string;
      count: string;
      cover_image_url: string | null;
    }>(
      `SELECT c.id, c.name,
              COUNT(p.id) FILTER (WHERE p.is_active = TRUE)::bigint AS count,
              (
                SELECT p2.image_url
                FROM products p2
                WHERE p2.category = c.name AND p2.is_active = TRUE
                ORDER BY p2.created_at DESC NULLS LAST, p2.id DESC
                LIMIT 1
              ) AS cover_image_url
       FROM categories c
       LEFT JOIN products p ON p.category = c.name
       GROUP BY c.id, c.name
       ORDER BY c.name`
    );

    res.json(
      <ApiResponse<{ id: string; name: string; count: number; cover_image_url: string | null }[]>>{
        success: true,
        data: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          count: Number(r.count),
          cover_image_url: r.cover_image_url,
        })),
      }
    );
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/categories ─────────────────────────────────────────────
export const listAllCategories = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<Category>(
      `SELECT id, name, created_at FROM categories ORDER BY name`
    );
    res.json(<ApiResponse<Category[]>>{ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/categories ──────────────────────────────────────────────
export const createCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const name = (req.body?.name as string | undefined)?.trim();
    if (!name) {
      throw new AppError(400, 'Ангиллын нэр шаардлагатай.');
    }
    if (name.length > 100) {
      throw new AppError(400, 'Нэр хэт урт байна (хамгийн ихдээ 100 тэмдэгт).');
    }

    const result = await pool.query<Category>(
      `INSERT INTO categories (name) VALUES ($1) RETURNING id, name, created_at`,
      [name]
    );

    res.status(201).json(<ApiResponse<Category>>{
      success: true,
      message: 'Ангилал нэмэгдлээ.',
      data: result.rows[0],
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      next(new AppError(409, 'Ийм нэртэй ангилал аль хэдийн байна.'));
      return;
    }
    next(err);
  }
};

// ── DELETE /admin/categories/:id ──────────────────────────────────────
export const deleteCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const existing = await pool.query<{ name: string }>(
      'SELECT name FROM categories WHERE id = $1',
      [req.params.id]
    );
    if (!existing.rows[0]) {
      throw new AppError(404, 'Ангилал олдсонгүй.');
    }

    const catName = existing.rows[0].name;
    const usage = await pool.query(
      'SELECT COUNT(*)::bigint AS n FROM products WHERE category = $1',
      [catName]
    );
    const n = Number(usage.rows[0].n);
    if (n > 0) {
      throw new AppError(
        400,
        `Энэ ангилалд ${n} бараа холбоотой тул устгах боломжгүй. Эхлээд барааны ангиллыг өөрчилнө үү.`
      );
    }

    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json(<ApiResponse>{ success: true, message: 'Ангилал устгагдлаа.' });
  } catch (err) {
    next(err);
  }
};
