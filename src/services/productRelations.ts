import pool from '../config/database';
import { AppError } from '../middleware/errorHandler';

export type ProductImageRow = {
  id: string;
  product_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
};

export type ProductColorRow = {
  id: string;
  name: string;
  hex_code: string;
  stock: number;
};

export type ProductColorImageRow = {
  color_id: string;
  image_url: string;
};

export type ProductImageInput = {
  image_url: string;
  is_primary?: boolean;
};

export type ProductColorImageInput = {
  color_id: string;
  image_url: string;
};

export type ProductColorStockInput = {
  color_id: string;
  stock: number;
};

const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

export const normalizeHex = (hex: string): string => {
  const t = hex.trim();
  if (!HEX_RE.test(t)) {
    throw new AppError(400, 'Өнгийн код #RRGGBB формат байх ёстой.');
  }
  return t.toUpperCase();
};

export const loadProductImages = async (productId: string): Promise<ProductImageRow[]> => {
  const result = await pool.query<ProductImageRow>(
    `SELECT id, product_id, image_url, is_primary, sort_order
     FROM product_images
     WHERE product_id = $1
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
    [productId]
  );
  return result.rows;
};

export const loadProductColors = async (productId: string): Promise<ProductColorRow[]> => {
  const result = await pool.query<ProductColorRow>(
    `SELECT c.id, c.name, c.hex_code, pc.stock
     FROM product_colors pc
     INNER JOIN colors c ON c.id = pc.color_id
     WHERE pc.product_id = $1
     ORDER BY c.name`,
    [productId]
  );
  return result.rows;
};

export const loadProductColorImages = async (
  productId: string
): Promise<ProductColorImageRow[]> => {
  const result = await pool.query<ProductColorImageRow>(
    `SELECT pci.color_id, pi.image_url
     FROM product_color_images pci
     INNER JOIN product_images pi ON pi.id = pci.product_image_id
     WHERE pci.product_id = $1`,
    [productId]
  );
  return result.rows;
};

export const syncPrimaryImageUrl = async (productId: string): Promise<string | null> => {
  const primary = await pool.query<{ image_url: string }>(
    `SELECT image_url FROM product_images
     WHERE product_id = $1
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC
     LIMIT 1`,
    [productId]
  );
  const url = primary.rows[0]?.image_url ?? null;
  await pool.query(`UPDATE products SET image_url = $1 WHERE id = $2`, [url, productId]);
  return url;
};

export const saveProductRelations = async (
  productId: string,
  images: ProductImageInput[],
  colorIds: string[],
  colorImages: ProductColorImageInput[],
  colorStocks?: ProductColorStockInput[]
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const imgs = images.filter((i) => i.image_url?.trim());
    if (imgs.length === 0) {
      throw new AppError(400, 'Дор хаяж нэг зураг шаардлагатай.');
    }

    let primarySet = imgs.some((i) => i.is_primary);
    if (!primarySet) {
      imgs[0].is_primary = true;
      primarySet = true;
    } else {
      let foundFirst = false;
      for (const img of imgs) {
        if (img.is_primary) {
          if (foundFirst) img.is_primary = false;
          else foundFirst = true;
        }
      }
      if (!foundFirst) imgs[0].is_primary = true;
    }

    await client.query('DELETE FROM product_color_images WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM product_colors WHERE product_id = $1', [productId]);
    await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);

    const imageIdByUrl = new Map<string, string>();
    for (let i = 0; i < imgs.length; i++) {
      const row = imgs[i];
      const url = row.image_url.trim();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO product_images (product_id, image_url, is_primary, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [productId, url, row.is_primary === true, i]
      );
      imageIdByUrl.set(url, inserted.rows[0].id);
    }

    const stockByColor = new Map(
      (colorStocks || []).map((s) => [
        s.color_id,
        Math.max(0, Math.floor(Number(s.stock) || 0)),
      ])
    );

    const uniqueColorIds = [...new Set(colorIds.filter(Boolean))];
    for (const colorId of uniqueColorIds) {
      const exists = await client.query('SELECT 1 FROM colors WHERE id = $1', [colorId]);
      if (!exists.rows[0]) {
        throw new AppError(400, 'Сонгосон өнгө олдсонгүй.');
      }
      const stock = stockByColor.get(colorId) ?? 0;
      await client.query(
        `INSERT INTO product_colors (product_id, color_id, stock) VALUES ($1, $2, $3)`,
        [productId, colorId, stock]
      );
    }

    if (uniqueColorIds.length > 0) {
      const sum = await client.query<{ total: number }>(
        `SELECT COALESCE(SUM(stock), 0)::int AS total FROM product_colors WHERE product_id = $1`,
        [productId]
      );
      await client.query(`UPDATE products SET stock = $1 WHERE id = $2`, [
        sum.rows[0]?.total ?? 0,
        productId,
      ]);
    }

    for (const map of colorImages) {
      if (!map.color_id || !map.image_url?.trim()) continue;
      if (!uniqueColorIds.includes(map.color_id)) continue;
      const imageId = imageIdByUrl.get(map.image_url.trim());
      if (!imageId) continue;
      await client.query(
        `INSERT INTO product_color_images (product_id, color_id, product_image_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, color_id) DO UPDATE SET product_image_id = EXCLUDED.product_image_id`,
        [productId, map.color_id, imageId]
      );
    }

    const primaryUrl =
      imgs.find((i) => i.is_primary)?.image_url.trim() ||
      imgs[0].image_url.trim();
    await client.query(`UPDATE products SET image_url = $1 WHERE id = $2`, [primaryUrl, productId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const enrichProductRow = async <T extends { id: string; image_url: string | null }>(
  product: T
): Promise<
  T & {
    images: ProductImageRow[];
    colors: ProductColorRow[];
    color_images: ProductColorImageRow[];
  }
> => {
  const [images, colors, color_images] = await Promise.all([
    loadProductImages(product.id),
    loadProductColors(product.id),
    loadProductColorImages(product.id),
  ]);
  return { ...product, images, colors, color_images };
};
