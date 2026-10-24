# 증강 윷놀이 효과음 6종

44.1 kHz / 16-bit / Mono WAV. 게임에 바로 사용할 수 있는 합성 원본 효과음입니다. 자연 녹음이나 AI 생성 음원은 아닙니다.

- 01_yut_throw.wav: 윷 던지기 / 나무 조각 충돌
- 02_piece_move.wav: 말 이동
- 03_capture.wav: 말 잡기
- 04_finish.wav: 말 골인
- 05_augment_activate.wav: 증강 발동
- 06_chaos_event.wav: 대혼란 이벤트

권장: client/public/audio/ 에 넣고 /audio/01_yut_throw.wav 형태로 호출. 사운드는 사용자 상호작용 이후에 재생하고, 음소거와 SFX 볼륨을 제공하세요. 증강과 대혼란 이벤트는 소켓 재동기화 시 중복 재생되지 않도록 event ID 기반 중복방지 권장.
