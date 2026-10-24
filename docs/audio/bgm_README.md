# 증강 윷놀이 BGM 패키지

직접 합성해 만든 게임용 음원입니다. 실제 가야금·장구 연주는 아니며 가야금풍 현악 플럭과 타악기, 신스 음색을 합성했습니다. WAV (22,050Hz, mono, 16-bit).

- 01_main_lobby_gugak_loop.wav: 메인/대기실, 국악풍 경쾌한 반복 BGM
- 02_game_gugak_electro_loop.wav: 게임 중, 국악풍 플럭+전자 리듬 반복 BGM
- 03_augment_selection_mystic_loop.wav: 증강 선택 시 신비로운 반복 BGM
- 04_chaos_event_sting.wav: 대혼란 발생 시 단발 연출음
- 05_victory_fanfare.wav: 승리 시 단발 팡파르
- 06_defeat_fanfare.mp3: 패배 시 단발 음악 (2026-10-24 사용자 추가, 패자에게만 재생)

## 게임 적용
client/public/audio/ 아래에 배치 후 /audio/<파일명> 경로로 재생하세요. 01~03은 loop=true, 04~05는 loop=false. 브라우저 자동 재생 제한 때문에 최초 사용자 클릭 이후 AudioContext/HTMLAudioElement를 재생하세요. 화면 전환 시 BGM만 크로스페이드하고, 대혼란 시 현재 BGM을 잠깐 줄였다가 복원하는 것을 권장합니다. 파일 경계를 짧게 페이드 처리했으므로 엄밀한 무음 없는 루프는 아닙니다. 음량/음소거 UI는 사용자의 기존 디자인 결정에 따르세요.
