import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { Product, CreateProductDto, UpdateProductDto, ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';
import { assertCategoryExists, getCategoryNamesInBranch } from './categoryController';
import { normalizeSalePrice } from '../utils/productPrice';
import {
  enrichProductRow,
  loadProductColors,
  loadProductImages,
  loadProductColorImages,
  saveProductRelations,
  type ProductImageInput,
  type ProductColorImageInput,
  type ProductColorStockInput,
  type ProductColorSizeStockInput,
} from '../services/productRelations';

const parseImages = (body: CreateProductDto): ProductImageInput[] => {
  if (Array.isArray(body.images) && body.images.length > 0) {
    return body.images
      .filter((i) => i?.image_url?.trim())
      .map((i) => ({
        image_url: i.image_url.trim(),
        is_primary: i.is_primary === true,
      }));
  }
  if (body.image_url?.trim()) {
    return [{ image_url: body.image_url.trim(), is_primary: true }];
  }
  return [];
};

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
    const isAdmin = !!req.user;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (!isAdmin) {
      conditions.push(`p.is_active = TRUE`);
    }
    if (category) {
      const branchNames = await getCategoryNamesInBranch(category);
      conditions.push(`p.category = ANY($${paramIndex++})`);
      params.push(branchNames);
    }
    if (search) {
      conditions.push(`(p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    const featuredOnly =
      req.query.featured === '1' || req.query.featured === 'true' || req.query.featured === 'yes';
    if (featuredOnly) {
      conditions.push(`p.is_featured = TRUE`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query<Product>(
      `SELECT p.* FROM products p ${where}
       ORDER BY p.created_at DESC
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
    const isAdmin = !!req.user;
    const result = await pool.query<Product>(
      isAdmin
        ? 'SELECT * FROM products WHERE id = $1'
        : 'SELECT * FROM products WHERE id = $1 AND is_active = TRUE',
      [req.params.id]
    );

    if (!result.rows[0]) {
      throw new AppError(404, 'Бараа олдсонгүй.');
    }

    const enriched = await enrichProductRow(result.rows[0]);
    res.json(<ApiResponse<typeof enriched>>{ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/products/:id ───────────────────────────────────────────
export const getAdminProductById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<Product>('SELECT * FROM products WHERE id = $1', [
      req.params.id,
    ]);
    if (!result.rows[0]) {
      throw new AppError(404, 'Бараа олдсонгүй.');
    }
    const enriched = await enrichProductRow(result.rows[0]);
    res.json(<ApiResponse<typeof enriched>>{ success: true, data: enriched });
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

    const categoryName = dto.category?.trim() || null;
    if (categoryName) {
      await assertCategoryExists(categoryName);
    }

    const images = parseImages(dto);
    if (images.length === 0) {
      throw new AppError(400, 'Дор хаяж нэг зураг шаардлагатай.');
    }

    const primaryUrl =
      images.find((i) => i.is_primary)?.image_url || images[0].image_url;

    const salePrice = normalizeSalePrice(
      dto.price,
      dto.sale_price ?? null,
      dto.sale_price != null
    );

    const colorIds = dto.color_ids || [];
    const colorStocks = (dto.color_stocks || []) as ProductColorStockInput[];
    const colorSizeStocks = (dto.color_size_stocks || []) as ProductColorSizeStockInput[];
    const totalFromSizes = colorSizeStocks.reduce(
      (s, c) => s + Math.max(0, Math.floor(Number(c.stock) || 0)),
      0
    );
    const totalFromColors = colorStocks.reduce(
      (s, c) => s + Math.max(0, Math.floor(Number(c.stock) || 0)),
      0
    );
    const totalStock =
      colorIds.length > 0
        ? (colorSizeStocks.length > 0 ? totalFromSizes : totalFromColors)
        : Math.max(0, Math.floor(Number(dto.stock) || 0));

    const result = await pool.query<Product>(
      `INSERT INTO products (name, description, price, sale_price, image_url, category, stock, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        dto.name.trim(),
        dto.description?.trim() || null,
        dto.price,
        salePrice,
        primaryUrl,
        categoryName,
        totalStock,
        dto.is_featured === true,
      ]
    );

    const product = result.rows[0];
    await saveProductRelations(
      product.id,
      images,
      colorIds,
      (dto.color_images || []) as ProductColorImageInput[],
      colorStocks,
      colorSizeStocks
    );

    const enriched = await enrichProductRow(
      (await pool.query<Product>('SELECT * FROM products WHERE id = $1', [product.id])).rows[0]
    );

    res.status(201).json(<ApiResponse<typeof enriched>>{
      success: true,
      message: 'Бараа амжилттай нэмэгдлээ.',
      data: enriched,
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
    const id = String(req.params.id);

    const existing = await pool.query<Product>('SELECT * FROM products WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      throw new AppError(404, 'Бараа олдсонгүй.');
    }

    const p = existing.rows[0];
    const nextCategory =
      dto.category !== undefined ? dto.category?.trim() || null : p.category;
    if (nextCategory) {
      await assertCategoryExists(nextCategory);
    }

    const nextPrice = dto.price ?? p.price;
    const nextSalePrice =
      dto.sale_price !== undefined
        ? normalizeSalePrice(nextPrice, dto.sale_price, dto.sale_price != null)
        : p.sale_price;

    const result = await pool.query<Product>(
      `UPDATE products
       SET name=$1, description=$2, price=$3, sale_price=$4,
           category=$5, stock=$6, is_active=$7, is_featured=$8
       WHERE id=$9
       RETURNING *`,
      [
        dto.name?.trim() ?? p.name,
        dto.description?.trim() ?? p.description,
        nextPrice,
        nextSalePrice,
        nextCategory,
        dto.stock ?? p.stock,
        dto.is_active ?? p.is_active,
        dto.is_featured !== undefined ? dto.is_featured === true : p.is_featured,
        id,
      ]
    );

    if (
      dto.images !== undefined ||
      dto.color_ids !== undefined ||
      dto.color_images !== undefined ||
      dto.color_size_stocks !== undefined ||
      dto.color_stocks !== undefined
    ) {
      let images: ProductImageInput[];
      if (dto.images !== undefined) {
        images = parseImages({ ...dto, name: p.name, price: p.price } as CreateProductDto);
      } else {
        const existingImgs = await loadProductImages(id);
        images = existingImgs.map((i) => ({
          image_url: i.image_url,
          is_primary: i.is_primary,
        }));
      }

      let colorIds = dto.color_ids;
      if (colorIds === undefined) {
        const existingColors = await loadProductColors(id);
        colorIds = existingColors.map((c) => c.id);
      }

      let colorImages = dto.color_images as ProductColorImageInput[] | undefined;
      if (colorImages === undefined) {
        colorImages = await loadProductColorImages(id);
      }

      let colorStocks = dto.color_stocks as ProductColorStockInput[] | undefined;
      if (colorStocks === undefined && colorIds.length > 0) {
        const existingColors = await loadProductColors(id);
        colorStocks = existingColors.map((c) => ({
          color_id: c.id,
          stock: Number(c.stock ?? 0),
        }));
      }

      let colorSizeStocks = dto.color_size_stocks as ProductColorSizeStockInput[] | undefined;
      if (colorSizeStocks === undefined && colorIds.length > 0) {
        const existingColors = await loadProductColors(id);
        colorSizeStocks = existingColors.flatMap((c) =>
          (c.size_stocks || []).map((s) => ({
            color_id: c.id,
            size: s.size,
            stock: Number(s.stock ?? 0),
          }))
        );
      }

      await saveProductRelations(
        id,
        images,
        colorIds,
        colorImages,
        colorStocks,
        colorSizeStocks
      );
    } else if (dto.image_url !== undefined && dto.image_url?.trim()) {
      await saveProductRelations(
        id,
        [{ image_url: dto.image_url.trim(), is_primary: true }],
        [],
        []
      );
    }

    const fresh = await pool.query<Product>('SELECT * FROM products WHERE id = $1', [id]);
    const enriched = await enrichProductRow(fresh.rows[0]);

    res.json(<ApiResponse<typeof enriched>>{
      success: true,
      message: 'Бараа амжилттай шинэчлэгдлээ.',
      data: enriched,
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
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [
      req.params.id,
    ]);

    if (!result.rows[0]) {
      throw new AppError(404, 'Бараа олдсонгүй.');
    }

    res.json(<ApiResponse>{ success: true, message: 'Бараа амжилттай устгагдлаа.' });
  } catch (err) {
    next(err);
  }
};
