# edulinker

> 플러그인 기반 학교 서비스 플랫폼

Go+Wails · PostgreSQL+Redis · MinIO(교내)+Wasabi S3(웹) · Railway

## Quick Start

### 1. 인프라 시작 (Docker)

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

PostgreSQL(5432), Redis(6379), MinIO(9000/9001) 가 실행됩니다.

### 2. 환경 변수

```bash
cp backend/.env.example backend/.env
```

### 3. API 서버 실행

```bash
cd backend
go run cmd/api-server/main.go
```

서버가 `http://localhost:8080` 에서 시작됩니다.

### 4. Health Check

```bash
curl http://localhost:8080/health
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | ❌ | 서버 상태 확인 |
| POST | `/api/auth/login` | ❌ | JWT 로그인 |
| POST | `/api/auth/refresh` | ❌ | 토큰 갱신 |
| GET | `/api/auth/me` | ✅ | 현재 사용자 정보 |
| GET | `/api/core/plugins` | ✅ | 플러그인 목록 |
| PUT | `/api/core/plugins/:id/toggle` | ✅ Admin | 플러그인 ON/OFF |
| GET | `/api/core/plugins/:id/status` | ✅ | 플러그인 상태 확인 |

## Project Structure

```
edulinker/
├── backend/                    # Go API 서버
│   ├── cmd/api-server/         # 엔트리포인트
│   ├── internal/
│   │   ├── config/             # 환경설정
│   │   ├── core/               # 코어 시스템
│   │   │   ├── auth/           # JWT 인증
│   │   │   ├── handlers/       # API 핸들러
│   │   │   ├── middleware/     # Auth·Role·Plugin 미들웨어
│   │   │   └── registry/      # 플러그인 인터페이스·매니저
│   │   ├── database/           # GORM 모델·마이그레이션
│   │   └── plugins/            # 플러그인 모듈들
│   └── .env.example
├── deploy/
│   └── docker-compose.dev.yml  # PostgreSQL+Redis+MinIO
└── docs/
    └── edulinker_기획서_v5.docx
```

## Tech Stack

- **Backend**: Go 1.24 + Fiber v2
- **Database**: PostgreSQL 16 + Redis 7
- **Auth**: JWT (HS256) + RBAC
- **Storage**: MinIO (local) + Wasabi S3 (cloud)
- **ORM**: GORM
