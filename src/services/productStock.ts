import type { PoolClient } from 'pg';
import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';

type Queryable = Pick<PoolClient, 'query'>;

export const productHasColors = async (
  productId: string,
  db: Queryable = pool
): Promise<boolean> => {
  const r = await db.query(
    'SELECT 1 FROM product_colors WHERE product_id = $1 LIMIT 1',
    [productId]
  );
  return !!r.rows[0];
};

/** Өнгөтэй бараанд color_id заавал; өнгөгүй бол products.stock */
export const getVariantStock = async (
  productId: string,
  colorId: string | null,
  db: Queryable = pool
): Promise<number> => {
  const hasColors = await productHasColors(productId, db);
  if (!hasColors) {
    const r = await db.query<{ stock: number }>(
      'SELECT stock FROM products WHERE id = $1',
      [productId]
    );
    return Number(r.rows[0]?.stock ?? 0);
  }
  if (!colorId) {
    return 0;
  }
  const r = await db.query<{ stock: number }>(
    `SELECT pc.stock
     FROM product_colors pc
     WHERE pc.product_id = $1 AND pc.color_id = $2`,
    [productId, colorId]
  );
  return Number(r.rows[0]?.stock ?? 0);
};

export const assertVariantStockAvailable = async (
  productId: string,
  colorId: string | null,
  requestedQty: number,
  db: Queryable = pool
): Promise<void> => {
  const hasColors = await productHasColors(productId, db);
  if (hasColors && !colorId) {
    throw new AppError(400, 'Өнгө сонгоно уу.');
  }
  const available = await getVariantStock(productId, colorId, db);
  if (requestedQty > available) {
    throw new AppError(400, `Нөөц хүрэлцэхгүй. Боломжит: ${available}`);
  }
};

export const syncProductStockFromColors = async (
  productId: string,
  db: Queryable = pool
): Promise<number> => {
  const sum = await db.query<{ total: number }>(
    `SELECT COALESCE(SUM(stock), 0)::int AS total FROM product_colors WHERE product_id = $1`,
    [productId]
  );
  const total = Number(sum.rows[0]?.total ?? 0);
  await db.query('UPDATE products SET stock = $1 WHERE id = $2', [total, productId]);
  return total;
};

export const deductVariantStock = async (
  productId: string,
  colorId: string | null,
  quantity: number,
  db: Queryable = pool
): Promise<void> => {
  const hasColors = await productHasColors(productId, db);
  if (hasColors && colorId) {
    await db.query(
      `UPDATE product_colors SET stock = stock - $1
       WHERE product_id = $2 AND color_id = $3 AND stock >= $1`,
      [quantity, productId, colorId]
    );
    await syncProductStockFromColors(productId, db);
    return;
  }
  await db.query(
    'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
    [quantity, productId]
  );
};

export const restoreVariantStock = async (
  productId: string,
  colorId: string | null,
  quantity: number,
  db: Queryable = pool
): Promise<void> => {
  const hasColors = await productHasColors(productId, db);
  if (hasColors && colorId) {
    await db.query(
      `UPDATE product_colors SET stock = stock + $1
       WHERE product_id = $2 AND color_id = $3`,
      [quantity, productId, colorId]
    );
    await syncProductStockFromColors(productId, db);
    return;
  }
  await db.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [
    quantity,
    productId,
  ]);
};
