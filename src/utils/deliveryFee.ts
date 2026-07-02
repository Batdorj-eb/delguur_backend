/** Хүргэлтийн төлбөр (төгрөг) — frontend-тэй ижил байх ёстой. */
export const DELIVERY_SHIPPING_FEE_MNT = 8_000;
export const DELIVERY_SHIPPING_FEE_DISCOUNT_MNT = 7_000;
export const DELIVERY_SHIPPING_FEE_DISCOUNT_THRESHOLD_MNT = 100_000;
/** Хүргүүлэхийн доод захиалгын дүн (барааны нийт) */
export const DELIVERY_MIN_ORDER_MNT = 30_000;

export function isDeliveryAvailable(subtotal: number): boolean {
  return subtotal >= DELIVERY_MIN_ORDER_MNT;
}

export function getDeliveryShippingFeeMnt(subtotal: number): number {
  return subtotal >= DELIVERY_SHIPPING_FEE_DISCOUNT_THRESHOLD_MNT
    ? DELIVERY_SHIPPING_FEE_DISCOUNT_MNT
    : DELIVERY_SHIPPING_FEE_MNT;
}
