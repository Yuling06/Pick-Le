-- Pick-le database schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  gender TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe to re-run: adds the column for databases created before this field existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  chest_cm NUMERIC,
  waist_cm NUMERIC,
  hip_cm NUMERIC,
  shoulder_cm NUMERIC,
  style_preference TEXT,
  avatar_url TEXT,
  avatar_type TEXT,
  body_type_label TEXT,
  profile_status TEXT NOT NULL DEFAULT 'pending',
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  clothing_image_url TEXT,
  size_chart_url TEXT,
  manual_sizes TEXT,
  product_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fit_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  recommended_size TEXT,
  confidence_score NUMERIC,
  visualization_image_url TEXT,
  chest_fit_note TEXT,
  waist_fit_note TEXT,
  shoulder_fit_note TEXT,
  style_suggestion TEXT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  confidence_rating INT,
  sizing_match_rating INT,
  visualization_rating INT,
  would_use_rating INT,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uploaded images are stored directly in Postgres as bytea blobs
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT,
  mimetype TEXT,
  data BYTEA NOT NULL,
  created_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_email ON user_profiles(user_email);
CREATE INDEX IF NOT EXISTS idx_fit_requests_user_email ON fit_requests(user_email);
CREATE INDEX IF NOT EXISTS idx_fit_results_request_id ON fit_results(request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_surveys_request_id ON feedback_surveys(request_id);
