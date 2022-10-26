const frontSocket = io();

const welcome = document.querySelector("#welcome");
const welcomeForm = welcome.querySelector("form");

const room = document.querySelector("#room");

const call = document.querySelector("#call");
const myFace = document.querySelector("#myStream #myFace");
const muteBtn = document.querySelector("#myStream #mute");
const cameraBtn = document.querySelector("#myStream #camera");
const cameraSelect = document.querySelector("#myStream #cameras");

room.hidden = true;
call.hidden = true;

let roomName;
let myStream;
let muted = false;
let cameraOff = false;
let myPeerConnection;
let myDataCh;

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      cameraSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

async function getMedia(deviceId) {
  const initConstraint = {
    audio: true,
    video: { facingMode: "user" },
  };
  const cameraConstraint = {
    audio: true,
    video: { deviceId: deviceId },
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraint : initConstraint
    );
    myFace.srcObject = myStream;
    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

// getMedia();

function handleMuteClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}
function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera On";
    cameraOff = true;
  }
}
async function handleCameraChange() {
  await getMedia(cameraSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
cameraSelect.addEventListener("click", handleCameraChange); // input으로 바꾸기

function addMessage(msg) {
  const msgList = room.querySelector("ul");
  const msgBubble = document.createElement("li");
  msgBubble.innerText = msg;
  msgList.append(msgBubble);
}
function setRoomTitle(roomName, userCount) {
  const roomTitle = room.querySelector("h3");
  roomTitle.innerText = `Room ${roomName} (${userCount})`;
}

function handleMsgSubmit(event) {
  event.preventDefault();
  const msgInput = room.querySelector("#msg input");
  const msgValue = msgInput.value;
  frontSocket.emit("new_msg", msgInput.value, roomName, () => {
    addMessage(`You : ${msgValue}`);
  });
  msgInput.value = "";
}

function showRoom(newCount) {
  welcome.hidden = true;
  room.hidden = false;

  setRoomTitle(roomName, newCount);

  const msgForm = room.querySelector("#msg");
  const nameForm = room.querySelector("#name");
  msgForm.addEventListener("submit", handleMsgSubmit);
  nameForm.addEventListener("submit", handleNameSubmit);
}

function handleIce(data) {
  frontSocket.emit("ice", data.candidate, roomName);
}
function handleAddStream(data) {
  const peerStream = document.querySelector("#peerStream");
  peerStream.srcObject = data.stream;
  // console.log(data);
}
function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });
  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);
  myStream.getTracks().forEach((track) => {
    myPeerConnection.addTrack(track, myStream);
  });
}

async function startMedia() {
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}
async function handleRoomSubmit(event) {
  event.preventDefault();
  const nameInput = welcomeForm.querySelector("#nickname");
  const roomNameInput = welcomeForm.querySelector("#roomName");
  await startMedia();
  frontSocket.emit("enter_room", nameInput.value, roomNameInput.value);
  roomName = roomNameInput.value;
  nameInput.value = "";
  roomNameInput.value = "";
}

welcomeForm.addEventListener("submit", handleRoomSubmit);
frontSocket.on("welcome_msg", async (user, newCount) => {
  myDataCh = myPeerConnection.createDataChannel("chat");
  myDataCh.addEventListener("message", console.log);
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  frontSocket.emit("offer", offer, roomName);
  console.log("send the offer");

  setRoomTitle(roomName, newCount);
  addMessage(`${user} Joined`);
});
frontSocket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataCh = event.channel;
    myDataCh.addEventListener("message", console.log);
  });
  myPeerConnection.setRemoteDescription(offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  frontSocket.emit("answer", answer, roomName);
  console.log("received answer");
});
frontSocket.on("answer", (answer) => {
  myPeerConnection.setRemoteDescription(answer);
});
frontSocket.on("ice", (ice) => {
  myPeerConnection.addIceCandidate(ice);
});

frontSocket.on("bye_msg", (user, newCount) => {
  setRoomTitle(roomName, newCount);
  addMessage(`${user} Left`);
});
frontSocket.on("new_msg", addMessage); // (msg) => {addMessage(msg)} 와 같음
frontSocket.on("room_change", (rooms) => {
  const roomList = welcome.querySelector("ul");
  roomList.innerHTML = "";
  if (rooms.length === 0) {
    return;
  }
  rooms.forEach(({ roomName, userCount }) => {
    const li = document.createElement("li");
    li.innerText = `${roomName} : ${userCount}명 이용 중`;
    roomList.append(li);
  });
});
