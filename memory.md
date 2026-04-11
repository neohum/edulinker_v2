# 🧠 Project Memory & Checkpoint

## 🎯 현재 작업의 목표와 상태 (Current Goals & Status)
- **목표**: `server-dashboard`의 Wails 런타임 타입(디바이스 바인딩) 컴파일 오류를 해결하고, 프로젝트 전반의 기술적 복잡도를 에이전트 및 팀원과 조율하기 위한 `ACM.md`(에이전트 인지 모델 및 운영 가이드라인) 문서를 구축.
- **상태**: `server-dashboard` 내의 TypeScript 빌드 충돌 해결을 100% 완료하였으며, 에이전트 전용 아키텍처 및 코딩 표준(`ACM.md`) 수립 작업도 요구 사항에 맞게 모두 작성되었습니다. 현재 양측 시스템(`teacher-app`, `server-dashboard`)은 `wails dev`로 안정적으로 실행 중입니다.

## 📂 수정했거나 확인한 파일 (Files Accessed)
- `e:\works\project\edulinker\server-dashboard\wailsjs\go\main\App.d.ts` (바인딩 덮어쓰기 문제점 확인 및 정상 재생성 완료)
- `e:\works\project\edulinker\server-dashboard\frontend\src\App.tsx` (바인딩 호출 로직 검증)
- `e:\works\project\edulinker\teacher-app\app.go` 및 `wails.json` (구조체 명세 확인)
- `e:\works\project\edulinker\server-dashboard\app.go` 및 `main.go` (구조체 명세 확인)
- `e:\works\project\edulinker\ACM.md` (**신규 생성 및 다단계에 걸쳐 내용을 수정/병합함**)

## 🤔 내린 결정과 그 근거 (Decisions & Rationale)
- **결정 1**: `ACM.md` 문서를 프로젝트 루트 디렉토리에 전역 생성하고 구체화.
  - **근거**: Go, React, 하위 네트워크 호환성, 실시간 AI 처리가 결합된 복잡한 서비스인 만큼, AI 에이전트와 코드 작업 시 흔들리지 않는 명백한 규약(Coding Standards)과 페르소나 설정이 필수적이었습니다.
- **결정 2**: 오직 함수형 컴포넌트로만 강제하고, 서버 상태 관리 도구로 `React Query`를 선언.
  - **근거**: 상태 변경 사이클을 일관되게 제어하며 200줄 미만의 단일 책임(SRP) 설계를 통해 복잡한 오프라인/동기화 UI를 가볍게 유지하기 위함입니다.
- **결정 3**: 테스트의 방향을 Testcontainers 기반의 실제 DB 구동 형태로 잡음.
  - **근거**: 단순 모킹을 초월하여 PostgreSQL, Redis, MinIO가 돌아가는 실환경 100% 동일 구조에서 마이그레이션 백워드 호환성을 철저하게 확보해야 하기 때문입니다.

## 🚨 발생한 문제와 해결책 (Issues & Solutions)
- **발생한 문제 (Wails Bindings 오염 및 TS2305 빌드 실패)**: 
  `server-dashboard` 빌드 도중 사용되어야 할 `GetStatus` 등의 필수 Go 인터페이스 메서드가 TypeScript 상에서 없다고 인식되어 `TS2305` 에러가 발생. 디버깅 결과 구동기 내부에서 `teacehr-app`의 구조체(`AIBenchmark`, `ConvertHwp` 등)가 덮어씌워진 교차 오염(Cross-Contamination)이 확인됨.
- **해결책**: 
  터미널을 이용해 `server-dashboard` 루트 디렉토리 내부로 정확히 진입한 후, `wails generate module` 커맨드를 수동으로 독립 실행시켜 해당 프로젝트 소유의 정상 바인딩 파일인 `App.d.ts`를 다시 정확하게 파싱 및 복구함. 이후, 해당 경험을 바탕으로 Wails 관련 바인딩 간섭 방지 지침을 `ACM.md`에 추가하여 근본적인 예방책을 수립함.

## 🔜 다음 단계 또는 남은 작업들 (Next Steps)
- 컴포넌트 리팩터링: 너무 복잡해졌을 가능성이 있는 `SendocPage.tsx` 등 핵심 파일들을 200줄 제한 및 커스텀 훅 규칙에 맞추어 분리.
- 데이터 계층 동기화 구축: 오프라인(로컬 SQLite) 환경과 온라인(PostgreSQL, `sync-server`) 간의 양방향 데이터 싱크 파이프라인 정립.
- 백그라운드 AI 스레드 통합: `teacher-app` 내에서 동작하는 무거운 AI 벤치마킹 및 문장 생성 루틴을 UI 로직 성능 저하 없이 완전한 고루틴(Goroutine)으로 격리.
- 테스트 구축: 제시한 품질 보증 파이프라인(QA)에 따라 유틸리티 함수에 대한 `Vitest` 적용 및 컴포넌트 단위 검증(`React Testing Library`) 시작.
