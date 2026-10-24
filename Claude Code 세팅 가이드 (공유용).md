---
tags:
  - claude-code
  - setup
  - guide
  - share
updated: 2026-10-07
---

# Claude Code 세팅 가이드 (공유용)

> 다른 사람에게 그대로 건네도 되는 버전. 개인 경로·계정·시크릿 값은 넣지 않았다.
> 순서대로 따라 하면 이 볼트 주인과 같은 기본 환경이 된다. 각 단계 끝의 **검증**을 통과한 뒤 다음으로 넘어간다.
> 표기: `{WORKSPACE}` = 작업 루트 폴더, `~/.claude/` = Claude Code 설정 폴더 (Windows는 `C:\Users\{USER}\.claude\`)

---

## 0. 사전 준비

| 항목 | 필요 버전 | 용도 |
|------|----------|------|
| Node.js | 18 이상 (권장 LTS) | Claude Code 설치, playwright MCP |
| Python + `uv` | 3.10 이상 | markitdown·mcp-obsidian MCP |
| Git | 아무 버전 | 플러그인 마켓플레이스 받기 |
| Java | 17 (선택) | PDF 추출 스킬을 쓸 때만 |
| 계정 | Claude Pro/Max 또는 API 키 | 로그인 |

**검증**
```bash
node -v && python3 --version && uv --version && git --version
```

---

## 1. Claude Code 설치·로그인

```bash
npm install -g @anthropic-ai/claude-code
cd {WORKSPACE}
claude            # 첫 실행 시 브라우저 로그인
```

**검증:** `claude --version` 출력 + 세션 안에서 `/status` 실행 시 계정·모델 표시

---

## 2. 전역 설정 (`~/.claude/settings.json`)

세션 안에서 `/config`로 바꾸는 게 가장 안전하다. 직접 편집 시 예시:

```json
{
  "model": "opus",
  "theme": "dark",
  "autoUpdatesChannel": "latest"
}
```

- 모델·effort는 취향. 무거운 설계는 Opus, 정형 작업은 Sonnet.
- `settings.json`은 **머신별 로컬 파일** — git으로 동기화되지 않는다. 새 PC마다 다시 설정.

---

## 3. 전역 CLAUDE.md (`~/.claude/CLAUDE.md`)

모든 프로젝트에 적용되는 "내 규칙". 아래 뼈대를 복사해 자기 것으로 고친다.

```markdown
# Claude 전역 지침

## 언어
- 한국어로 대화한다
- 코드 주석은 영어로 작성한다

## 선호 스타일
- 설명은 간결하게
- 불필요한 추상화 금지 — 필요한 것만 구현
- 들여쓰기: 스페이스 2칸

## 작업 규칙
- 파일 수정 전 반드시 내용 확인
- 새 파일보다 기존 파일 수정 우선
- 커밋은 명시적으로 요청할 때만
- 큰 변경 전에 계획을 먼저 설명
- UTF-8 / LF / No-BOM 유지

## 코드 스타일
- 함수는 작고 단일 책임
- console.log 대신 logger 사용
```

| 파일 | 위치 | git 포함 | 적용 범위 |
|------|------|---------|----------|
| 전역 CLAUDE.md | `~/.claude/CLAUDE.md` | ❌ | 모든 프로젝트 |
| 프로젝트 CLAUDE.md | `<repo>/CLAUDE.md` 또는 `<repo>/.claude/CLAUDE.md` | ✅ | 해당 repo |
| 프로젝트 설정 | `<repo>/.claude/settings.json` | ✅ | 해당 repo |
| 개인 프로젝트 설정 | `<repo>/.claude/settings.local.json` | ❌ (gitignore) | 해당 repo, 나만 |

프로젝트 CLAUDE.md는 repo에서 `/init`으로 초안을 만들 수 있다.

**검증:** 새 세션에서 "지금 적용된 규칙 요약해줘" → 위 내용이 나오면 성공

---

## 4. 플러그인

### 4-1. 마켓플레이스 등록 (세션 안에서)

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin marketplace add JuliusBrussee/caveman
```

### 4-2. 설치

```
/plugin install superpowers@claude-plugins-official
/plugin install frontend-design@claude-plugins-official
/plugin install context7@claude-plugins-official
/plugin install code-simplifier@claude-plugins-official
/plugin install caveman@caveman
```

| 플러그인 | 추천도 | 하는 일 |
|---------|-------|--------|
| superpowers | ⭐ 필수 | 브레인스토밍·계획·TDD·체계적 디버깅·코드리뷰 스킬 묶음. 작업 방식 자체를 잡아줌 |
| context7 | ⭐ 권장 | 라이브러리 최신 공식 문서 조회 (MCP 포함). 첫 사용 시 인증 필요할 수 있음 |
| frontend-design | 프론트 작업 시 | UI 코드가 "AI 티" 안 나게 디자인 품질 향상 |
| code-simplifier | 선택 | 최근 수정 코드 간결화 (`/simplify`) |
| caveman | 선택 | 압축 응답으로 토큰 절약 (`/caveman`, 해제: "stop caveman") |

**검증**
```bash
claude plugin list     # 전부 ✔ enabled
```
세션에서 `/` 입력 → 플러그인 커맨드(예: `/caveman`) 목록에 보이는지 + 하나 실제 호출

---

## 5. MCP 서버

터미널에서 등록 (`--scope user` = 모든 프로젝트 공통):

```bash
# 브라우저 자동화·UI 테스트
claude mcp add --scope user playwright -- npx -y @playwright/mcp@latest

# 파일(Office/HTML 등)·URL → Markdown 변환 (PDF는 6-1 pdf-loader 권장)
uv tool install 'markitdown-mcp'
claude mcp add --scope user markitdown -- markitdown-mcp

# Obsidian 볼트 읽기·쓰기 (선택)
claude mcp add --scope user mcp-obsidian \
  -e OBSIDIAN_API_KEY=<발급받은 키> -- uvx mcp-obsidian
```

**mcp-obsidian 사전 조건**
1. Obsidian 커뮤니티 플러그인 **Local REST API** 설치·활성
2. 그 플러그인 설정 화면에서 API 키 복사 → `OBSIDIAN_API_KEY`
3. 사용할 때 Obsidian 앱이 **켜져 있어야** 함

**검증**
```bash
claude mcp list        # 각 서버 ✔ Connected
```
등록돼도 툴이 안 붙는 경우가 있다 — 세션에서 `/mcp`로 툴 목록 노출까지 확인.

> 시크릿(API 키·토큰)은 노트·채팅·git에 값으로 남기지 않는다. 채팅에 붙여넣었다면 재발급.

---

## 6. 개인 스킬 (선택)

스킬 = `~/.claude/skills/<이름>/SKILL.md` 폴더 하나. 받은 스킬 폴더를 그 위치에 복사하면 끝.

```
~/.claude/skills/
└── my-skill/
    └── SKILL.md      # frontmatter의 name·description이 트리거 기준
```

```markdown
---
name: my-skill
description: 언제 이 스킬을 써야 하는지 한두 문장 (Claude가 이걸 보고 자동 호출)
---

# my-skill
절차·규칙 본문
```

- description이 곧 트리거 — "무엇을 하는지"보다 "**언제** 쓰는지"를 구체적으로.
- 새로 만들 땐 `skill-creator` 스킬에게 맡기면 형식이 맞게 나온다.

**검증:** 새 세션에서 스킬 목록에 이름이 보이고, `/my-skill` 또는 트리거 문장으로 실제 호출

### 6-1. 추천 스킬: pdf-loader (PDF 추출)

한컴 오픈소스 `opendataloader-pdf`로 PDF의 텍스트·표·이미지를 Markdown/JSON으로 뽑는다. 다단 컬럼·한글 보고서·표가 핵심인 PDF에서 markitdown보다 정확하다. PDF는 이 스킬, Office·HTML·URL은 markitdown MCP로 나눠 쓴다.

**사전 조건:** Java 17 이상, Python 3.10 이상

```bash
# Java 17
brew install openjdk@17                  # mac (PATH에 추가 안내가 나오면 따른다)
winget install Microsoft.OpenJDK.17      # Windows

# 추출 엔진
pip install opendataloader-pdf
```

**스킬 등록:** `~/.claude/skills/pdf-loader/SKILL.md`에 아래 내용을 그대로 저장

~~~markdown
---
name: pdf-loader
description: Extract text, tables, images and structure from PDF files with opendataloader-pdf (Hancom open source, Java 17). Use when the user gives a .pdf path or asks to parse/extract/convert a PDF to markdown — especially Korean reports, papers, multi-column layouts, or PDFs whose tables are the key data. Prefer this over the markitdown MCP for PDFs.
---

# pdf-loader

opendataloader-pdf 기반 PDF 추출. Java 17 + `pip install opendataloader-pdf` 필요.

## When to use

| 상황 | 도구 |
|---|---|
| 단일 컬럼, 표 없음 / 단순 표 1개 | 내장 `Read` (의존성 0, 품질 동급) |
| 2단 이상 다단 컬럼 | 이 스킬 (`Read`는 좌우 컬럼을 줄 단위로 섞음) |
| 표가 핵심 데이터 / 페이지 경계 표 | 이 스킬 |
| 한글 보고서·논문 | 이 스킬 |
| 이미지 추출, 타입드 구조(JSON) 필요 | 이 스킬 |

## Run

출력은 스크래치패드 디렉토리에 둔다 (사용자가 위치를 지정하면 그곳).

```bash
java -version 2>&1 | head -1   # must be 17+
opendataloader-pdf <input.pdf> --output <out_dir> --format markdown
```

결과: `<out_dir>/<name>.md` (+ `<name>_images/`). 생성 후 `Read`로 읽어 요청에 맞게 가공한다.

## Options

```text
--format markdown|json|html|text   (복수 지정 시 --format 반복: --format markdown --format json)
--to-stdout                         stdout 출력
--pages 1-5                         페이지 범위
--include-header-footer             머리말/꼬리말 포함
--image-dir / --image-format        이미지 추출 제어
--threads N                         병렬 처리
```

## Known limits

- 페이지 경계 표는 헤더만 있는 중복 조각을 하나 더 만든다 — 빈 표는 버린다
- 10열 이상 표는 열이 `<br><br>`로 병합된다 — `--format json`의 `table` 노드를 읽는다
- 표는 문서 끝으로 이동한다. 표와 주변 서술 연결이 중요하면 `Read` 결과와 함께 본다
- JVM 콜드스타트 ~1-2초
- 스캔 PDF(텍스트 레이어 없음)는 `--hybrid` OCR 옵션 필요

## Troubleshooting

- `UnsupportedClassVersionError` — PATH의 `java`가 17 미만. `JAVA_HOME`을 JDK 17로 맞추거나 JAR 직접 실행:

```bash
JAR=$(python3 -c "import importlib.resources as r; print(r.files('opendataloader_pdf').joinpath('jar','opendataloader-pdf-cli.jar'))")
"$JAVA_HOME/bin/java" -Djava.awt.headless=true -jar "$JAR" <input.pdf> --output <out_dir> --format markdown
```
~~~

**검증**
```bash
java -version 2>&1 | head -1                                   # 17 이상
opendataloader-pdf sample.pdf --output out --format markdown   # out/sample.md 생성
```
새 세션에서 "이 PDF 마크다운으로 변환해줘 (경로)" 요청 시 pdf-loader 스킬이 호출되는지 확인.

---

## 7. 훅 (선택, 고급)

특정 이벤트(세션 시작, 툴 실행 전후 등)에 스크립트를 자동 실행. `settings.json`의 `hooks`에 등록한다.
처음엔 생략 추천. 필요해지면 세션에서 "세션 시작할 때 X 하게 해줘"라고 요청하면 `update-config` 스킬이 설정해준다.

---

## 8. 자주 쓰는 명령

| 명령 | 용도 |
|------|------|
| `/init` | 현재 repo용 CLAUDE.md 초안 생성 |
| `/config` | 모델·테마 등 설정 |
| `/mcp` | MCP 연결·툴 확인 |
| `/plugin` | 플러그인 관리 |
| `/memory` | 메모리·CLAUDE.md 편집 |
| `/clear` | 컨텍스트 초기화 (주제 바뀔 때) |
| `/compact` | 대화 요약해서 컨텍스트 확보 |
| `Shift+Tab` | 권한 모드 전환 (plan / auto-accept) |
| `! <명령>` | 세션 안에서 셸 명령 직접 실행 |

---

## 9. 최종 체크리스트

- [ ] `claude --version` / `/status` 정상
- [ ] 전역 CLAUDE.md 적용 확인
- [ ] `claude plugin list` 전부 enabled
- [ ] `claude mcp list` 전부 Connected + `/mcp`에 툴 노출
- [ ] (선택) 개인 스킬 호출 확인
- [ ] 시크릿은 머신 로컬에만 저장

---

## 관련 문서 (볼트 내부용)

- [[Claude Code 기초 세팅]] — 볼트 주인의 현재 환경 스냅샷 (SSOT)
- [[Claude Code 노트 작성 규칙]] — 이식성 규칙·새 머신 세팅 절차
- [[CLAUDE.md 설정 가이드]] — CLAUDE.md·settings.json 위치별 구조
