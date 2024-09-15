import { Server } from "socket.io";
import http from "http";
import { handleServerEvent } from "@homecloud/js-core/serverEvent";
import cookie from "cookie";
import { verifyJwt } from "@homecloud/js-core/utils/profileUtils";

function profileIdToRoom(profileId: number) {
  return `profile-${profileId}`;
}

export function initSEPublisher(httpServer: http.Server) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    const cookieString = socket.handshake.headers.cookie;
    let profileId: number | null = null;
    if (cookieString) {
      const cookies = cookie.parse(cookieString);
      profileId = verifyJwt(cookies.jwt);
    }
    if (!profileId) {
      console.log("SocketIO: User not authenticated");
      socket.disconnect();
      return;
    }

    socket.join(profileIdToRoom(profileId));

    console.log(`Profile #${profileId} connected.`);
    socket.on("disconnect", () => {
      console.log(`Profile #${profileId} disconnected.`);
    });
  });

  handleServerEvent(async (event) => {
    const profileId = event.profileId;
    const room = profileIdToRoom(profileId);
    // console.log("Publishing server event:", event.type, "to room:", room);
    io.to(room).emit(event.type, event.data);
  });
}
