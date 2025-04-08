export class JanusUtil {
  static roomId: number;
  static remoteFeedPlugin: any;
  static pluginHandler: any;

  static setPlugin(plugin: any) {
    JanusUtil.pluginHandler = plugin;
  }

  static setRoomId(roomId: number) {
    JanusUtil.roomId = roomId;
  }

  static startScreenShare() {
    JanusUtil.pluginHandler.createOffer({
      media: {
        video: "screen",
        audioSend: true,
        videoRecv: false,
        videoSend: true,
        replaceVideo: true,
      }, // Screen sharing Publishers are sendonly
      // stream: newstream ,
      success: (jsep: any) => {
        console.log("Got publisher SDP!", jsep);
        var publish = { request: "configure", audio: true, video: true };
        JanusUtil.pluginHandler.send({ message: publish, jsep: jsep });
      },
      error: (error: any) => {
        console.log("WebRTC error:", error);
        console.log("WebRTC error... " + error.message);
      },
    });
  }

static stopScreenShare() {
    JanusUtil.pluginHandler.createOffer({
      media: { videoSend: true, audioSend: true, replaceVideo: true }, // Screen sharing Publishers are sendonly
      success: (jsep: any) => {
        console.log("Got publisher SDP!", jsep);
        var publish = { request: "configure", audio: true, video: true };
        JanusUtil.pluginHandler.send({ message: publish, jsep: jsep });
      },
      error: function (error: any) {
        console.log("WebRTC error:", error);
        console.log("WebRTC error... " + error.message);
      },
    });
  }

static destroyRoom() {
   JanusUtil.pluginHandler.send({
      message: {
        request: 'leave',
        room: JanusUtil.roomId,
      },
      success: (response) => {
      },
      error: () => {
        console.log('Error deleting room')
      }
    })
  }

  static publishOwnFeed() {
    // Publish our stream
    JanusUtil.pluginHandler.createOffer({
        media: {
          audioRecv: false,
          videoRecv: false,
          audioSend: true,
          videoSend: true,
        }, // Publishers are sendonly
        success: (jsep: any) => {
          const publish = {
            request: "configure",
            audio: true,
            video: true,
            record: false,
            bitrate: 102400
          };
          JanusUtil.pluginHandler.send({ message: publish, jsep: jsep });
        },
        error: function (error: any) {
          console.error("WebRTC error:", error);
        },
      });
  }

  static toggleRemoteUserMic(userId: string, mute) {
    JanusUtil.pluginHandler.send({
      message: {
        request: "moderate",
        room: this.roomId,
        id: +userId,
        mid: "0",
        mute
      },
    });
  }

  static toggleRemoteUserCam(userId: string, mute) {
    JanusUtil.pluginHandler.send({
      message: {
        request: "moderate",
        room: this.roomId,
        id: +userId,
        mid: "1",
        mute
      },
    });
  }
}
