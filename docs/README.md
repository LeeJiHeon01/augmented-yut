# docs 안내

마지막 정리: 2026-10-24

## 지금 보는 문서

| 파일 | 내용 | 갱신 |
|---|---|---|
| `progress.md` | **진행 현황 (가장 먼저 볼 것)**: 현재 구현 상태, 사용자 확정 사항, 다음 작업, 변경 이력 | 작업할 때마다 |
| `augment_review.md` | 증강 108개 원문 대비 구현 검토표, 사용자 결정 내역, 테스트 커버리지, 대혼란 E1~E8 현황 | 증강 규칙 바뀔 때 |
| `e2_alliance_options.md` | E2 임시 동맹·팀 증강(C-G1·C-P2) 인원별 규칙 선택지 기록 — 전부 A안 확정·구현 | 완료 |

## spec/ — 기준 명세 (현재 유효)

| 파일 | 내용 |
|---|---|
| `spec/augmented_yutnori_claude_spec_v3.md` | 게임 명세 v3 (v2 대체). 사용자 확정 사항(`progress.md` 2장)이 이 문서보다 우선 |
| `spec/augmented_yutnori_augments_108_only.md` | 증강 108개 목록(이름·설명·등급·종류). `shared/src/augment.ts` 데이터 원본 |

## audio/ — 사운드 팩 설명

| 파일 | 내용 |
|---|---|
| `audio/bgm_README.md` | 배경음악 5종 설명 (음원은 `client/public/audio/bgm/`) |
| `audio/sfx_README.md` | 효과음 6종 설명 (음원은 `client/public/audio/sfx/`) |

## instructions/ — GPT 작업 지시서 (받은 순서)

| 파일 | 요약 | 처리 |
|---|---|---|
| `instructions/01_yutnori_next_steps_claude_v4.md` | 후보 비공개, 증강 1차, 대혼란, 재접속, 결과 화면 | 완료 |
| `instructions/02_yutnori_claude_review_next_v5.md` | 1차 증강·E5/E6 검토, 2~4인 완주 테스트 | 완료 |
| `instructions/03_yutnori_progress3_review_claude.md` | 106개 검토표, 충돌 테스트, E1~E8 | 완료 |
| `instructions/04_yutnori_progress4_review_claude.md` | 결정 8개, 확률 테스트, 문서 최신화 | 완료 |
| `instructions/05_yutnori_progress5_review_claude.md` | 문서 정합성, 팀 이벤트·팀 증강 추천안, 매 라운드 선택 충돌 테스트 | 완료 |

새 지시서는 `instructions/06_...md`처럼 번호를 이어 붙인다.

## archive/ — 지난 문서 (참고용, 더 이상 기준 아님)

| 파일 | 이유 |
|---|---|
| `archive/augmented_yutnori_claude_spec_v2.md` | v3로 대체됨 |
| `archive/2026-10-24-core-yut-rules-plan.md` | 기본 윷 규칙 엔진 구현 계획 — 구현 완료 |

## 디자인 (`design/`)

| 폴더 | 내용 |
|---|---|
| `design/update_design/` | **현재 기준 PNG** (게임 화면·말 이동 완료·시간 초과·대혼란 등장·증강 선택·결과) |
| `design/archive/` | 처음 Figma에서 받은 화면 9장 (메인·대기실·코드 입장 등은 이 디자인으로 구현됨, 게임·증강 선택·결과는 update_design으로 대체) |
