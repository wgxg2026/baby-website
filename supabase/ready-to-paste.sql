-- 情侣时光网站：Supabase 一键迁移脚本
-- 生成日期：2026-09-28
-- 用法：Supabase Dashboard -> SQL Editor -> New query -> 粘贴全部内容 -> Run
-- 安全说明：不删除旧表；执行前会保留 shared_app_state_backup 备份。

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 兼容旧版本：如果旧共享表不存在，先创建它，保证后续迁移可以安全执行。
CREATE TABLE IF NOT EXISTS public.shared_app_state (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_app_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public shared state read" ON public.shared_app_state;
DROP POLICY IF EXISTS "public shared state write" ON public.shared_app_state;
CREATE POLICY "public shared state read" ON public.shared_app_state
  FOR SELECT TO anon USING (true);
CREATE POLICY "public shared state write" ON public.shared_app_state
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 旧数据备份：重复执行时更新同 id 的备份，不会删除原表。
CREATE TABLE IF NOT EXISTS public.shared_app_state_backup
(LIKE public.shared_app_state INCLUDING ALL);
INSERT INTO public.shared_app_state_backup (id, data, updated_at)
SELECT id, data, updated_at FROM public.shared_app_state
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;

-- 如果旧版本只有 default 一行，把其中的模块拆成旧模块行，供后续迁移读取。
DO $$
DECLARE
  legacy jsonb;
BEGIN
  SELECT data INTO legacy FROM public.shared_app_state WHERE id = 'default';
  IF legacy IS NOT NULL THEN
    INSERT INTO public.shared_app_state (id, data)
    SELECT 'settings', jsonb_build_object('startDate', COALESCE(legacy->'startDate', '""'::jsonb))
    WHERE legacy ? 'startDate'
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.shared_app_state (id, data)
    SELECT key, value
    FROM jsonb_each(legacy)
    WHERE key IN ('bucketItems','periodRecords','messages','locations','travelCheckins',
                  'musicItems','mediaItems','foodPlaces','savingGoals','achievements',
                  'moments','comments','anniversaries')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Storage：保留公开读取方式，照片上传由 Netlify Function 校验后执行。
INSERT INTO storage.buckets (id, name, public)
VALUES ('moments', 'moments', true)
ON CONFLICT (id) DO UPDATE SET public = true;
DROP POLICY IF EXISTS "public moments read" ON storage.objects;
DROP POLICY IF EXISTS "public moments upload" ON storage.objects;
DROP POLICY IF EXISTS "public moments delete" ON storage.objects;
CREATE POLICY "public moments read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'moments');
CREATE POLICY "public moments upload" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'moments');
CREATE POLICY "public moments delete" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'moments');

-- ==================== 新同步架构表、函数和数据迁移 ====================

-- ============================================
CREATE TABLE IF NOT EXISTS operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  module text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('upsert', 'delete', 'add_reply', 'delete_reply', 'set_setting')),
  record_id text NOT NULL,
  payload jsonb,
  base_version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied boolean DEFAULT false,
  applied_at timestamptz
);

-- 索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_applied ON operations(applied) WHERE NOT applied;
CREATE INDEX IF NOT EXISTS idx_operations_module ON operations(module, created_at DESC);

-- 行级安全策略：允许匿名访问（与现有设计一致）
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous read" ON operations;
CREATE POLICY "Allow anonymous read" ON operations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anonymous insert" ON operations;
CREATE POLICY "Allow anonymous insert" ON operations
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous update" ON operations;
CREATE POLICY "Allow anonymous update" ON operations
  FOR UPDATE USING (true);

COMMENT ON TABLE operations IS '用户操作日志，记录每次修改以支持实时同步和冲突合并';
COMMENT ON COLUMN operations.client_id IS '客户端唯一标识（浏览器级别）';
COMMENT ON COLUMN operations.base_version IS '操作基于的数据版本号';
COMMENT ON COLUMN operations.applied IS '是否已合并到主数据表';

