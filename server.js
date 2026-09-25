const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const app = express();
const server = http.createServer(app);

// ping接口，用来保活防休眠
app.get('/ping', (req, res) => {
  res.send('pong');
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoomId = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      handleMessage(ws, msg);
    } catch (e) {
      console.error("解析消息错误", e);
    }
  });

  ws.on('close', () => {
    if (!currentRoomId || !rooms.has(currentRoomId)) return;
    const room = rooms.get(currentRoomId);
    room.players = room.players.filter(p => p.ws !== ws);
    room.players.forEach(p => {
      p.ws.send(JSON.stringify({ type: "playerLeft" }));
    });
    if (room.players.length === 0) {
      rooms.delete(currentRoomId);
    }
  });

  function handleMessage(ws, msg) {
    switch (msg.type) {
      case "createRoom": {
        const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
        currentRoomId = roomId;
        rooms.set(roomId, {
          players: [{ ws, role: 1, ready: false }],
          started: false
        });
        ws.send(JSON.stringify({ type: "createRoomSuccess", roomId }));
        break;
      }
      case "joinRoom": {
        const roomId = msg.roomId;
        if (!rooms.has(roomId)) {
          ws.send(JSON.stringify({ type: "error", msg: "房间不存在" }));
          return;
        }
        const room = rooms.get(roomId);
        if (room.players.length >= 2) {
          ws.send(JSON.stringify({ type: "error", msg: "房间已满" }));
          return;
        }
        currentRoomId = roomId;
        room.players.push({ ws, role: 2, ready: false });
        room.players[0].ws.send(JSON.stringify({ type: "playerJoined" }));
        ws.send(JSON.stringify({ type: "joinRoomSuccess", roomId }));
        break;
      }
      case "playerReady": {
        const room = rooms.get(currentRoomId);
        const me = room.players.find(p => p.ws === ws);
        me.ready = true;
        const opponent = room.players.find(p => p.ws !== ws);
        opponent.ws.send(JSON.stringify({ type: "playerReady" }));
        if (room.players.every(p => p.ready)) {
          room.started = true;
          room.players.forEach(player => {
            player.ws.send(JSON.stringify({
              type: "gameStart",
              currentPlayer: 1
            }));
          });
        }
        break;
      }
      case "move": {
        const room = rooms.get(currentRoomId);
        const opponent = room.players.find(p => p.ws !== ws);
        opponent.ws.send(JSON.stringify(msg));
        break;
      }
      case "gameOver": {
        const room = rooms.get(currentRoomId);
        const opponent = room.players.find(p => p.ws !== ws);
        opponent.ws.send(JSON.stringify(msg));
        break;
      }
      case "leaveRoom": {
        ws.close();
        break;
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器启动，端口：${PORT}`);
});
