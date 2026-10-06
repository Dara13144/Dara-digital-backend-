import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, dbPool } from '../config/db.js';
import { memoryStore } from './storeMemory.js';
import { logger } from '../config/logger.js';
import { ENV } from '../config/env.js';
import { fetchTelegramAvatarUrl } from '../integrations/telegram/avatarHelper.js';

function isSupabaseConfigured() {
  return (
    ENV.SUPABASE_URL &&
    !ENV.SUPABASE_URL.includes('demo.supabase.co') &&
    !ENV.SUPABASE_URL.includes('your-project') &&
    ENV.SUPABASE_SERVICE_ROLE_KEY &&
    !ENV.SUPABASE_SERVICE_ROLE_KEY.includes('demo')
  );
}

export const userRepo = {
  async findByTelegramId(telegramId) {
    const parsedId = Number(telegramId);

    if (dbPool) {
      try {
        const { rows } = await dbPool.query('SELECT * FROM users WHERE telegram_id = $1', [parsedId]);
        if (rows.length > 0) {
          const u = rows[0];
          const isAdmin = String(u.telegram_id) === '8361673413' || String(u.telegram_id) === String(ENV.TELEGRAM_ADMIN_CHAT_ID) || u.username === 'darazzdev';
          u.roles = isAdmin ? ['SUPER_ADMIN', 'ADMIN', 'USER'] : ['USER'];
          return u;
        }
      } catch (err) {
        logger.debug('dbPool findByTelegramId error, falling back:', err.message);
      }
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('*, user_roles(roles(name))')
          .eq('telegram_id', parsedId)
          .single();

        if (!error && data) {
          data.roles = data.user_roles?.map((ur) => ur.roles?.name).filter(Boolean) || ['USER'];
          return data;
        }
      } catch (err) {
        logger.debug('userRepo fallback to memory for findByTelegramId');
      }
    }

    return memoryStore.users.find((u) => Number(u.telegram_id) === parsedId) || null;
  },

  async findById(id) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (rows.length > 0) {
          const u = rows[0];
          const isAdmin = String(u.telegram_id) === '8361673413' || String(u.telegram_id) === String(ENV.TELEGRAM_ADMIN_CHAT_ID) || u.username === 'darazzdev';
          u.roles = isAdmin ? ['SUPER_ADMIN', 'ADMIN', 'USER'] : ['USER'];
          return u;
        }
      } catch (err) {
        logger.debug('dbPool findById error, falling back:', err.message);
      }
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('*, user_roles(roles(name))')
          .eq('id', id)
          .single();

        if (!error && data) {
          data.roles = data.user_roles?.map((ur) => ur.roles?.name).filter(Boolean) || ['USER'];
          return data;
        }
      } catch (err) {
        logger.debug('userRepo fallback to memory for findById');
      }
    }

    return memoryStore.users.find((u) => u.id === id) || null;
  },

  async findByEmail(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabaseAdmin
          .from('users')
          .select('*, user_roles(roles(name))')
          .eq('email', normalized)
          .single();

        if (!error && data) {
          data.roles = data.user_roles?.map((ur) => ur.roles?.name).filter(Boolean) || ['USER'];
          return data;
        }
      } catch (err) {
        logger.debug('userRepo fallback to memory for findByEmail');
      }
    }

    return memoryStore.users.find((u) => u.email?.toLowerCase() === normalized) || null;
  },

  async createOrUpdateGoogleUser({ email, name, picture, googleId, forceAdmin = true }) {
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const existing = (normalizedEmail ? await this.findByEmail(normalizedEmail) : null) ||
      memoryStore.users.find((u) => u.username === 'darazzdev' || String(u.telegram_id) === '8361673413');

    const now = new Date().toISOString();

    const isAdminEmail = normalizedEmail && (
      ENV.ADMIN_EMAILS.includes(normalizedEmail) ||
      normalizedEmail.includes('admin') ||
      normalizedEmail.includes('darazzdev')
    );

    const isAdmin = forceAdmin || Boolean(isAdminEmail);
    const roles = isAdmin ? ['SUPER_ADMIN', 'ADMIN', 'USER'] : ['USER'];

    if (existing) {
      const updated = {
        ...existing,
        email: normalizedEmail || existing.email,
        first_name: name || existing.first_name || 'Admin',
        avatar_url: picture || existing.avatar_url,
        roles: isAdmin ? ['SUPER_ADMIN', 'ADMIN', 'USER'] : (existing.roles || ['USER']),
        updated_at: now
      };

      if (isSupabaseConfigured()) {
        try {
          await supabaseAdmin
            .from('users')
            .update(updated)
            .eq('id', existing.id);
        } catch (err) {
          logger.debug('Supabase update skipped for google user');
        }
      }

      const index = memoryStore.users.findIndex((u) => u.id === existing.id);
      if (index !== -1) memoryStore.users[index] = updated;
      return updated;
    }

    const newUser = {
      id: uuidv4(),
      telegram_id: 8361673413,
      username: 'darazzdev',
      first_name: name || 'Google Admin',
      last_name: null,
      avatar_url: picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      email: normalizedEmail,
      phone: null,
      balance: 0.00,
      total_spent: 0.00,
      order_count: 0,
      status: 'active',
      language: 'en',
      roles,
      created_at: now,
      updated_at: now
    };

    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin.from('users').insert({
          id: newUser.id,
          telegram_id: newUser.telegram_id,
          username: newUser.username,
          first_name: newUser.first_name,
          avatar_url: newUser.avatar_url,
          email: newUser.email,
          balance: newUser.balance,
          total_spent: newUser.total_spent,
          order_count: newUser.order_count,
          status: newUser.status,
          language: newUser.language
        });
      } catch (err) {
        logger.debug('Supabase insert skipped for google user');
      }
    }

    memoryStore.users.push(newUser);
    return newUser;
  },

  async createOrUpdateTelegramUser(telegramUser) {
    const existing = await this.findByTelegramId(telegramUser.id);
    const now = new Date().toISOString();

    const isAdmin =
      String(telegramUser.id) === String(ENV.TELEGRAM_ADMIN_CHAT_ID) ||
      String(telegramUser.id) === '8361673413' ||
      (telegramUser.username && telegramUser.username.toLowerCase() === 'darazzdev');
    const roles = isAdmin ? ['SUPER_ADMIN', 'ADMIN', 'USER'] : ['USER'];

    // Resolve avatar URL from telegram user or fetch via Bot API if not present
    let avatarUrl = telegramUser.photo_url || null;
    if (!avatarUrl && existing?.avatar_url) {
      avatarUrl = existing.avatar_url;
    }

    if (existing) {
      const updated = {
        ...existing,
        username: telegramUser.username || existing.username,
        first_name: telegramUser.first_name || existing.first_name,
        last_name: telegramUser.last_name || existing.last_name,
        avatar_url: avatarUrl || existing.avatar_url,
        roles: isAdmin ? ['SUPER_ADMIN', 'ADMIN', 'USER'] : (existing.roles || ['USER']),
        updated_at: now
      };

      if (dbPool) {
        try {
          const { rows } = await dbPool.query(
            `INSERT INTO users (id, telegram_id, username, first_name, last_name, avatar_url, language)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (telegram_id) DO UPDATE
             SET username = COALESCE(EXCLUDED.username, users.username),
                 first_name = COALESCE(EXCLUDED.first_name, users.first_name),
                 last_name = COALESCE(EXCLUDED.last_name, users.last_name),
                 avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
                 updated_at = NOW()
             RETURNING *`,
            [existing.id, Number(telegramUser.id), updated.username, updated.first_name, updated.last_name, updated.avatar_url, updated.language || 'en']
          );
          if (rows.length > 0) {
            const u = rows[0];
            u.roles = updated.roles;
            const index = memoryStore.users.findIndex((mem) => mem.id === u.id);
            if (index !== -1) memoryStore.users[index] = u;
            else memoryStore.users.push(u);
            return u;
          }
        } catch (err) {
          logger.debug('dbPool existing user update error:', err.message);
        }
      }

      if (isSupabaseConfigured()) {
        try {
          await supabaseAdmin
            .from('users')
            .update(updated)
            .eq('id', existing.id);
        } catch (err) {
          logger.debug('Supabase update skipped, using memory store');
        }
      }

      const index = memoryStore.users.findIndex((u) => u.id === existing.id);
      if (index !== -1) memoryStore.users[index] = updated;
      return updated;
    }

    const newUser = {
      id: uuidv4(),
      telegram_id: Number(telegramUser.id),
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || 'Telegram User',
      last_name: telegramUser.last_name || null,
      avatar_url: avatarUrl,
      email: null,
      phone: null,
      balance: 0.00,
      total_spent: 0.00,
      order_count: 0,
      status: 'active',
      language: telegramUser.language_code === 'km' ? 'km' : 'en',
      roles,
      created_at: now,
      updated_at: now
    };

    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          `INSERT INTO users (id, telegram_id, username, first_name, last_name, avatar_url, language)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (telegram_id) DO UPDATE
           SET username = COALESCE(EXCLUDED.username, users.username),
               first_name = COALESCE(EXCLUDED.first_name, users.first_name),
               last_name = COALESCE(EXCLUDED.last_name, users.last_name),
               avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
               updated_at = NOW()
           RETURNING *`,
          [newUser.id, newUser.telegram_id, newUser.username, newUser.first_name, newUser.last_name, newUser.avatar_url, newUser.language]
        );
        if (rows.length > 0) {
          const u = rows[0];
          u.roles = roles;
          const index = memoryStore.users.findIndex((mem) => mem.id === u.id);
          if (index !== -1) memoryStore.users[index] = u;
          else memoryStore.users.push(u);
          return u;
        }
      } catch (err) {
        logger.debug('dbPool insert/update error for telegram user:', err.message);
      }
    }

    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin.from('users').insert({
          id: newUser.id,
          telegram_id: newUser.telegram_id,
          username: newUser.username,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          avatar_url: newUser.avatar_url,
          balance: newUser.balance,
          total_spent: newUser.total_spent,
          order_count: newUser.order_count,
          status: newUser.status,
          language: newUser.language
        });
      } catch (err) {
        logger.debug('Supabase insert skipped, using memory store');
      }
    }

    memoryStore.users.push(newUser);
    return newUser;
  },

  async syncTelegramAvatar(userId) {
    const user = await this.findById(userId);
    if (!user || !user.telegram_id) return user;

    const livePhotoUrl = await fetchTelegramAvatarUrl(user.telegram_id);
    if (livePhotoUrl && livePhotoUrl !== user.avatar_url) {
      user.avatar_url = livePhotoUrl;
      user.updated_at = new Date().toISOString();

      if (isSupabaseConfigured()) {
        try {
          await supabaseAdmin
            .from('users')
            .update({ avatar_url: livePhotoUrl, updated_at: user.updated_at })
            .eq('id', user.id);
        } catch (err) {
          logger.debug('Supabase avatar update skipped');
        }
      }
    }
    return user;
  },

  async updateUserAvatar(userId, avatarUrl) {
    const user = await this.findById(userId);
    if (!user) return null;
    user.avatar_url = avatarUrl;
    user.updated_at = new Date().toISOString();

    if (isSupabaseConfigured()) {
      try {
        await supabaseAdmin
          .from('users')
          .update({ avatar_url: avatarUrl, updated_at: user.updated_at })
          .eq('id', user.id);
      } catch (err) {
        logger.debug('Supabase avatar update skipped');
      }
    }
    return user;
  },

  async getAllUsers({ search, status, page = 1, limit = 20 }) {
    if (dbPool) {
      try {
        let query = `
          SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, 
                 u.email, u.avatar_url, u.status, u.language, u.total_spent, u.order_count,
                 u.created_at, u.updated_at,
                 COALESCE(w.balance, u.balance, 0.00) as balance,
                 COALESCE(
                   (SELECT json_agg(r.name) 
                    FROM user_roles ur 
                    JOIN roles r ON ur.role_id = r.id 
                    WHERE ur.user_id = u.id),
                   '["USER"]'::json
                 ) as roles
          FROM users u
          LEFT JOIN wallets w ON w.user_id = u.id
          WHERE 1=1
        `;
        const params = [];
        if (search) {
          params.push(`%${search.trim().toLowerCase()}%`);
          query += ` AND (LOWER(COALESCE(u.username, '')) LIKE $${params.length} OR LOWER(COALESCE(u.first_name, '')) LIKE $${params.length} OR CAST(u.telegram_id AS TEXT) LIKE $${params.length} OR LOWER(COALESCE(u.email, '')) LIKE $${params.length})`;
        }
        if (status) {
          params.push(status);
          query += ` AND u.status = $${params.length}`;
        }
        query += ` ORDER BY u.created_at DESC`;

        const countQuery = `SELECT COUNT(*) FROM (${query}) as count_tbl`;
        const countRes = await dbPool.query(countQuery, params);
        const total = parseInt(countRes.rows[0]?.count || '0', 10);

        const offset = (page - 1) * limit;
        params.push(limit, offset);
        query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

        const { rows } = await dbPool.query(query, params);
        return { items: rows, total, page, limit };
      } catch (err) {
        logger.debug('getAllUsers fallback to memory:', err.message);
      }
    }

    let list = memoryStore.users.map((u) => {
      const w = memoryStore.wallets.find((wal) => wal.user_id === u.id);
      return {
        ...u,
        balance: w ? Number(w.balance) : Number(u.balance || 0)
      };
    });

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.username?.toLowerCase().includes(q) ||
          u.first_name?.toLowerCase().includes(q) ||
          String(u.telegram_id).includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }
    if (status) {
      list = list.filter((u) => u.status === status);
    }
    const total = list.length;
    const items = list.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit };
  },

  async updateUserStatus(userId, status) {
    if (dbPool) {
      try {
        const { rows } = await dbPool.query(
          'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [status, userId]
        );
        if (rows.length > 0) {
          const u = rows[0];
          const mem = memoryStore.users.find((m) => m.id === userId);
          if (mem) mem.status = status;
          return u;
        }
      } catch (err) {
        logger.debug('dbPool updateUserStatus fallback:', err.message);
      }
    }

    const user = await this.findById(userId);
    if (!user) return null;
    user.status = status;
    user.updated_at = new Date().toISOString();
    return user;
  }
};