-- ============================================
-- 2. 主数据表（简化版）
-- ============================================
CREATE TABLE IF NOT EXISTS app_state_v2 (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 行级安全策略
ALTER TABLE app_state_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous access" ON app_state_v2;
CREATE POLICY "Allow anonymous access" ON app_state_v2
  FOR ALL USING (true);

COMMENT ON TABLE app_state_v2 IS '单一数据源，存储完整应用状态';
COMMENT ON COLUMN app_state_v2.version IS '数据版本号，每次更新自增';

-- 初始化默认行
INSERT INTO app_state_v2 (id, data, version)
VALUES ('default', '{
  "startDate": "",
  "bucketItems": [],
  "periodRecords": [],
  "messages": [],
  "locations": [],
  "travelCheckins": [],
  "musicItems": [],
  "mediaItems": [],
  "foodPlaces": [],
  "savingGoals": [],
  "achievements": [],
  "moments": [],
  "comments": [],
  "anniversaries": []
}'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. 照片上传令牌表
-- ============================================
CREATE TABLE IF NOT EXISTS upload_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'moment_photo',
  max_file_size_mb integer NOT NULL DEFAULT 10,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used boolean DEFAULT false,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_upload_tokens_expires ON upload_tokens(expires_at) WHERE NOT used;
CREATE INDEX IF NOT EXISTS idx_upload_tokens_client ON upload_tokens(client_id, created_at DESC);

-- 行级安全策略
ALTER TABLE upload_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous read" ON upload_tokens;
CREATE POLICY "Allow anonymous read" ON upload_tokens
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anonymous insert" ON upload_tokens;
CREATE POLICY "Allow anonymous insert" ON upload_tokens
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow token owner update" ON upload_tokens;
CREATE POLICY "Allow token owner update" ON upload_tokens
  FOR UPDATE USING (true);

COMMENT ON TABLE upload_tokens IS '照片上传临时令牌，用于直连 Storage 的鉴权';

-- 自动清理过期令牌函数
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM upload_tokens
  WHERE expires_at < now() - interval '1 hour';
END;
$$;

COMMENT ON FUNCTION cleanup_expired_tokens IS '清理过期的上传令牌（保留1小时用于日志审计）';

-- ============================================
-- 4. 操作合并函数（后台定时执行）
-- ============================================
CREATE OR REPLACE FUNCTION apply_pending_operations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_state jsonb;
  current_version bigint;
  op record;
  module_data jsonb;
  records jsonb;
  record_exists boolean;
  message_data jsonb;
  replies jsonb;
BEGIN
  -- 锁定主数据表，避免并发冲突
  SELECT data, version INTO current_state, current_version
  FROM app_state_v2
  WHERE id = 'default'
  FOR UPDATE;

  -- 按时间顺序处理未应用的操作
  FOR op IN
    SELECT * FROM operations
    WHERE NOT applied
    ORDER BY created_at ASC
    LIMIT 100
  LOOP
    -- 根据操作类型处理
    IF op.operation_type = 'set_setting' THEN
      -- 设置配置项
      current_state := jsonb_set(current_state, ARRAY['startDate'], to_jsonb(op.payload));

    ELSIF op.operation_type = 'upsert' THEN
      -- 插入或更新记录
      module_data := current_state->op.module;
      IF module_data IS NULL THEN
        module_data := '[]'::jsonb;
      END IF;

      records := module_data;
      record_exists := false;

      -- 检查记录是否存在
      FOR i IN 0..jsonb_array_length(records)-1 LOOP
        IF records->i->>'id' = op.record_id THEN
          records := jsonb_set(records, ARRAY[i::text], op.payload);
          record_exists := true;
          EXIT;
        END IF;
      END LOOP;

      -- 不存在则插入到数组开头
      IF NOT record_exists THEN
        records := op.payload || records;
      END IF;

      current_state := jsonb_set(current_state, ARRAY[op.module], records);

    ELSIF op.operation_type = 'delete' THEN
      -- 删除记录
      module_data := current_state->op.module;
      IF module_data IS NOT NULL THEN
        records := '[]'::jsonb;
        FOR i IN 0..jsonb_array_length(module_data)-1 LOOP
          IF module_data->i->>'id' != op.record_id THEN
            records := records || (module_data->i);
          END IF;
        END LOOP;
        current_state := jsonb_set(current_state, ARRAY[op.module], records);
      END IF;

    ELSIF op.operation_type = 'add_reply' THEN
      -- 添加消息回复
      module_data := current_state->'messages';
      IF module_data IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(module_data)-1 LOOP
          IF module_data->i->>'id' = op.record_id THEN
            message_data := module_data->i;
            replies := COALESCE(message_data->'replies', '[]'::jsonb);

            -- 去重：检查回复是否已存在
            record_exists := false;
            FOR j IN 0..jsonb_array_length(replies)-1 LOOP
              IF replies->j->>'id' = op.payload->>'id' THEN
                record_exists := true;
                EXIT;
              END IF;
            END LOOP;

            IF NOT record_exists THEN
              replies := replies || op.payload;
              message_data := jsonb_set(message_data, ARRAY['replies'], replies);
              message_data := jsonb_set(message_data, ARRAY['status'], '"replied"');
              module_data := jsonb_set(module_data, ARRAY[i::text], message_data);
              current_state := jsonb_set(current_state, ARRAY['messages'], module_data);
            END IF;
            EXIT;
          END IF;
        END LOOP;
      END IF;

    ELSIF op.operation_type = 'delete_reply' THEN
      -- 删除消息回复
      module_data := current_state->'messages';
      IF module_data IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(module_data)-1 LOOP
          IF module_data->i->>'id' = op.record_id THEN
            message_data := module_data->i;
            replies := COALESCE(message_data->'replies', '[]'::jsonb);

            -- 过滤掉指定回复
            records := '[]'::jsonb;
            FOR j IN 0..jsonb_array_length(replies)-1 LOOP
              IF replies->j->>'id' != op.payload::text THEN
                records := records || (replies->j);
              END IF;
            END LOOP;

            message_data := jsonb_set(message_data, ARRAY['replies'], records);
            module_data := jsonb_set(module_data, ARRAY[i::text], message_data);
            current_state := jsonb_set(current_state, ARRAY['messages'], module_data);
            EXIT;
          END IF;
        END LOOP;
      END IF;

    END IF;

    -- 标记操作已应用
    UPDATE operations
    SET applied = true, applied_at = now()
    WHERE id = op.id;
  END LOOP;

  -- 更新主数据表
  UPDATE app_state_v2
  SET data = current_state,
      version = current_version + 1,
      updated_at = now()
  WHERE id = 'default';
END;
$$;

COMMENT ON FUNCTION apply_pending_operations IS '将待处理操作合并到主数据表（后台定时任务调用）';

-- ============================================
-- 5. 数据迁移：从旧表导入数据
-- ============================================
DO $$
DECLARE
  legacy_row record;
  merged_data jsonb := '{}'::jsonb;
  module_name text;
BEGIN
  -- 检查旧表是否存在
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'shared_app_state') THEN

    -- 读取所有模块数据
    FOR legacy_row IN
      SELECT id, data FROM shared_app_state
      WHERE id IN ('settings', 'bucketItems', 'periodRecords', 'messages', 'locations',
                   'travelCheckins', 'musicItems', 'mediaItems', 'foodPlaces',
                   'savingGoals', 'achievements', 'moments', 'comments', 'anniversaries')
    LOOP
      IF legacy_row.id = 'settings' THEN
        merged_data := jsonb_set(merged_data, ARRAY['startDate'],
                                 COALESCE(legacy_row.data->'startDate', '""'::jsonb));
      ELSE
        merged_data := jsonb_set(merged_data, ARRAY[legacy_row.id],
                                 COALESCE(legacy_row.data, '[]'::jsonb));
      END IF;
    END LOOP;

    -- 更新新表（仅在有数据时）
    IF merged_data != '{}'::jsonb THEN
      UPDATE app_state_v2
      SET data = merged_data,
          version = 1,
          updated_at = now()
      WHERE id = 'default';

      RAISE NOTICE '已从 shared_app_state 迁移数据到 app_state_v2';
    END IF;
  END IF;
