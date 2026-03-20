# Railway 배포 가이드 (Phase 1)

이 문서는 edulinker의 Phase 1 결과물(Go 백엔드 코어 시스템)을 [Railway](https://railway.app/) 클라우드 인프라에 배포하는 방법을 안내합니다.

## 1. 사전 준비 (Railway 프로젝트 생성)
1. Railway에 로그인 후 **New Project**를 클릭합니다.
2. **Deploy from GitHub repo**를 선택하여 현재 에듀링커 리포지토리를 연결해 주세요.
   - 이때 리포지토리 전체가 연결되지만, 실제로 배포할 폴더는 `/backend` 입니다.
3. 배포 에러가 나면 당황하지 마시고, 서비스 설정(Settings) 메뉴로 들어가 해당 서비스의 **Root Directory**를 `/backend`로 셋팅합니다. (방금 만든 `Dockerfile`이 동작해야 합니다.)

## 2. 기본 데이터베이스 인프라 추가
Railway 캔버스 우측 상단 `+ New` 버튼에서 **Database**를 추가합니다.
1. **PostgreSQL** 추가 (사용자 정보 및 알림 이력 등 저장)
2. **Redis** 추가 (실시간 웹소켓 Pub/Sub 목적)

## 3. 환경 변수 (Variables) 세팅
백엔드 앱 서버(`edulinker-api` 등의 이름으로 붙여진 서비스) 안의 **Variables** 탭으로 이동하여, `.env`에 있던 필수 설정들을 넣어줍니다.

> **힌트**: Railway에서 생성한 Postgres와 Redis는 **Reference Variables** 버튼을 눌러 자동으로 `DB_HOST`, `DB_PORT`, `REDIS_PASSWORD` 등을 매핑할 수 있습니다.

```ini
# (예시 데이터)
SERVER_HOST=0.0.0.0
SERVER_PORT=5200

# 1) PostgreSQL 환경변수 (Database 탭 연결값 참조)
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_SSLMODE=disable

# 2) Redis 환경변수 (Redis 탭 연결값 참조)
REDIS_HOST=${{Redis.REDIS_HOST}}
REDIS_PORT=${{Redis.REDIS_PORT}}
REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}

# 3) 파일 스토리지 (Wasabi S3 등 외부 버킷 정보)
WASABI_ENDPOINT=s3.ap-northeast-1.wasabisys.com
WASABI_ACCESS_KEY=발급받은키
WASABI_SECRET_KEY=발급받은시크릿키
WASABI_REGION=ap-northeast-1
WASABI_BUCKET=edulinker-bucket

# 4) 보안 인증 키
JWT_SECRET=super_secret_production_key_1234
```

## 4. 커스텀 도메인 및 포트 노출 확인
1. 변수 수정을 완료하면 Railway가 자동으로 다시 빌드를 시작합니다.
2. 빌드 성공 후, 서비스 패널 창에서 🌐 **Networking** 하위 항목을 확인합니다.
3. **Public Networking**란에서 `Generate Domain` 버튼을 클릭하여 외부에서 접속 가능한 임시 HTTPS 링크를 생성합니다. (예: `edulinker-api-production.up.railway.app`)

## 5. 앱 연동
모든 준비가 끝났다면:
- **[교사용 앱]** 의 `teacher-app/app.go` 에 있는 `apiBase: "http://localhost:5200"` 값을 할당받은 `https://edulinker-api-production.up.railway.app` 로 변경해주세요!
- 이후 교사용 앱을 빌드 하시면 외부망 어디서든 작동하는 Phase 1 배포 버전이 완성됩니다.
