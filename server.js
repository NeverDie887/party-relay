const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, {"Content-Type":"text/plain; charset=utf-8"});
  res.end("Party Relay is running");
});

const wss = new WebSocket.Server({server});
const rooms = new Map();
const clients = new Map();

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on("connection", ws => {
  let id = null;
  let room = null;

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "hello") {
      id = String(msg.id || "");
      if (!id) return;
      clients.set(id, ws);
      send(ws, {type:"hello_ok"});
      return;
    }

    if (msg.type === "create") {
      room = String(msg.room || "");
      if (!room) return;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      send(ws, {type:"created", room});
      return;
    }

    if (msg.type === "join") {
      room = String(msg.room || "");
      const set = rooms.get(room);
      if (!set) return send(ws, {type:"error", message:"Party not found"});
      set.add(ws);
      for (const peer of set) {
        if (peer !== ws) send(peer, {type:"member_joined", id});
      }
      send(ws, {type:"joined", room});
      return;
    }

    if (msg.type === "invite") {
      const target = clients.get(String(msg.target || ""));
      if (target) send(target, {type:"invite", from:id, room:String(msg.room || "")});
      return;
    }

    if (msg.type === "data") {
      const set = rooms.get(room);
      if (!set) return;
      for (const peer of set) {
        if (peer !== ws) send(peer, {type:"data", from:id, payload:msg.payload});
      }
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    if (room && rooms.has(room)) {
      const set = rooms.get(room);
      set.delete(ws);
      if (!set.size) rooms.delete(room);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Party Relay listening on ${PORT}`);
});
