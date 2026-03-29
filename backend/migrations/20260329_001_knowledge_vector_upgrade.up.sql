-- ============================================================
-- Knowledge Search 3단계 업그레이드 마이그레이션
-- 실행 날짜: 2026-03-29
-- ============================================================

-- 1. knowledge_chunks 신규 컬럼 추가
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS display_text     text,
  ADD COLUMN IF NOT EXISTS heading_context  text;

-- 2. BM25/텍스트 검색 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_kchunks_display_text_gin
  ON knowledge_chunks USING gin(to_tsvector('simple', COALESCE(display_text, '')));

CREATE INDEX IF NOT EXISTS idx_kchunks_heading_gin
  ON knowledge_chunks USING gin(to_tsvector('simple', COALESCE(heading_context, '')));

-- 3. doc_id + chunk_index 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_kchunks_doc_chunk
  ON knowledge_chunks(doc_id, chunk_index);

-- ============================================================
-- pgvector 선택적 활성화 (PostgreSQL에 pgvector 설치 후 실행)
-- Windows: https://github.com/pgvector/pgvector/releases 에서 prebuilt 다운로드
-- 설치 후 아래 주석 해제 및 실행:
-- ============================================================

-- CREATE EXTENSION IF NOT EXISTS vector;
--
-- ALTER TABLE knowledge_chunks
--   ADD COLUMN IF NOT EXISTS embedding_vec vector(768);
--
-- UPDATE knowledge_chunks
--   SET embedding_vec = embedding::text::vector
--   WHERE embedding IS NOT NULL;
--
-- CREATE INDEX IF NOT EXISTS idx_kchunks_embedding_ivfflat
--   ON knowledge_chunks
--   USING ivfflat (embedding_vec vector_cosine_ops)
--   WITH (lists = 100);
--
-- -- 활성화 후 서버 재시작 시 자동으로 pgvector 감지됨 (detectPgVector())
