import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, dbPool } from '../config/db.js';
import { memoryStore } from './storeMemory.js';
import { slugify } from '../utils/slugify.js';
import { fastCache } from '../utils/cache.js';

export const productRepo = {
  async getProducts({
    categoryId,
    categorySlug,
    search,
    stockType,
    featured,
    minPrice,
    maxPrice,
    sortBy = 'newest',
    publishedOnly = true,
    page = 1,
    limit = 20
  } = {}) {
    const cacheKey = `prods_${categoryId}_${categorySlug}_${search}_${stockType}_${featured}_${minPrice}_${maxPrice}_${sortBy}_${publishedOnly}_${page}_${limit}`;
    const cached = fastCache.get(cacheKey);
    if (cached) return cached;

    try {
      if (dbPool) {
        let sql = `
          SELECT 
            p.*,
            json_build_object(
              'id', c.id,
              'name', c.name,
              'name_km', c.name_km,
              'slug', c.slug
            ) as category,
            COALESCE((
              SELECT count(*)::int 
              FROM stock_items s 
              WHERE s.product_id = p.id AND s.status = 'available'
            ), 0) as stock_quantity
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE 1=1
        `;
        const params = [];
        let pIndex = 1;

        if (publishedOnly) {
          sql += ` AND p.published = true AND p.status = 'published'`;
        } else {
          sql += ` AND p.status != 'archived'`;
        }

        if (categorySlug) {
          sql += ` AND c.slug = $${pIndex++}`;
          params.push(categorySlug);
        } else if (categoryId) {
          sql += ` AND p.category_id = $${pIndex++}`;
          params.push(categoryId);
        } else if (publishedOnly) {
          // Do not show topup & gamepass packages in the general store catalog for customers
          sql += ` AND (c.slug NOT IN ('topup', 'gamepass') OR c.slug IS NULL)`;
        }

        if (search) {
          sql += ` AND (p.name ILIKE $${pIndex} OR p.slug ILIKE $${pIndex} OR p.name_km ILIKE $${pIndex})`;
          params.push(`%${search}%`);
          pIndex++;
        }

        if (stockType) {
          sql += ` AND p.stock_type = $${pIndex++}`;
          params.push(stockType);
        }

        if (featured !== undefined) {
          sql += ` AND p.featured = $${pIndex++}`;
          params.push(Boolean(featured));
        }

        if (minPrice !== undefined) {
          sql += ` AND p.price >= $${pIndex++}`;
          params.push(Number(minPrice));
        }

        if (maxPrice !== undefined) {
          sql += ` AND p.price <= $${pIndex++}`;
          params.push(Number(maxPrice));
        }

        // Sorting
        switch (sortBy) {
          case 'price_asc':
            sql += ` ORDER BY p.price ASC`;
            break;
          case 'price_desc':
            sql += ` ORDER BY p.price DESC`;
            break;
          case 'popular':
          case 'bestselling':
            sql += ` ORDER BY p.sold_quantity DESC, p.created_at DESC`;
            break;
          case 'rating':
            sql += ` ORDER BY p.rating DESC, p.created_at DESC`;
            break;
          case 'newest':
          default:
            sql += ` ORDER BY p.created_at DESC`;
            break;
        }

        const countRes = await dbPool.query(`SELECT count(*) FROM (${sql}) as count_query`, params);
        const total = parseInt(countRes.rows[0]?.count || '0', 10);

        sql += ` LIMIT $${pIndex++} OFFSET $${pIndex++}`;
        params.push(limit, (page - 1) * limit);

        const res = await dbPool.query(sql, params);
        if (res.rows) {
          const result = { items: res.rows, total, page, limit };
          fastCache.set(cacheKey, result, 30000);
          return result;
        }
      }
    } catch (err) {
      // Fallback
    }

    let list = [...memoryStore.products];

    if (publishedOnly) {
      list = list.filter((p) => p.published === true && p.status === 'published');
    } else {
      list = list.filter((p) => p.status !== 'archived');
    }

    if (categorySlug) {
      const cat = memoryStore.categories.find((c) => c.slug === categorySlug);
      if (cat) {
        list = list.filter((p) => p.category_id === cat.id);
      } else {
        return { items: [], total: 0, page, limit };
      }
    } else if (categoryId) {
      list = list.filter((p) => p.category_id === categoryId);
    } else if (publishedOnly) {
      const excludedCats = memoryStore.categories.filter((c) => ['topup', 'gamepass'].includes(c.slug)).map((c) => c.id);
      list = list.filter((p) => !excludedCats.includes(p.category_id));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.name_km && p.name_km.toLowerCase().includes(q)) ||
          p.slug.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    if (stockType) {
      list = list.filter((p) => p.stock_type === stockType);
    }

    if (featured !== undefined) {
      list = list.filter((p) => p.featured === Boolean(featured));
    }

    if (minPrice !== undefined) {
      list = list.filter((p) => {
        const effectivePrice = p.discount_price !== null ? p.discount_price : p.price;
        return effectivePrice >= Number(minPrice);
      });
    }

    if (maxPrice !== undefined) {
      list = list.filter((p) => {
        const effectivePrice = p.discount_price !== null ? p.discount_price : p.price;
        return effectivePrice <= Number(maxPrice);
      });
    }

    // Dynamic stock calculations
    list = list.map((p) => {
      const availableCount = memoryStore.stock_items.filter(
        (s) => s.product_id === p.id && s.status === 'available'
      ).length;
      const category = memoryStore.categories.find((c) => c.id === p.category_id);

      return {
        ...p,
        stock_quantity: availableCount,
        category: category ? { id: category.id, name: category.name, name_km: category.name_km, slug: category.slug } : null
      };
    });

    // Sorting
    switch (sortBy) {
      case 'price_asc':
        list.sort((a, b) => (a.discount_price ?? a.price) - (b.discount_price ?? b.price));
        break;
      case 'price_desc':
        list.sort((a, b) => (b.discount_price ?? b.price) - (a.discount_price ?? a.price));
        break;
      case 'popular':
      case 'bestselling':
        list.sort((a, b) => (b.sold_quantity || 0) - (a.sold_quantity || 0));
        break;
      case 'rating':
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'newest':
      default:
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
    }

    const total = list.length;
    const startIndex = (page - 1) * limit;
    const items = list.slice(startIndex, startIndex + limit);

    return { items, total, page, limit };
  },

  async findById(id) {
    try {
      if (dbPool) {
        const res = await dbPool.query(
          `SELECT 
            p.*,
            json_build_object('id', c.id, 'name', c.name, 'name_km', c.name_km, 'slug', c.slug) as category,
            COALESCE((SELECT count(*)::int FROM stock_items s WHERE s.product_id = p.id AND s.status = 'available'), 0) as stock_quantity
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.id = $1 LIMIT 1`,
          [id]
        );
        if (res.rows[0]) return res.rows[0];
      }
    } catch (err) {
      // Fallback
    }

    const p = memoryStore.products.find((item) => item.id === id);
    if (!p) return null;
    const availableCount = memoryStore.stock_items.filter(
      (s) => s.product_id === p.id && s.status === 'available'
    ).length;
    const category = memoryStore.categories.find((c) => c.id === p.category_id);
    return {
      ...p,
      stock_quantity: availableCount,
      category: category ? { id: category.id, name: category.name, name_km: category.name_km, slug: category.slug } : null
    };
  },

  async findBySlug(slug) {
    try {
      if (dbPool) {
        const res = await dbPool.query(
          `SELECT 
            p.*,
            json_build_object('id', c.id, 'name', c.name, 'name_km', c.name_km, 'slug', c.slug) as category,
            COALESCE((SELECT count(*)::int FROM stock_items s WHERE s.product_id = p.id AND s.status = 'available'), 0) as stock_quantity
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.slug = $1 LIMIT 1`,
          [slug]
        );
        if (res.rows[0]) return res.rows[0];
      }
    } catch (err) {
      // Fallback
    }

    const p = memoryStore.products.find((item) => item.slug === slug);
    if (!p) return null;
    const availableCount = memoryStore.stock_items.filter(
      (s) => s.product_id === p.id && s.status === 'available'
    ).length;
    const category = memoryStore.categories.find((c) => c.id === p.category_id);
    return {
      ...p,
      stock_quantity: availableCount,
      category: category ? { id: category.id, name: category.name, name_km: category.name_km, slug: category.slug } : null
    };
  },

  async create(data) {
    const newProduct = {
      id: uuidv4(),
      category_id: data.category_id,
      name: data.name,
      name_km: data.name_km || data.name,
      slug: data.slug || slugify(data.name),
      description: data.description || '',
      description_km: data.description_km || '',
      images: Array.isArray(data.images) && data.images.length > 0 ? data.images : ['https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600'],
      price: Number(data.price),
      discount_price: data.discount_price ? Number(data.discount_price) : null,
      currency: data.currency || 'USD',
      stock_type: data.stock_type || 'code',
      stock_quantity: 0,
      sold_quantity: 0,
      status: data.status || 'published',
      featured: Boolean(data.featured),
      published: data.published !== undefined ? Boolean(data.published) : true,
      rating: 5.0,
      instructions: data.instructions || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      if (dbPool) {
        const res = await dbPool.query(
          `INSERT INTO products (
            id, category_id, name, name_km, slug, description, description_km,
            images, price, discount_price, currency, stock_type, stock_quantity,
            sold_quantity, status, featured, published, rating, instructions, badge
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20
          ) RETURNING *`,
          [
            newProduct.id, newProduct.category_id, newProduct.name, newProduct.name_km,
            newProduct.slug, newProduct.description, newProduct.description_km,
            newProduct.images, newProduct.price, newProduct.discount_price,
            newProduct.currency, newProduct.stock_type, newProduct.stock_quantity,
            newProduct.sold_quantity, newProduct.status, newProduct.featured,
            newProduct.published, newProduct.rating, newProduct.instructions,
            data.badge || null
          ]
        );
        if (res.rows[0]) {
          fastCache.invalidate('prods_');
          memoryStore.products.unshift(res.rows[0]);
          return res.rows[0];
        }
      }
    } catch (err) {
      // Fallback
    }

    fastCache.invalidate('prods_');
    memoryStore.products.unshift(newProduct);
    return newProduct;
  },

  async update(id, data) {
    const slug = data.name && !data.slug ? slugify(data.name) : data.slug;
    try {
      if (dbPool) {
        const res = await dbPool.query(
          `UPDATE products
           SET category_id = COALESCE($2, category_id),
               name = COALESCE($3, name),
               name_km = COALESCE($4, name_km),
               slug = COALESCE($5, slug),
               description = COALESCE($6, description),
               description_km = COALESCE($7, description_km),
               images = COALESCE($8, images),
               price = COALESCE($9, price),
               discount_price = $10,
               stock_type = COALESCE($11, stock_type),
               featured = COALESCE($12, featured),
               published = COALESCE($13, published),
               instructions = COALESCE($14, instructions),
               status = COALESCE($15, status),
               badge = COALESCE($16, badge),
               updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [
            id, data.category_id, data.name, data.name_km, slug,
            data.description, data.description_km, data.images,
            data.price !== undefined ? Number(data.price) : null,
            data.discount_price !== undefined ? (data.discount_price ? Number(data.discount_price) : null) : null,
            data.stock_type, data.featured, data.published, data.instructions, data.status,
            data.badge !== undefined ? data.badge : null
          ]
        );
        if (res.rows[0]) {
          fastCache.invalidate('prods_');
          const idx = memoryStore.products.findIndex((p) => p.id === id);
          if (idx !== -1) memoryStore.products[idx] = res.rows[0];
          return res.rows[0];
        }

        // If product does not exist in DB yet, upsert it
        const insertRes = await dbPool.query(
          `INSERT INTO products (
            id, category_id, name, name_km, slug, description, description_km,
            images, price, discount_price, currency, stock_type, stock_quantity,
            sold_quantity, status, featured, published, rating, instructions, badge
          ) VALUES (
            $1, COALESCE($2, '10000000-0000-0000-0000-000000000006'), COALESCE($3, 'Product'), COALESCE($4, $3, 'Product'),
            COALESCE($5, $1::text), COALESCE($6, ''), COALESCE($7, ''),
            COALESCE($8, ARRAY['/categories/topup.png']::text[]), COALESCE($9, 0), $10, 'USD',
            COALESCE($11, 'manual'), 999, 0, COALESCE($12, 'published'), COALESCE($13, false),
            COALESCE($14, true), 5.0, COALESCE($15, ''), $16
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            name_km = EXCLUDED.name_km,
            price = EXCLUDED.price,
            discount_price = EXCLUDED.discount_price,
            category_id = EXCLUDED.category_id,
            badge = EXCLUDED.badge,
            images = EXCLUDED.images,
            description = EXCLUDED.description,
            instructions = EXCLUDED.instructions,
            updated_at = NOW()
          RETURNING *`,
          [
            id, data.category_id, data.name, data.name_km, slug,
            data.description, data.description_km, Array.isArray(data.images) ? data.images : ['/categories/topup.png'],
            data.price !== undefined ? Number(data.price) : null,
            data.discount_price !== undefined ? (data.discount_price ? Number(data.discount_price) : null) : null,
            data.stock_type, data.status, data.featured, data.published, data.instructions,
            data.badge !== undefined ? data.badge : null
          ]
        );

        if (insertRes.rows[0]) {
          fastCache.invalidate('prods_');
          const idx = memoryStore.products.findIndex((p) => p.id === id);
          if (idx !== -1) memoryStore.products[idx] = insertRes.rows[0];
          else memoryStore.products.unshift(insertRes.rows[0]);
          return insertRes.rows[0];
        }
      }
    } catch (err) {
      // Fallback
    }

    fastCache.invalidate('prods_');
    const index = memoryStore.products.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const existing = memoryStore.products[index];
    const updated = {
      ...existing,
      ...data,
      price: data.price !== undefined ? Number(data.price) : existing.price,
      discount_price: data.discount_price !== undefined ? (data.discount_price ? Number(data.discount_price) : null) : existing.discount_price,
      slug: slug || existing.slug,
      updated_at: new Date().toISOString()
    };

    memoryStore.products[index] = updated;
    return updated;
  },

  async delete(id) {
    fastCache.invalidate('prods_');
    let deleted = false;

    try {
      if (dbPool) {
        const res = await dbPool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        if (res.rowCount > 0) {
          deleted = true;
        }
      } else if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin.from('products').delete().eq('id', id).select('id');
        if (!error && data && data.length > 0) {
          deleted = true;
        }
      }
    } catch (err) {
      console.warn(`[productRepo.delete] Hard delete failed for ${id}, attempting soft delete/archive:`, err.message);
      // Fallback: If foreign keys prevent hard delete, soft delete by archiving and unpublishing
      try {
        if (dbPool) {
          const res = await dbPool.query(
            "UPDATE products SET status = 'archived', published = false, updated_at = NOW() WHERE id = $1 RETURNING id",
            [id]
          );
          if (res.rowCount > 0) deleted = true;
        } else if (supabaseAdmin) {
          const { data } = await supabaseAdmin
            .from('products')
            .update({ status: 'archived', published: false })
            .eq('id', id)
            .select('id');
          if (data && data.length > 0) deleted = true;
        }
      } catch (archiveErr) {
        console.error(`[productRepo.delete] Archive fallback failed for ${id}:`, archiveErr.message);
      }
    }

    const index = memoryStore.products.findIndex((p) => p.id === id);
    if (index !== -1) {
      memoryStore.products.splice(index, 1);
      deleted = true;
    }

    return deleted;
  }
};
