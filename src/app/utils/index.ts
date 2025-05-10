import Janus from "janus-gateway";

export class JanusUtil {
  static roomId: number;
  static remoteFeedPlugin: any;
  static pluginHandler: any;
  static screenSources = [];
  static janusRef: Janus;

  static screenName = '***SCREEN***' + Janus.randomString(5);
  static screenSharePlugin: any;

  static setPlugin(plugin: any) {
    JanusUtil.pluginHandler = plugin;
  }

  static setJanusInstance(janus: Janus) {
    JanusUtil.janusRef = janus;
  }

  static setRoomId(roomId: number) {
    JanusUtil.roomId = roomId;
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

  static publishOwnFeed(stream?: MediaStream) {
    const vid = stream && {video: stream.getVideoTracks()[0]} || {}
    // Publish our stream
    JanusUtil.pluginHandler.createOffer({
      media: {
        audioRecv: true, // We're sending, not receiving
        videoRecv: true,
        audioSend: true,
        videoSend: true,
        ...vid
      },
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
        error: (error: any) => {
          console.error("WebRTC error:", error);
        },
      });
  }

  static publishOwnFeedWithoutCamera() {
    JanusUtil.pluginHandler.createOffer({
      media: {
        audioSend: true,
        videoSend: false,
        videoRecv: false,
      }, // Screen sharing Publishers are sendonly
      success: (jsep) => {
        Janus.debug("Got publisher SDP!", jsep);
        const publish = {
          request: "configure",
          audio: true,
          video: false,
        };
        JanusUtil.pluginHandler.send({
          message: publish,
          jsep: jsep,
        });
      },
      error: (error) => {
        Janus.error("WebRTC error:", error);
        console.log("WebRTC error... " + error.message);
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
