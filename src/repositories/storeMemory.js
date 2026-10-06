import { sha256 } from '../utils/crypto.js';

// In-memory data store cache to ensure 100% functionality and test resilience
export const memoryStore = {
  users: [
    {
      id: '00000000-0000-0000-0000-000000000099',
      telegram_id: 8361673413,
      username: 'darazzdev',
      first_name: 'Dara',
      last_name: 'Admin',
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      email: 'admin@daradigital.store',
      phone: '+85512345678',
      balance: 0.00,
      total_spent: 0.00,
      order_count: 0,
      status: 'active',
      language: 'en',
      roles: ['SUPER_ADMIN', 'ADMIN', 'USER'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  categories: [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Game Keys',
      name_km: 'កូដហ្គេម (Game Keys)',
      slug: 'game-keys',
      icon: 'Gamepad2',
      image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
      description: 'Steam, Epic Games, PlayStation, Xbox, and Origin activation keys',
      sort_order: 1,
      status: 'active'
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Gift Cards',
      name_km: 'កាតកាដូ (Gift Cards)',
      slug: 'gift-cards',
      icon: 'Gift',
      image_url: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&auto=format&fit=crop&q=80',
      description: 'Apple iTunes, Google Play, Steam Wallet, Netflix gift cards',
      sort_order: 2,
      status: 'active'
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Software & Tools',
      name_km: 'កម្មវិធីកុំព្យូទ័រ (Software)',
      slug: 'software-tools',
      icon: 'Code2',
      image_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
      description: 'Windows 11 Pro, Office 365, Antivirus, and Developer Tool licenses',
      sort_order: 3,
      status: 'active'
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Premium Subscriptions',
      name_km: 'គណនីពិសេស (Premium)',
      slug: 'premium-subscriptions',
      icon: 'Sparkles',
      image_url: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80',
      description: 'Spotify, YouTube Premium, Canva Pro, ChatGPT Plus, and VPN accounts',
      sort_order: 4,
      status: 'active'
    },
    {
      id: '10000000-0000-0000-0000-000000000005',
      name: 'Telegram & Discord',
      name_km: 'តេលេក្រាម & ឌីសខត (Social)',
      slug: 'telegram-discord',
      icon: 'Send',
      image_url: 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=600&auto=format&fit=crop&q=80',
      description: 'Telegram Premium Gift codes, Discord Nitro 1/3/12 Months, Boosts',
      sort_order: 5,
      status: 'active'
    }
  ],
  products: [


    {
      id: '20000000-0000-0000-0000-000000000005',
      category_id: '10000000-0000-0000-0000-000000000004',
      name: 'Canva Pro 1 Year Private Invite',
      name_km: 'Canva Pro ១ ឆ្នាំ (Invite)',
      slug: 'canva-pro-1-year-invite',
      description: 'Canva Pro subscription linked to your personal email with unlimited templates, AI tools, and background remover.',
      description_km: 'គណនី Canva Pro ១ ឆ្នាំ ប្រើប្រាស់មុខងារ AI និង Templates គ្មានដែនកំណត់។',
      images: ['https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=600&auto=format&fit=crop&q=80'],
      price: 15.00,
      discount_price: 8.99,
      currency: 'USD',
      stock_type: 'link',
      stock_quantity: 3,
      sold_quantity: 74,
      status: 'published',
      featured: true,
      published: true,
      rating: 4.92,
      instructions: 'Click the invitation link delivered in your order and log in with your Canva account.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '20000000-0000-0000-0000-000000000006',
      category_id: '10000000-0000-0000-0000-000000000004',
      name: 'CapCut Pro 1 Year VIP Subscription',
      name_km: 'CapCut Pro ១ ឆ្នាំ (VIP Access)',
      slug: 'capcut-pro-1-year',
      description: 'CapCut Pro 1-Year VIP Subscription. Unlock all premium video transitions, effects, AI auto-captions, 4K 60FPS export, and cloud backup.',
      description_km: 'គណនី CapCut Pro ១ ឆ្នាំ ដោះសោរមុខងារ VIP Effects, Auto-Captions, 4K Export និង Cloud Storage គ្មានដែនកំណត់។',
      images: ['/products/capcut_pro.png'],
      price: 19.99,
      discount_price: 14.50,
      currency: 'USD',
      stock_type: 'account',
      stock_quantity: 4,
      sold_quantity: 58,
      status: 'published',
      featured: true,
      published: true,
      rating: 4.98,
      instructions: 'Log in to CapCut on Mobile/PC using the provided email and password credentials.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '20000000-0000-0000-0000-000000000007',
      category_id: '10000000-0000-0000-0000-000000000004',
      name: 'Google Gemini Advanced 2.0 Ultra (1 Month)',
      name_km: 'Google Gemini Advanced (1 ខែ)',
      slug: 'google-gemini-advanced-1-month',
      description: 'Google Gemini Advanced AI subscription. 2 Million token context window, Google Workspace integration, Deep Research, and highest tier AI capabilities.',
      description_km: 'គណនី Google Gemini Advanced 2.0 ប្រើប្រាស់ AI ជំនាន់ខ្ពស់បំផុត Context 2M Tokens និង Deep Research។',
      images: ['/products/gemini_advanced.png'],
      price: 20.00,
      discount_price: 12.99,
      currency: 'USD',
      stock_type: 'account',
      stock_quantity: 5,
      sold_quantity: 84,
      status: 'published',
      featured: true,
      published: true,
      rating: 5.00,
      instructions: 'Sign in at https://gemini.google.com with the delivered account details.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '20000000-0000-0000-0000-000000000008',
      category_id: '10000000-0000-0000-0000-000000000003',
      name: 'Lovable Dev AI Pro Plan (1 Month)',
      name_km: 'Lovable Dev AI Pro (1 ខែ)',
      slug: 'lovable-dev-pro-plan',
      description: 'Lovable.dev Pro Plan. Autonomous AI full-stack app builder. Instant frontend + backend generation, Supabase database integration, and GitHub repository export.',
      description_km: 'គណនី Lovable.dev Pro សម្រាប់បង្កើត Full-stack Web Apps ជាមួយ AI ស្វ័យប្រវត្តិ និង Supabase/GitHub sync។',
      images: ['/products/lovable_pro.png'],
      price: 25.00,
      discount_price: 18.00,
      currency: 'USD',
      stock_type: 'account',
      stock_quantity: 3,
      sold_quantity: 39,
      status: 'published',
      featured: true,
      published: true,
      rating: 4.96,
      instructions: 'Log in at https://lovable.dev using the delivered account credentials.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '20000000-0000-0000-0000-000000000009',
      category_id: '10000000-0000-0000-0000-000000000001',
      name: 'Roblox Blox Fruits Account (Lv. 1763 + Midnight Blade + Saber + Fruits)',
      name_km: 'Roblox Blox Fruits Account (Lv. 1763 + ដាវកម្រ + ផ្លែឈើ)',
      slug: 'roblox-blox-fruits-account-lv1763',
      description: 'Roblox Blox Fruits Account Level 1763. Includes Midnight Blade, Saber, Oroshi, Koko, Pale 1st Form, Bazooka, Valkyrie Helmet, and full fruit inventory (Rubber, Diamond, Sand, Ice, Flame). Instant credential transfer.',
      description_km: 'គណនី Roblox Blox Fruits Level 1763 មានដាវកម្រ Midnight Blade, Saber, Oroshi, Koko, Valkyrie Helmet និងផ្លែឈើក្នុងកាតាបជាច្រើន។ ផ្ដល់ username/password ភ្លាមៗ។',
      images: ['/products/blox_fruits_account.jpg'],
      price: 35.00,
      discount_price: 22.50,
      currency: 'USD',
      stock_type: 'account',
      stock_quantity: 1,
      sold_quantity: 12,
      status: 'published',
      featured: true,
      published: true,
      rating: 5.00,
      instructions: '1. Open Roblox.com and log in with the delivered username & password.\n2. Change the password and link your personal email/2FA immediately.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  stock_items: [




    // Canva Pro
    { id: 's16', product_id: '20000000-0000-0000-0000-000000000005', stock_type: 'link', payload: 'https://www.canva.com/brand/join?token=cnv_invite_771a2b', stock_hash: sha256('https://www.canva.com/brand/join?token=cnv_invite_771a2b'), status: 'available', created_at: new Date().toISOString() },
    { id: 's17', product_id: '20000000-0000-0000-0000-000000000005', stock_type: 'link', payload: 'https://www.canva.com/brand/join?token=cnv_invite_882b3c', stock_hash: sha256('https://www.canva.com/brand/join?token=cnv_invite_882b3c'), status: 'available', created_at: new Date().toISOString() },
    { id: 's18', product_id: '20000000-0000-0000-0000-000000000005', stock_type: 'link', payload: 'https://www.canva.com/brand/join?token=cnv_invite_993c4d', stock_hash: sha256('https://www.canva.com/brand/join?token=cnv_invite_993c4d'), status: 'available', created_at: new Date().toISOString() },

    // CapCut Pro
    { id: 's19', product_id: '20000000-0000-0000-0000-000000000006', stock_type: 'account', payload: 'Email: capcut.pro.user01@daramini.store | Pass: CapCut@2026!VIP', stock_hash: sha256('capcut.pro.user01@daramini.store:CapCut@2026!VIP'), status: 'available', created_at: new Date().toISOString() },
    { id: 's20', product_id: '20000000-0000-0000-0000-000000000006', stock_type: 'account', payload: 'Email: capcut.pro.user02@daramini.store | Pass: CapCut@2026!VIP', stock_hash: sha256('capcut.pro.user02@daramini.store:CapCut@2026!VIP'), status: 'available', created_at: new Date().toISOString() },
    { id: 's21', product_id: '20000000-0000-0000-0000-000000000006', stock_type: 'account', payload: 'Email: capcut.pro.user03@daramini.store | Pass: CapCut@2026!VIP', stock_hash: sha256('capcut.pro.user03@daramini.store:CapCut@2026!VIP'), status: 'available', created_at: new Date().toISOString() },
    { id: 's22', product_id: '20000000-0000-0000-0000-000000000006', stock_type: 'account', payload: 'Email: capcut.pro.user04@daramini.store | Pass: CapCut@2026!VIP', stock_hash: sha256('capcut.pro.user04@daramini.store:CapCut@2026!VIP'), status: 'available', created_at: new Date().toISOString() },

    // Google Gemini Advanced
    { id: 's23', product_id: '20000000-0000-0000-0000-000000000007', stock_type: 'account', payload: 'Email: gemini.adv.ai01@daramini.store | Pass: Gemini#AI@2026Ultra', stock_hash: sha256('gemini.adv.ai01@daramini.store:Gemini#AI@2026Ultra'), status: 'available', created_at: new Date().toISOString() },
    { id: 's24', product_id: '20000000-0000-0000-0000-000000000007', stock_type: 'account', payload: 'Email: gemini.adv.ai02@daramini.store | Pass: Gemini#AI@2026Ultra', stock_hash: sha256('gemini.adv.ai02@daramini.store:Gemini#AI@2026Ultra'), status: 'available', created_at: new Date().toISOString() },
    { id: 's25', product_id: '20000000-0000-0000-0000-000000000007', stock_type: 'account', payload: 'Email: gemini.adv.ai03@daramini.store | Pass: Gemini#AI@2026Ultra', stock_hash: sha256('gemini.adv.ai03@daramini.store:Gemini#AI@2026Ultra'), status: 'available', created_at: new Date().toISOString() },
    { id: 's26', product_id: '20000000-0000-0000-0000-000000000007', stock_type: 'account', payload: 'Email: gemini.adv.ai04@daramini.store | Pass: Gemini#AI@2026Ultra', stock_hash: sha256('gemini.adv.ai04@daramini.store:Gemini#AI@2026Ultra'), status: 'available', created_at: new Date().toISOString() },
    { id: 's27', product_id: '20000000-0000-0000-0000-000000000007', stock_type: 'account', payload: 'Email: gemini.adv.ai05@daramini.store | Pass: Gemini#AI@2026Ultra', stock_hash: sha256('gemini.adv.ai05@daramini.store:Gemini#AI@2026Ultra'), status: 'available', created_at: new Date().toISOString() },

    // Lovable Pro
    { id: 's28', product_id: '20000000-0000-0000-0000-000000000008', stock_type: 'account', payload: 'Email: lovable.builder01@daramini.store | Pass: Lovable#AI@2026Dev', stock_hash: sha256('lovable.builder01@daramini.store:Lovable#AI@2026Dev'), status: 'available', created_at: new Date().toISOString() },
    { id: 's29', product_id: '20000000-0000-0000-0000-000000000008', stock_type: 'account', payload: 'Email: lovable.builder02@daramini.store | Pass: Lovable#AI@2026Dev', stock_hash: sha256('lovable.builder02@daramini.store:Lovable#AI@2026Dev'), status: 'available', created_at: new Date().toISOString() },
    { id: 's30', product_id: '20000000-0000-0000-0000-000000000008', stock_type: 'account', payload: 'Email: lovable.builder03@daramini.store | Pass: Lovable#AI@2026Dev', stock_hash: sha256('lovable.builder03@daramini.store:Lovable#AI@2026Dev'), status: 'available', created_at: new Date().toISOString() },

    // Roblox Blox Fruits
    { id: 's31', product_id: '20000000-0000-0000-0000-000000000009', stock_type: 'account', payload: 'Roblox Username: DaraWarrior_1763 | Pass: BloxFruits#Dara2026! | Pin: 1024', stock_hash: sha256('DaraWarrior_1763:BloxFruits#Dara2026!:1024'), status: 'available', created_at: new Date().toISOString() }
  ],
  orders: [],
  order_items: [],
  payments: [],
  payment_events: [],
  deliveries: [],
  wallets: [
    {
      id: 'w-admin',
      user_id: '00000000-0000-0000-0000-000000000099',
      balance: 0.00,
      currency: 'USD',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  wallet_transactions: [],
  coupons: [
    {
      id: 'c1',
      code: 'WELCOME10',
      description: 'Welcome 10% Discount on first purchase',
      discount_type: 'percentage',
      discount_value: 10.00,
      minimum_amount: 5.00,
      maximum_discount: 10.00,
      usage_limit: 1000,
      used_count: 0,
      per_user_limit: 1,
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'c2',
      code: 'DARAMINI2',
      description: '$2 off on orders above $15',
      discount_type: 'fixed',
      discount_value: 2.00,
      minimum_amount: 15.00,
      maximum_discount: null,
      usage_limit: 500,
      used_count: 0,
      per_user_limit: 2,
      active: true,
      created_at: new Date().toISOString()
    }
  ],
  coupon_usages: [],
  notifications: [],
  favorites: [],
  admin_logs: [],
  audit_logs: [],
  settings: {
    store_name: { en: 'Dara Digital Store', km: 'តារា ឌីជីថល ស្ត័រ' },
    store_currency: 'USD',
    support_telegram: '@DaraDigital_bot',
    maintenance_mode: false,
    low_stock_threshold: 3,
    min_order_amount: 1.00,
    max_order_amount: 2000.00
  }
};
