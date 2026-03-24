-- Migration: initial_schema
-- Creates all tables for the EduLinker application.

-- ============================================================
-- 1. schools
-- ============================================================
CREATE TABLE IF NOT EXISTS schools (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(20)  NOT NULL,
    address     VARCHAR(255),
    phone       VARCHAR(20),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_code ON schools (code);

-- ============================================================
-- 2. users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id     UUID         REFERENCES schools(id),
    name          VARCHAR(50)  NOT NULL,
    login_id      VARCHAR(50)  DEFAULT NULL,
    phone         VARCHAR(20),
    email         VARCHAR(100),
    role          VARCHAR(20)  NOT NULL,
    grade         INT          DEFAULT 0,
    class_num     INT          DEFAULT 0,
    number        INT          DEFAULT 0,
    gender        VARCHAR(10)  DEFAULT '',
    department    VARCHAR(50),
    task_name     VARCHAR(50),
    position      VARCHAR(50),
    class_phone   VARCHAR(20),
    password_hash VARCHAR(255),
    pin           VARCHAR(20),
    parent_phone  VARCHAR(20),
    is_active     BOOLEAN      DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_school_id     ON users (school_id);
CREATE INDEX IF NOT EXISTS idx_users_phone         ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_parent_phone  ON users (parent_phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_id ON users (login_id);

-- ============================================================
-- 3. registered_devices
-- ============================================================
CREATE TABLE IF NOT EXISTS registered_devices (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id  VARCHAR(100) NOT NULL,
    school_id  UUID         NOT NULL REFERENCES schools(id),
    name       VARCHAR(100),
    is_active  BOOLEAN      DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registered_devices_device_id ON registered_devices (device_id);
CREATE INDEX IF NOT EXISTS idx_registered_devices_school_id        ON registered_devices (school_id);

-- ============================================================
-- 4. plugins
-- ============================================================
CREATE TABLE IF NOT EXISTS plugins (
    id          VARCHAR(50)  PRIMARY KEY,
    group_code  CHAR(1)      NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    version     VARCHAR(20)  DEFAULT '1.0.0',
    status      VARCHAR(20)  DEFAULT 'active',
    icon        VARCHAR(50),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. school_plugins
-- ============================================================
CREATE TABLE IF NOT EXISTS school_plugins (
    school_id  UUID        NOT NULL REFERENCES schools(id),
    plugin_id  VARCHAR(50) NOT NULL REFERENCES plugins(id),
    enabled    BOOLEAN     DEFAULT false,
    config     JSONB       DEFAULT '{}',
    enabled_at TIMESTAMPTZ,
    PRIMARY KEY (school_id, plugin_id)
);

-- ============================================================
-- 6. plugin_permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS plugin_permissions (
    plugin_id    VARCHAR(50) NOT NULL REFERENCES plugins(id),
    role         VARCHAR(20) NOT NULL,
    access_level VARCHAR(20) DEFAULT 'read',
    PRIMARY KEY (plugin_id, role)
);

-- ============================================================
-- 7. notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID         REFERENCES schools(id),
    user_id    UUID         REFERENCES users(id),
    plugin_id  VARCHAR(50),
    type       VARCHAR(20)  DEFAULT 'info',
    title      VARCHAR(200),
    body       TEXT,
    data       JSONB        DEFAULT '{}',
    is_read    BOOLEAN      DEFAULT false,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_school_id ON notifications (school_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications (user_id);

-- ============================================================
-- 8. file_records
-- ============================================================
CREATE TABLE IF NOT EXISTS file_records (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID         REFERENCES schools(id),
    uploader_id  UUID         REFERENCES users(id),
    plugin_id    VARCHAR(50),
    storage      VARCHAR(20),
    bucket       VARCHAR(100),
    object_key   VARCHAR(500),
    file_name    VARCHAR(255),
    content_type VARCHAR(100),
    size         BIGINT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_file_records_school_id   ON file_records (school_id);
CREATE INDEX IF NOT EXISTS idx_file_records_uploader_id ON file_records (uploader_id);

-- ============================================================
-- 9. gatongs (family correspondence)
-- ============================================================
CREATE TABLE IF NOT EXISTS gatongs (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID         NOT NULL REFERENCES schools(id),
    author_id   UUID         NOT NULL REFERENCES users(id),
    title       VARCHAR(200) NOT NULL,
    content     TEXT         NOT NULL,
    type        VARCHAR(20)  NOT NULL,
    is_required BOOLEAN      DEFAULT false,
    deadline    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gatongs_school_id  ON gatongs (school_id);
CREATE INDEX IF NOT EXISTS idx_gatongs_deleted_at ON gatongs (deleted_at);

-- ============================================================
-- 10. gatong_targets
-- ============================================================
CREATE TABLE IF NOT EXISTS gatong_targets (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    gatong_id      UUID        NOT NULL REFERENCES gatongs(id) ON DELETE CASCADE,
    target_role    VARCHAR(20) NOT NULL,
    target_user_id UUID,
    read_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gatong_targets_gatong_id ON gatong_targets (gatong_id);

-- ============================================================
-- 11. gatong_responses
-- ============================================================
CREATE TABLE IF NOT EXISTS gatong_responses (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    gatong_id     UUID         NOT NULL REFERENCES gatongs(id) ON DELETE CASCADE,
    user_id       UUID         NOT NULL REFERENCES users(id),
    response_data JSONB,
    signature_url VARCHAR(255),
    responded_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gatong_responses_gatong_id ON gatong_responses (gatong_id);

-- ============================================================
-- 12. sendocs (electronic documents)
-- ============================================================
CREATE TABLE IF NOT EXISTS sendocs (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id          UUID         NOT NULL REFERENCES schools(id),
    author_id          UUID         REFERENCES users(id),
    title              VARCHAR(200) NOT NULL,
    content            TEXT         NOT NULL,
    background_url     VARCHAR(500),
    fields_json        JSONB        DEFAULT '[]',
    attachment_file_id UUID,
    requires_signature BOOLEAN      DEFAULT true,
    status             VARCHAR(20)  DEFAULT 'draft',
    deadline           TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sendocs_school_id  ON sendocs (school_id);
CREATE INDEX IF NOT EXISTS idx_sendocs_deleted_at ON sendocs (deleted_at);

-- ============================================================
-- 13. sendoc_recipients
-- ============================================================
CREATE TABLE IF NOT EXISTS sendoc_recipients (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    sendoc_id           UUID    NOT NULL REFERENCES sendocs(id) ON DELETE CASCADE,
    user_id             UUID    NOT NULL REFERENCES users(id),
    read_at             TIMESTAMPTZ,
    is_signed           BOOLEAN DEFAULT false,
    signature_image_url TEXT,
    form_data_json      JSONB   DEFAULT '{}',
    signed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sendoc_recipients_sendoc_id ON sendoc_recipients (sendoc_id);

-- ============================================================
-- 14. teacher_leave_records
-- ============================================================
CREATE TABLE IF NOT EXISTS teacher_leave_records (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID        NOT NULL REFERENCES schools(id),
    teacher_id UUID        NOT NULL REFERENCES users(id),
    leave_type VARCHAR(50) NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date   TIMESTAMPTZ NOT NULL,
    reason     TEXT,
    status     VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_teacher_leave_records_school_id  ON teacher_leave_records (school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_leave_records_deleted_at ON teacher_leave_records (deleted_at);

-- ============================================================
-- 15. student_counselings
-- ============================================================
CREATE TABLE IF NOT EXISTS student_counselings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID        NOT NULL REFERENCES schools(id),
    student_id      UUID        NOT NULL REFERENCES users(id),
    teacher_id      UUID        NOT NULL REFERENCES users(id),
    category        VARCHAR(50) NOT NULL,
    content         TEXT        NOT NULL,
    counseling_date TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_student_counselings_school_id  ON student_counselings (school_id);
CREATE INDEX IF NOT EXISTS idx_student_counselings_deleted_at ON student_counselings (deleted_at);

-- ============================================================
-- 16. student_absences
-- ============================================================
CREATE TABLE IF NOT EXISTS student_absences (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID        NOT NULL REFERENCES schools(id),
    student_id   UUID        NOT NULL REFERENCES users(id),
    absence_date DATE        NOT NULL,
    reason       VARCHAR(255),
    approved     BOOLEAN     DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_absences_school_id ON student_absences (school_id);

-- ============================================================
-- 17. ai_analysis_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_analysis_logs (
    id                UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id         UUID   NOT NULL REFERENCES schools(id),
    teacher_id        UUID   NOT NULL REFERENCES users(id),
    target_student_id UUID,
    prompt_type       VARCHAR(50) NOT NULL,
    input_data        TEXT        NOT NULL,
    generated_content TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_school_id  ON ai_analysis_logs (school_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_deleted_at ON ai_analysis_logs (deleted_at);

-- ============================================================
-- 18. weekly_study_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_study_plans (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID         NOT NULL REFERENCES schools(id),
    teacher_id UUID         NOT NULL REFERENCES users(id),
    week_start DATE         NOT NULL,
    week_end   DATE         NOT NULL,
    title      VARCHAR(255) NOT NULL,
    content    TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_weekly_study_plans_school_id  ON weekly_study_plans (school_id);
CREATE INDEX IF NOT EXISTS idx_weekly_study_plans_deleted_at ON weekly_study_plans (deleted_at);

-- ============================================================
-- 19. evaluation_records
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluation_records (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID          NOT NULL REFERENCES schools(id),
    teacher_id      UUID          NOT NULL REFERENCES users(id),
    student_id      UUID          NOT NULL REFERENCES users(id),
    subject         VARCHAR(100)  NOT NULL,
    evaluation_type VARCHAR(50)   NOT NULL,
    score           NUMERIC(5,2),
    feedback        TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evaluation_records_school_id ON evaluation_records (school_id);

-- ============================================================
-- 20. school_votings
-- ============================================================
CREATE TABLE IF NOT EXISTS school_votings (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID         NOT NULL REFERENCES schools(id),
    author_id  UUID         NOT NULL REFERENCES users(id),
    title      VARCHAR(255) NOT NULL,
    content    TEXT         NOT NULL,
    options    JSONB        NOT NULL,
    ends_at    TIMESTAMPTZ  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_school_votings_school_id  ON school_votings (school_id);
CREATE INDEX IF NOT EXISTS idx_school_votings_deleted_at ON school_votings (deleted_at);

-- ============================================================
-- 21. event_records
-- ============================================================
CREATE TABLE IF NOT EXISTS event_records (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID         NOT NULL REFERENCES schools(id),
    author_id  UUID         NOT NULL REFERENCES users(id),
    title      VARCHAR(255) NOT NULL,
    event_type VARCHAR(50)  DEFAULT 'general',
    media_urls JSONB,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_records_school_id ON event_records (school_id);

-- ============================================================
-- 22. parent_students
-- ============================================================
CREATE TABLE IF NOT EXISTS parent_students (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id  UUID        NOT NULL REFERENCES users(id),
    student_id UUID        NOT NULL REFERENCES users(id),
    school_id  UUID        NOT NULL REFERENCES schools(id),
    status     VARCHAR(20) DEFAULT 'approved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parent_students_parent_id  ON parent_students (parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student_id ON parent_students (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_school_id  ON parent_students (school_id);

-- ============================================================
-- 23. school_document_chunks (RAG)
-- ============================================================
CREATE TABLE IF NOT EXISTS school_document_chunks (
    id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID              NOT NULL REFERENCES schools(id),
    source_type VARCHAR(50),
    source_id   UUID,
    title       VARCHAR(255),
    content     TEXT,
    embedding   DOUBLE PRECISION[],
    metadata    JSONB,
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_document_chunks_school_id   ON school_document_chunks (school_id);
CREATE INDEX IF NOT EXISTS idx_school_document_chunks_source_type ON school_document_chunks (source_type);
CREATE INDEX IF NOT EXISTS idx_school_document_chunks_source_id   ON school_document_chunks (source_id);

-- ============================================================
-- 24. school_ai_chats
-- ============================================================
CREATE TABLE IF NOT EXISTS school_ai_chats (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id  UUID NOT NULL REFERENCES users(id),
    school_id  UUID NOT NULL REFERENCES schools(id),
    question   TEXT NOT NULL,
    answer     TEXT NOT NULL,
    sources    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_ai_chats_parent_id ON school_ai_chats (parent_id);
CREATE INDEX IF NOT EXISTS idx_school_ai_chats_school_id ON school_ai_chats (school_id);

-- ============================================================
-- 25. class_assignment_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS class_assignment_sessions (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID         REFERENCES schools(id),
    title        VARCHAR(255) NOT NULL,
    target_grade INT,
    status       VARCHAR(50)  DEFAULT 'collecting',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_class_assignment_sessions_school_id  ON class_assignment_sessions (school_id);
CREATE INDEX IF NOT EXISTS idx_class_assignment_sessions_deleted_at ON class_assignment_sessions (deleted_at);

-- ============================================================
-- 26. parent_class_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS parent_class_requests (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES class_assignment_sessions(id),
    student_id UUID REFERENCES users(id),
    parent_id  UUID REFERENCES users(id),
    request    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parent_class_requests_session_id ON parent_class_requests (session_id);
CREATE INDEX IF NOT EXISTS idx_parent_class_requests_student_id ON parent_class_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_class_requests_parent_id  ON parent_class_requests (parent_id);

-- ============================================================
-- 27. facilities
-- ============================================================
CREATE TABLE IF NOT EXISTS facilities (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID         REFERENCES schools(id),
    name        VARCHAR(100) NOT NULL,
    location    VARCHAR(255),
    description TEXT,
    is_active   BOOLEAN      DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_facilities_school_id ON facilities (school_id);

-- ============================================================
-- 28. facility_reservations
-- ============================================================
CREATE TABLE IF NOT EXISTS facility_reservations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID        REFERENCES facilities(id),
    teacher_id  UUID        REFERENCES users(id),
    start_time  TIMESTAMPTZ,
    end_time    TIMESTAMPTZ,
    purpose     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facility_reservations_facility_id ON facility_reservations (facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_reservations_teacher_id  ON facility_reservations (teacher_id);

-- ============================================================
-- 29. task_handovers
-- ============================================================
CREATE TABLE IF NOT EXISTS task_handovers (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID         REFERENCES schools(id),
    from_user_id UUID         REFERENCES users(id),
    to_user_id   UUID         REFERENCES users(id),
    task_name    VARCHAR(255),
    content      TEXT,
    files_url    TEXT,
    is_confirmed BOOLEAN      DEFAULT false,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_handovers_school_id ON task_handovers (school_id);

-- ============================================================
-- 30. multi_evaluations
-- ============================================================
CREATE TABLE IF NOT EXISTS multi_evaluations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id         UUID REFERENCES schools(id),
    target_teacher_id UUID REFERENCES users(id),
    evaluator_id      UUID REFERENCES users(id),
    category          TEXT,
    data_json         JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_multi_evaluations_school_id ON multi_evaluations (school_id);

-- ============================================================
-- 31. announcements (plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID         REFERENCES schools(id),
    author_id  UUID         REFERENCES users(id),
    type       VARCHAR(20)  DEFAULT 'simple',
    title      VARCHAR(200) NOT NULL,
    content    TEXT,
    is_urgent  BOOLEAN      DEFAULT false,
    due_date   TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_school_id ON announcements (school_id);

-- ============================================================
-- 32. announcement_reads (plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id UUID        NOT NULL,
    user_id         UUID        NOT NULL,
    is_confirmed    BOOLEAN     DEFAULT false,
    confirmed_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (announcement_id, user_id)
);

-- ============================================================
-- 33. chats (messenger plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID         REFERENCES schools(id),
    type       VARCHAR(20)  DEFAULT 'direct',
    name       VARCHAR(100),
    created_by UUID,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chats_school_id ON chats (school_id);

-- ============================================================
-- 34. chat_members (messenger plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_members (
    chat_id    UUID        NOT NULL,
    user_id    UUID        NOT NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted BOOLEAN     DEFAULT false,
    PRIMARY KEY (chat_id, user_id)
);

-- ============================================================
-- 35. messages (messenger plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id      UUID        REFERENCES chats(id),
    sender_id    UUID,
    content      TEXT        NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    file_id      UUID,
    is_urgent    BOOLEAN     DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id);

-- ============================================================
-- 36. message_read_receipts (messenger plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS message_read_receipts (
    message_id UUID        NOT NULL,
    user_id    UUID        NOT NULL,
    read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

-- ============================================================
-- 37. todos (todo plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id               UUID         REFERENCES schools(id),
    user_id                 UUID         REFERENCES users(id),
    scope                   VARCHAR(20)  DEFAULT 'personal',
    title                   VARCHAR(200) NOT NULL,
    description             TEXT,
    is_completed            BOOLEAN      DEFAULT false,
    due_date                TIMESTAMPTZ,
    linked_announcement_id  UUID,
    priority                INT          DEFAULT 0,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_todos_school_id ON todos (school_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_id   ON todos (user_id);

-- ============================================================
-- 38. alerts (student alert plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID         REFERENCES schools(id),
    teacher_id UUID,
    title      VARCHAR(200) NOT NULL,
    content    TEXT,
    category   VARCHAR(50)  DEFAULT 'general',
    is_active  BOOLEAN      DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_school_id ON alerts (school_id);

-- ============================================================
-- 39. attendance_records (attendance plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_records (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID        REFERENCES schools(id),
    student_id   UUID        REFERENCES users(id),
    reporter_id  UUID,
    teacher_id   UUID,
    type         VARCHAR(20) NOT NULL,
    reason       TEXT,
    date         DATE,
    is_confirmed BOOLEAN     DEFAULT false,
    confirmed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_records_school_id  ON attendance_records (school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON attendance_records (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date       ON attendance_records (date);

-- ============================================================
-- 40. pc_records (pcinfo plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS pc_records (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id   UUID         REFERENCES schools(id),
    user_id     UUID         REFERENCES users(id),
    hostname    VARCHAR(100),
    ip_address  VARCHAR(50),
    mac_address VARCHAR(50),
    os          VARCHAR(100),
    cpu         VARCHAR(200),
    ram         VARCHAR(50),
    disk        VARCHAR(100),
    grade       INT          DEFAULT 0,
    class_num   INT          DEFAULT 0,
    department  VARCHAR(100),
    user_name   VARCHAR(100),
    location    VARCHAR(100),
    label       VARCHAR(100),
    printers    TEXT,
    monitors    TEXT,
    last_seen   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_records_school_id ON pc_records (school_id);
CREATE INDEX IF NOT EXISTS idx_pc_records_user_id   ON pc_records (user_id);

-- ============================================================
-- 41. bookmarks (linker plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookmarks (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id      UUID         REFERENCES schools(id),
    user_id        UUID         REFERENCES users(id),
    title          VARCHAR(100) NOT NULL,
    url            VARCHAR(500) NOT NULL,
    student_url    VARCHAR(500) DEFAULT '',
    icon           VARCHAR(100),
    category       VARCHAR(50)  DEFAULT 'general',
    sort_order     INT          DEFAULT 0,
    is_shared      BOOLEAN      DEFAULT false,
    share_teachers BOOLEAN      DEFAULT false,
    share_class    BOOLEAN      DEFAULT false,
    target_ids     TEXT         DEFAULT '',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_school_id ON bookmarks (school_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id   ON bookmarks (user_id);

-- ============================================================
-- 42. screen_configs (teacher screen plugin)
-- ============================================================
CREATE TABLE IF NOT EXISTS screen_configs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id  UUID        REFERENCES schools(id),
    teacher_id UUID,
    class_name VARCHAR(50),
    services   JSONB       DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_screen_configs_school_id                ON screen_configs (school_id);
CREATE INDEX IF NOT EXISTS idx_screen_configs_teacher_id               ON screen_configs (teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_screen ON screen_configs (teacher_id);
