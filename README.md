# 🛍️ Delguur Backend API

Node.js + Express + PostgreSQL дээр суурилсан Delguur e-commerce backend.

---

## 🚀 Суулгах

### 1. Dependencies суулгах
```bash
npm install
```

### 2. Тохиргоо
```bash
cp .env.example .env
# .env файлыг засварлаж DB мэдээллээ оруулна
```

### 3. PostgreSQL database үүсгэх
```sql
CREATE DATABASE delguur_db;
```

### 4. Хүснэгт үүсгэх (Migration)
```bash
npm run db:migrate
```

### 5. Жишээ өгөгдөл нэмэх (Seed)
```bash
npm run db:seed
# Admin: admin@delguur.mn / admin123
```

### 6. Сервер эхлүүлэх
```bash
npm run dev      # Development
npm run build && npm start   # Production
```

---

## 📋 API Endpoints

**Base URL:** `http://localhost:5000/api`

### 🔐 Auth (Dashboard)
| Method | Endpoint | Тайлбар |
|--------|----------|---------|
| POST | `/auth/login` | Нэвтрэх |
| GET | `/auth/me` | Одоогийн admin мэдээлэл |

**Login жишээ:**
```json
POST /api/auth/login
{
  "email": "admin@delguur.mn",
  "password": "admin123"
}
```

---

### 🛒 Products (Public)
| Method | Endpoint | Тайлбар |
|--------|----------|---------|
| GET | `/products` | Бүх бараа (pagination, filter) |
| GET | `/products/categories` | Ангиллын жагсаалт |
| GET | `/products/:id` | Нэг барааны дэлгэрэнгүй |

**Query params:**
- `?page=1&limit=12` — Pagination
- `?category=Гутал` — Ангиллаар шүүх
- `?search=hoodie` — Нэрээр хайх

### 🔒 Admin Products
| Method | Endpoint | Тайлбар |
|--------|----------|---------|
| GET | `/admin/products` | Бүх бараа (inactive-г багтааж) |
| POST | `/admin/products` | Шинэ бараа нэмэх |
| PATCH | `/admin/products/:id` | Бараа засах |
| DELETE | `/admin/products/:id` | Бараа устгах |

**Бараа нэмэх жишээ:**
```json
POST /api/admin/products
Authorization: Bearer <token>
{
  "name": "New Product",
  "description": "Тайлбар...",
  "price": 99.99,
  "image_url": "https://...",
  "category": "Хувцас",
  "stock": 50
}
```

---

### 🛍️ Cart (Public — session-based)

> `x-session-id` header-т unique session ID илгээх шаардлагатай.
> Frontend-д `localStorage`-д хадгалсан UUID ашиглана.

| Method | Endpoint | Тайлбар |
|--------|----------|---------|
| GET | `/cart` | Сагсны агуулга |
| POST | `/cart/items` | Бараа нэмэх |
| PATCH | `/cart/items/:itemId` | Тоо хэмжээ өөрчлөх |
| DELETE | `/cart/items/:itemId` | Бараа хасах |
| DELETE | `/cart` | Сагс цэвэрлэх |

**Бараа нэмэх жишээ:**
```json
POST /api/cart/items
x-session-id: abc123-session-id
{
  "product_id": "uuid-here",
  "quantity": 2
}
```

---

### 📦 Orders
| Method | Endpoint | Тайлбар |
|--------|----------|---------|
| POST | `/orders` | Захиалга үүсгэх |
| GET | `/orders/:orderNumber` | Захиалга хайх (ORD-xxx) |
| GET | `/admin/orders` | Бүх захиалга (admin) |
| PATCH | `/admin/orders/:id/status` | Төлөв өөрчлөх (admin) |

**Захиалга үүсгэх жишээ:**
```json
POST /api/orders
{
  "customer_name": "Болд",
  "customer_email": "bold@gmail.com",
  "customer_phone": "99001122",
  "shipping_address": "УБ, СБД, 1-р хороо, ...",
  "payment_method": "bank_transfer",
  "items": [
    { "product_id": "uuid", "quantity": 1 },
    { "product_id": "uuid2", "quantity": 2 }
  ]
}
```

**Захиалгын status утгууд:**
`pending` → `confirmed` → `processing` → `shipped` → `delivered` | `cancelled`

**Payment method:** `bank_transfer` | `cash_on_delivery`

---

## 🗄️ Database Schema

```
users          — Admin нэвтрэх
products       — Бараа мэдээлэл
carts          — Сагс (session-based)
cart_items     — Сагсны барааны мөрүүд
orders         — Захиалга
order_items    — Захиалгын барааны мөрүүд
```

---

## 🔧 Next.js холболт

`lib/api.ts` файлд:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const fetchProducts = async (params?: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}/products${query ? `?${query}` : ''}`);
  return res.json();
};
```

`.env.local` файлд:
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```
