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
        document.getElementById('container')
        .removeChild(document.getElementById(id))
      },
      error: () => {
        console.log('Error deleting room')
      }
    })
  }
}
