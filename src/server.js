import http from "http";
import express from "express";
import WebSocket from "ws";
import SocketIo from "socket.io";

const app = express();

app.set("view engine", "pug");
app.set("views", __dirname + "/views");

app.use("/public", express.static(__dirname + "/public"));

app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"));

const handleListen = () => console.log("Listening on http://localhost:3000");
// app.listen(3000, handleListen);

const httpServer = http.createServer(app); // http 서버
const wsServer = SocketIo(httpServer);

// socket.io 사용
function publicRooms() {
  const {
    sockets: {
      adapter: { sids, rooms },
    },
  } = wsServer;
  const publicRooms = [];
  rooms.forEach((_, key) => {
    if (sids.get(key) === undefined) {
      publicRooms.push({
        roomName: key,
        userCount: countRoom(key),
      });
    }
  });
  return publicRooms;
}

function countRoom(roomName) {
  return wsServer.sockets.adapter.rooms.get(roomName)?.size;
}

wsServer.on("connection", (backSocket) => {
  wsServer.sockets.emit("room_change", publicRooms());
  backSocket.on("enter_room", (nickname, roomName) => {
    backSocket["nickname"] = nickname;
    backSocket.join(roomName);
    backSocket
      .to(roomName)
      .emit("welcome_msg", backSocket.nickname, countRoom(roomName)); // 한 socket에
    wsServer.sockets.emit("room_change", publicRooms()); // 모든 socket에
  });
  backSocket.on("offer", (offer, roomName) => {
    backSocket.to(roomName).emit("offer", offer);
  });
  backSocket.on("answer", (answer, roomName) => {
    backSocket.to(roomName).emit("answer", answer);
  });
  backSocket.on("ice", (ice, roomName) => {
    backSocket.to(roomName).emit("ice", ice);
  });
  backSocket.on("disconnecting", () => {
    backSocket.rooms.forEach((room) => {
      backSocket
        .to(room)
        .emit("bye_msg", backSocket.nickname, countRoom(room) - 1);
    });
  });
  backSocket.on("disconnect", () => {
    wsServer.sockets.emit("room_change", publicRooms());
  });
  backSocket.on("new_msg", (msg, room, done) => {
    backSocket.to(room).emit("new_msg", `${backSocket.nickname}: ${msg}`);
    done();
  });
});

// websocket 사용
// const wss = new WebSocket.Server({ httpServer }); // websocket 서버
// const sockets = []; // fake DB

// wss.on("connection", (backSocket) => {
//   sockets.push(backSocket); // 연결된 socket을 넣어줌
//   backSocket["nickname"] = "Anonymous"; // nickname 정하지 않은 socket
//   console.log("Connected to the Browser");

//   backSocket.on("close", () => console.log("Disconnected from the Browser"));

//   backSocket.on("message", (msg) => {
//     const msgObject = JSON.parse(msg);
//     switch (msgObject.type) {
//       case "new_msg":
//         // type이 new_msg 일 때만
//         console.log("got it");
//         sockets.forEach((soc) =>
//           soc.send(`${backSocket.nickname}: ${msgObject.payload}`)
//         ); // 연결된 모든 socket에 msg 보냄
//         break;
//       case "nickname":
//         backSocket["nickname"] = msgObject.payload; // socket에 nickname 저장
//         break;
//     }
//   });
// });

httpServer.listen(3000, handleListen);
