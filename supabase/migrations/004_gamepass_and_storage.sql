-- ============================================================================
-- Supabase Schema Migration: 004_gamepass_and_storage.sql
-- Storage Buckets, GamePass & Top-Up Attributes, Image Upload Policies
-- ============================================================================

-- 1. Ensure products table has badge and image_url columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_products_badge ON products(badge);

-- 2. Configure Supabase Storage Bucket for Product and Top-Up Images
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'images',
        'images',
        true,
        10485760, -- 10MB limit
        ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']
    )
    ON CONFLICT (id) DO UPDATE SET
        public = true,
        file_size_limit = 10485760,
        allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'];
EXCEPTION
    WHEN undefined_table THEN
        -- If storage extension is managed externally
        NULL;
END $$;

-- 3. Storage Policies for Public Image Access and Uploads
DO $$
BEGIN
    -- Public read access to images bucket
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Public Access to Images'
    ) THEN
        CREATE POLICY "Public Access to Images"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'images');
    END IF;

    -- Allow authenticated and service uploads to images bucket
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Allow Uploads to Images'
    ) THEN
        CREATE POLICY "Allow Uploads to Images"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'images');
    END IF;

    -- Allow updates to images bucket
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
          AND schemaname = 'storage' 
          AND policyname = 'Allow Updates to Images'
    ) THEN
        CREATE POLICY "Allow Updates to Images"
        ON storage.objects FOR UPDATE
        USING (bucket_id = 'images');
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        NULL;
    WHEN insufficient_privilege THEN
        NULL;
END $$;
