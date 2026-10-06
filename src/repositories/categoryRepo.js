import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, dbPool } from '../config/db.js';
import { memoryStore } from './storeMemory.js';
import { slugify } from '../utils/slugify.js';
import { fastCache } from '../utils/cache.js';

export const categoryRepo = {
  async getAllCategories(activeOnly = true) {
    const cacheKey = `categories_${activeOnly}`;
    const cached = fastCache.get(cacheKey);
    if (cached) return cached;

    try {
      if (dbPool) {
        let query = 'SELECT * FROM categories';
        if (activeOnly) query += " WHERE status = 'active'";
        query += ' ORDER BY sort_order ASC';
        const res = await dbPool.query(query);
        if (res.rows && res.rows.length > 0) {
          fastCache.set(cacheKey, res.rows, 60000);
          return res.rows;
        }
      }
      const { data, error } = await supabaseAdmin
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return activeOnly ? data.filter((c) => c.status === 'active') : data;
      }
    } catch (err) {
      // Fallback
    }

    let cats = [...memoryStore.categories];
    if (activeOnly) {
      cats = cats.filter((c) => c.status === 'active');
    }
    return cats.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  },

  async findBySlug(slug) {
    try {
      if (dbPool) {
        const res = await dbPool.query('SELECT * FROM categories WHERE slug = $1 LIMIT 1', [slug]);
        if (res.rows[0]) return res.rows[0];
      }
      const { data, error } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('slug', slug)
        .single();
      if (!error && data) return data;
    } catch (err) {
      // Fallback
    }
    return memoryStore.categories.find((c) => c.slug === slug) || null;
  },

  async findById(id) {
    try {
      if (dbPool) {
        const res = await dbPool.query('SELECT * FROM categories WHERE id = $1 LIMIT 1', [id]);
        if (res.rows[0]) return res.rows[0];
      }
      const { data, error } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();
      if (!error && data) return data;
    } catch (err) {
      // Fallback
    }
    return memoryStore.categories.find((c) => c.id === id) || null;
  },

  async create(data) {
    const newCategory = {
      id: uuidv4(),
      name: data.name,
      name_km: data.name_km || data.name,
      slug: data.slug || slugify(data.name),
      icon: data.icon || 'Folder',
      image_url: data.image_url || null,
      description: data.description || '',
      sort_order: data.sort_order || memoryStore.categories.length + 1,
      status: data.status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      if (dbPool) {
        const res = await dbPool.query(
          `INSERT INTO categories (id, name, name_km, slug, icon, image_url, description, sort_order, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [
            newCategory.id,
            newCategory.name,
            newCategory.name_km,
            newCategory.slug,
            newCategory.icon,
            newCategory.image_url,
            newCategory.description,
            newCategory.sort_order,
            newCategory.status
          ]
        );
        if (res.rows[0]) {
          fastCache.invalidate('categories');
          memoryStore.categories.push(res.rows[0]);
          return res.rows[0];
        }
      }
      await supabaseAdmin.from('categories').insert(newCategory);
    } catch (err) {
      // Fallback
    }

    fastCache.invalidate('categories');
    memoryStore.categories.push(newCategory);
    return newCategory;
  },

  async update(id, data) {
    const slug = data.name && !data.slug ? slugify(data.name) : data.slug;
    try {
      if (dbPool) {
        const res = await dbPool.query(
          `UPDATE categories 
           SET name = COALESCE($2, name),
               name_km = COALESCE($3, name_km),
               slug = COALESCE($4, slug),
               icon = COALESCE($5, icon),
               image_url = COALESCE($6, image_url),
               description = COALESCE($7, description),
               sort_order = COALESCE($8, sort_order),
               status = COALESCE($9, status),
               updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id, data.name, data.name_km, slug, data.icon, data.image_url, data.description, data.sort_order, data.status]
        );
        if (res.rows[0]) {
          fastCache.invalidate('categories');
          const idx = memoryStore.categories.findIndex((c) => c.id === id);
          if (idx !== -1) memoryStore.categories[idx] = res.rows[0];
          return res.rows[0];
        }
      }
    } catch (err) {
      // Fallback
    }

    fastCache.invalidate('categories');
    const index = memoryStore.categories.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const existing = memoryStore.categories[index];
    const updated = {
      ...existing,
      ...data,
      slug: slug || existing.slug,
      updated_at: new Date().toISOString()
    };
    memoryStore.categories[index] = updated;
    return updated;
  },

  async delete(id) {
    fastCache.invalidate('categories');
    try {
      if (dbPool) {
        await dbPool.query('DELETE FROM categories WHERE id = $1', [id]);
      } else {
        await supabaseAdmin.from('categories').delete().eq('id', id);
      }
    } catch (err) {
      // Fallback
    }
    const index = memoryStore.categories.findIndex((c) => c.id === id);
    if (index === -1) return false;
    memoryStore.categories.splice(index, 1);
    return true;
  }
};