END;
$$;

-- ============================================
-- 6. 实时通知触发器
-- ============================================
CREATE OR REPLACE FUNCTION notify_operation_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 通过 pg_notify 发送实时通知
  PERFORM pg_notify('operations_channel', json_build_object(
    'operation', 'INSERT',
    'record', row_to_json(NEW)
  )::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_operation ON operations;
CREATE TRIGGER trigger_notify_operation
  AFTER INSERT ON operations
  FOR EACH ROW
  EXECUTE FUNCTION notify_operation_insert();

COMMENT ON FUNCTION notify_operation_insert IS '新操作插入时通知所有订阅客户端';

-- ============================================
-- 7. 定期维护任务（需要 pg_cron 扩展）
-- ============================================
-- 注意：以下代码需要启用 pg_cron 扩展才能生效
-- 在 Supabase Dashboard 中启用：Database → Extensions → pg_cron

-- 每10秒合并一次操作到主表
-- SELECT cron.schedule('apply-operations', '*/10 * * * * *', 'SELECT apply_pending_operations()');

-- 每小时清理一次过期令牌
-- SELECT cron.schedule('cleanup-tokens', '0 * * * *', 'SELECT cleanup_expired_tokens()');

-- 每天归档7天前的已应用操作
-- SELECT cron.schedule('archive-operations', '0 2 * * *', $$
--   INSERT INTO operations_archive SELECT * FROM operations WHERE applied AND applied_at < now() - interval '7 days';
--   DELETE FROM operations WHERE applied AND applied_at < now() - interval '7 days';
-- $$);

-- ============================================
-- 完成
-- ============================================
-- 迁移完成后的验证步骤：
-- 1. SELECT * FROM app_state_v2; -- 检查数据是否正确
-- 2. SELECT * FROM operations LIMIT 10; -- 确认表创建成功
-- 3. SELECT * FROM upload_tokens LIMIT 10; -- 确认表创建成功
-- 4. 测试插入操作并调用 apply_pending_operations()

-- 确保新操作表进入 Supabase Realtime publication。
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operations;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state_v2;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_app_state;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

COMMIT;

-- ==================== 执行后的验证 ====================
SELECT 'shared_app_state_backup' AS check_name, COUNT(*) AS row_count FROM public.shared_app_state_backup;
SELECT 'app_state_v2' AS check_name, id, version, jsonb_object_keys(data) AS data_key
FROM public.app_state_v2 WHERE id = 'default';
SELECT 'operations' AS check_name, COUNT(*) AS row_count FROM public.operations;
SELECT 'upload_tokens' AS check_name, COUNT(*) AS row_count FROM public.upload_tokens;
SELECT 'moments_bucket' AS check_name, id, name, public FROM storage.buckets WHERE id = 'moments';
