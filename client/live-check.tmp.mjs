import { io } from 'socket.io-client';
const s = io('https://augmented-yut.onrender.com', { transports: ['websocket'] });
setTimeout(() => process.exit(2), 60000);
s.on('connect', () => s.emit('createRoom', { name: '배포 확인' }, (r) => { s.emit('leaveRoom'); setTimeout(() => process.exit(r.ok ? 0 : 1), 300); }));
