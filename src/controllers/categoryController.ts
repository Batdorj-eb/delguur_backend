import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { ApiResponse, Category, CategoryWithParent } from '../types';
import { AppError } from '../middleware/errorHandler';

/** Бараанд сонгосон ангилал categories хүснэгтэд байгаа эсэх */
export const assertCategoryExists = async (categoryName: string): Promise<void> => {
  const row = await pool.query('SELECT 1 FROM categories WHERE name = $1', [categoryName]);
  if (!row.rows[0]) {
    throw new AppError(400, 'Ангилал олдсонгүй. Эхлээд админ дээр ангилал үүсгэнэ үү.');
  }
};

// ── GET /categories (public — бүх түвшин, шууд барааны тоо) ───────────
export const listCategoriesWithCounts = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<{
      id: string;
      name: string;
      parent_id: string | null;
      parent_name: string | null;
      count: string;
      cover_image_url: string | null;
    }>(
      `SELECT c.id, c.name, c.parent_id, p.name AS parent_name,
              COUNT(pr.id) FILTER (WHERE pr.is_active = TRUE)::bigint AS count,
              (
                SELECT p2.image_url
                FROM products p2
                WHERE p2.category = c.name AND p2.is_active = TRUE
                ORDER BY p2.created_at DESC NULLS LAST, p2.id DESC
                LIMIT 1
              ) AS cover_image_url
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       LEFT JOIN products pr ON pr.category = c.name
       GROUP BY c.id, c.name, c.parent_id, p.name
       ORDER BY p.name NULLS FIRST, c.name`
    );

    res.json(
      <ApiResponse<
        {
          id: string;
          name: string;
          parent_id: string | null;
          parent_name: string | null;
          count: number;
          cover_image_url: string | null;
        }[]
      >>{
        success: true,
        data: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          parent_id: r.parent_id,
          parent_name: r.parent_name,
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
    const result = await pool.query<CategoryWithParent>(
      `SELECT c.id, c.name, c.parent_id, c.created_at, p.name AS parent_name
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       ORDER BY c.name`
    );
    res.json(<ApiResponse<CategoryWithParent[]>>{ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

const resolveParent = async (parentId: string | undefined): Promise<string | null> => {
  if (!parentId?.trim()) {
    return null;
  }
  const parent = await pool.query<{ id: string }>(
    'SELECT id FROM categories WHERE id = $1',
    [parentId.trim()]
  );
  if (!parent.rows[0]) {
    throw new AppError(400, 'Дээд ангилал олдсонгүй.');
  }
  return parent.rows[0].id;
};

// ── POST /admin/categories ──────────────────────────────────────────────
export const createCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const name = (req.body?.name as string | undefined)?.trim();
    const parentIdRaw = req.body?.parent_id as string | undefined;

    if (!name) {
      throw new AppError(400, 'Ангиллын нэр шаардлагатай.');
    }
    if (name.length > 100) {
      throw new AppError(400, 'Нэр хэт урт байна (хамгийн ихдээ 100 тэмдэгт).');
    }

    const parentId = await resolveParent(parentIdRaw);

    const result = await pool.query<Category>(
      `INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING id, name, parent_id, created_at`,
      [name, parentId]
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

    const children = await pool.query(
      'SELECT COUNT(*)::bigint AS n FROM categories WHERE parent_id = $1',
      [req.params.id]
    );
    const childCount = Number(children.rows[0].n);
    if (childCount > 0) {
      throw new AppError(
        400,
        `Доош ${childCount} ангилал байна. Эхлээд доошх ангиллуудыг устгана уу.`
      );
    }

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
