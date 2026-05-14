import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { Product, CreateProductDto, UpdateProductDto, ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';

// ── GET /products ─────────────────────────────────────────────────────
export const getProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 12));
    const offset = (page - 1) * limit;
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    // Admin-д inactive барааг харуулна, public-д зөвхөн active
    const isAdmin = !!req.user;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (!isAdmin) {
      conditions.push(`is_active = TRUE`);
    }
    if (category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (search) {
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    const featuredOnly =
      req.query.featured === '1' || req.query.featured === 'true' || req.query.featured === 'yes';
    if (featuredOnly) {
      conditions.push(`is_featured = TRUE`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query<Product>(
      `SELECT * FROM products ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.json(<ApiResponse<Product[]>>{
      success: true,
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /products/:id ─────────────────────────────────────────────────
export const getProductById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<Product>(
      'SELECT * FROM products WHERE id = $1 AND is_active = TRUE',
      [req.params.id]
    );

    if (!result.rows[0]) {
      throw new AppError(404, 'Бараа олдсонгүй.');
    }

    res.json(<ApiResponse<Product>>{ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// ── GET /products/categories ──────────────────────────────────────────
export const getCategories = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM products
       WHERE is_active = TRUE AND category IS NOT NULL
       GROUP BY category
       ORDER BY category`
    );

    res.json(<ApiResponse>{ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

// ── POST /admin/products ──────────────────────────────────────────────
export const createProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dto: CreateProductDto = req.body;

    if (!dto.name || dto.price == null) {
      throw new AppError(400, 'Нэр болон үнэ заавал оруулна.');
    }
    if (dto.price < 0) {
      throw new AppError(400, 'Үнэ сөрөг байж болохгүй.');
    }

    const result = await pool.query<Product>(
      `INSERT INTO products (name, description, price, image_url, category, stock, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        dto.name.trim(),
        dto.description?.trim() || null,
        dto.price,
        dto.image_url?.trim() || null,
        dto.category?.trim() || null,
        dto.stock ?? 0,
        dto.is_featured === true,
      ]
    );

    res.status(201).json(<ApiResponse<Product>>{
      success: true,
      message: 'Бараа амжилттай нэмэгдлээ.',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /admin/products/:id ─────────────────────────────────────────
export const updateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dto: UpdateProductDto = req.body;
    const { id } = req.params;

    const existing = await pool.query<Product>(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );
    if (!existing.rows[0]) {
      throw new AppError(404, 'Бараа олдсонгүй.');
    }

    const p = existing.rows[0];
    const result = await pool.query<Product>(
      `UPDATE products
       SET name=$1, description=$2, price=$3, image_url=$4,
           category=$5, stock=$6, is_active=$7, is_featured=$8
       WHERE id=$9
       RETURNING *`,
      [
        dto.name?.trim() ?? p.name,
        dto.description?.trim() ?? p.description,
        dto.price ?? p.price,
        dto.image_url?.trim() ?? p.image_url,
        dto.category?.trim() ?? p.category,
        dto.stock ?? p.stock,
        dto.is_active ?? p.is_active,
        dto.is_featured !== undefined ? dto.is_featured === true : p.is_featured,
        id,
      ]
    );

    res.json(<ApiResponse<Product>>{
      success: true,
      message: 'Бараа амжилттай шинэчлэгдлээ.',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /admin/products/:id ────────────────────────────────────────
export const deleteProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (!result.rows[0]) {
      throw new AppError(404, 'Бараа олдсонгүй.');
    }

    res.json(<ApiResponse>{ success: true, message: 'Бараа амжилттай устгагдлаа.' });
  } catch (err) {
    next(err);
  }
};
