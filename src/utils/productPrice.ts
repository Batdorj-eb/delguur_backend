import { AppError } from '../middleware/errorHandler';

/** SQL if expression: идэвхтэй хямдралын үнэ эсвэл үндсэн үнэ */
export const EFFECTIVE_PRICE_SQL = `
  CASE
    WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN p.sale_price
    ELSE p.price
  END
`;

export function effectivePrice(price: number, salePrice: number | null | undefined): number {
  const base = Number(price);
  if (salePrice == null || salePrice === undefined || Number.isNaN(Number(salePrice))) {
    return base;
  }
  const sale = Number(salePrice);
  if (sale >= 0 && sale < base) return sale;
  return base;
}

export function isOnSale(price: number, salePrice: number | null | undefined): boolean {
  return effectivePrice(price, salePrice) < Number(price);
}

export function discountPercent(price: number, salePrice: number | null | undefined): number | null {
  const base = Number(price);
  if (!isOnSale(base, salePrice)) return null;
  const sale = Number(salePrice);
  return Math.round((1 - sale / base) * 100);
}

/** Admin create/update — sale_price: null = хямдралгүй */
export function normalizeSalePrice(
  price: number,
  salePriceRaw: number | null | undefined,
  required: boolean
): number | null {
  if (salePriceRaw === null || salePriceRaw === undefined || salePriceRaw === ('' as unknown)) {
    return null;
  }
  const sale = Number(salePriceRaw);
  if (!Number.isFinite(sale)) {
    throw new AppError(400, 'Хямдралын үнэ буруу байна.');
  }
  if (sale < 0) {
    throw new AppError(400, 'Хямдралын үнэ сөрөг байж болохгүй.');
  }
  if (required && sale >= price) {
    throw new AppError(400, 'Хямдралын үнэ үндсэн үнээс бага байх ёстой.');
  }
  if (!required && sale >= price) {
    return null;
  }
  return sale;
}
