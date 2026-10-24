# CLAUDE.md — 증강 윷놀이

초능력(증강) 카드가 있는 온라인 윷놀이. pnpm workspace 모노레포.

## 구조

```text
client/   React + Vite + TypeScript, Tailwind v4, Motion, Zustand → GitHub Pages
server/   Node + Socket.IO + TypeScript (tsx로 실행), pino 로거 → Render
shared/   윷 결과·말 상태·게임 상태·증강 정의·소켓 이벤트 타입, 게임 규칙 (@yut/shared)
```

## 원칙

- **판정은 서버만 한다.** 윷 던지기·이동·잡기·증강 효과는 서버가 계산하고 `state`로 내려준다. 클라이언트는 받은 상태를 그리고 의도(이벤트)만 보낸다.
- 게임 규칙은 순수 함수로 `shared/`에 둔다. 난수는 인자로 주입해서 테스트한다(`throwSticks(random)` 참고).
- 소켓 이벤트는 `shared/src/events.ts`의 타입에 먼저 추가한 뒤 양쪽을 구현한다.
- 규칙·증강을 추가하면 Vitest 테스트를 함께 쓴다.
- `shared`는 빌드하지 않고 TS 소스를 그대로 가져다 쓴다(Vite·tsx가 처리).
- 서버 로그는 `server/src/logger.ts`(pino)를 쓴다. `console.log` 금지.

## 명령 (루트에서)

```bash
pnpm install
pnpm dev          # client(5173) + server(3001) 동시 실행
pnpm test         # 전체 Vitest
pnpm typecheck
pnpm --filter @yut/client build
```

## 환경 변수

- client: `VITE_SERVER_URL` (기본 `http://localhost:3001`). 배포 시 GitHub 저장소 Variables에 설정.
- server: `PORT`, `CLIENT_ORIGIN`(쉼표 구분, CORS 허용 출처), `LOG_LEVEL`.
- 실제 값은 커밋하지 않는다. `.env.example`만 둔다.

## 배포

- 프론트: `main`에 push → `.github/workflows/deploy-pages.yml`이 빌드 후 Pages 배포. 저장소 Settings > Pages > Source를 "GitHub Actions"로 설정. `BASE_PATH`는 `/<저장소 이름>/`로 자동 설정.
- 백엔드(Render Web Service): Root Directory `server`, Build `pnpm install --frozen-lockfile`, Start `pnpm start`, Health check `/health`. `CLIENT_ORIGIN`에 Pages 주소(`https://<user>.github.io`)를 넣는다.

## 용어

윷 결과: `BACKDO`(빽도 -1) `DO`(도 1) `GAE`(개 2) `GEOL`(걸 3) `YUT`(윷 4) `MO`(모 5). 윷·모는 한 번 더 던진다.
