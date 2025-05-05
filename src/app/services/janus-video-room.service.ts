import { Injectable, signal } from '@angular/core';
import Janus from 'janus-gateway';
import { JanusUtil } from '../utils';
import { JanusEventEnum, JanusPluginEnum, UserTypeEnum } from '../core/enums';
import { Subject } from 'rxjs';

const ROOM_TOKEN = 'test_token'; // Replace with your actual token
const serverUrl = 'http://185.221.214.97:8088/janus';
// const serverUrl = 'http://34.57.163.85:8088/janus';

@Injectable({ providedIn: 'root' })
export class JanusVideoRoomService {
  janusRef: Janus;
  pluginRef: any;
  roomId: number;
  userType = UserTypeEnum.Admin; // Default to Admin
  screenStream = signal(null);
  localTrack$: Subject<MediaStreamTrack> = new Subject<MediaStreamTrack>();
  remoteUserTrack$:Subject<{id: number, track: MediaStreamTrack, name: string}> = new Subject<{id: number, track: MediaStreamTrack, name: string}>();
  screenShareTrack$: Subject<MediaStreamTrack> = new Subject();
  remoteUserAudioTrack$: Subject<{id: number, track: MediaStreamTrack}> = new Subject<{id: number, track: MediaStreamTrack}>();
  userTalkingStatus$: Subject<{id: number, status: boolean}> = new Subject<{id: number, status: boolean}>();
  onSuccessStream: Function;

  userInfo: {hostName: string, userName: string};

  screenShareJanusInstance: Janus;
  screenSharePluginHandle: any;

  initialJanusInstance(onSuccessStream, userInfo: {hostName: string, userName: string}) {
    this.onSuccessStream = onSuccessStream;
    this.userInfo = userInfo;

    Janus.init({
      debug: 'all',
      callback: () => {
        if (!Janus.isWebrtcSupported()) {
          alert('No WebRTC support... ');
          return;
        }

        this.janusRef = this.createJanusInstance();
      },
    });
  }

  createJanusInstance() {
    return new Janus({
      server: serverUrl,
      success: () => this.userType === UserTypeEnum.Admin ? this.attachAdminPlugin() : this.attachUserPlugin(),
      error: (error) => console.error('Janus initialization failed', error),
      destroyed: () => console.log('Janus instance destroyed'),
    });
  }

  attachAdminPlugin() {
    this.janusRef.attach({
      plugin: JanusPluginEnum.VideoRoom,
      success: (plugin: any) => {
        JanusUtil.setPlugin(plugin);

        plugin.send({
          message: {
            request: "create",
            ptype: UserTypeEnum.Publisher,
            publishers: 10,
            audiolevel_event: true,
            audio_active_packets: 7,
            notify_joining: true,
            display: this.userInfo.hostName,
            allowed: [ROOM_TOKEN],
            metadata: {isHost: true}
          },
          success: (response: any) => {
            this.roomId = response.room;
            JanusUtil.setRoomId(this.roomId);
            this.joinRoom(this.roomId, this.userInfo.hostName);
          },
          error: (error: any) => {
            console.error("🚨 Ошибка создания комнаты:", error);
          },
        });
      },
      error(error) {
        console.error('Error attaching plugin:', error);
      },
      onmessage: (message: any, jsep: any) => {
        if(message.videoroom === JanusEventEnum.Joined) {
          console.log('Successfully joined room!');
          this.onSuccessStream(this.roomId);
          JanusUtil.publishOwnFeed()
        }

        if(message.publishers) {
          this.createRemotePublisherFeed(message.publishers);
        }

        if(jsep) {
          JanusUtil.pluginHandler.handleRemoteJsep({jsep})
        }
      },
      onlocaltrack: (track, on) => {
        if (track.kind === "video" && on) {
          this.localTrack$.next(track);
        }
      },
    });
  }

  attachUserPlugin() {
    this.janusRef.attach({
      plugin: JanusPluginEnum.VideoRoom,
      success: (plugin: any) => {
        JanusUtil.setPlugin(plugin);
        this.joinRoom(this.roomId, this.userInfo.userName);
      },
      error(error) {
        console.error('Error attaching plugin:', error);
      },
      onmessage: (message: any, jsep: any) => {
        if(message.videoroom === JanusEventEnum.Joined) {
          console.log('Successfully joined room!');
          this.onSuccessStream();
        }

        if(message.videoroom === JanusEventEnum.Talking) {
          this.userTalkingStatus$.next({id: message.id, status: true})
        }else if(message.videoroom === JanusEventEnum.StopedTalking) {
          this.userTalkingStatus$.next({id: message.id, status: false})
        }

        if(message.unpublished) {
          if(message.metadata?.isScreenShare) {
            this.screenShareTrack$.next(null);
          }
        }

        if(message.publishers) {
          this.createRemotePublisherFeed(message.publishers);
        }

      },
      onlocaltrack: (track, on) => {
        if (track.kind === "video") {
          this.localTrack$.next(track);
        }
      },
    });
  }

  publishScreenShare() {
    Janus.init({
      debug: true,
      callback: () => {

        if (!Janus.isWebrtcSupported()) {
          alert("No WebRTC support");
          return;
      }

        this.screenShareJanusInstance = new Janus({
          server: serverUrl,
          success: () => {
            console.log("✅ Janus подключен");
            this.attachScreenSharePlugin()
          },
          error: (error) => {
            console.error("🚨 Ошибка подключения Janus:", error);
          },
        });
      },
    });
  }

  private attachScreenSharePlugin() {
    const publisher: any = {
      display: this.userInfo.userName + "_screen",
      metadata: {isScreenShare: true},
    }

    this.screenShareJanusInstance.attach({
      plugin: "janus.plugin.videoroom",
      success: (pluginHandle) => {
        this.screenSharePluginHandle = pluginHandle;

        const subscribe = {
          request: "join",
          room: this.roomId,
          ptype: "publisher",
          token: ROOM_TOKEN,
          metadata: publisher.metadata,
          display: publisher.display,
          quality: 0,
        };

        pluginHandle.send({
          message: subscribe,
        });
      },
      error: (error) => {
        Janus.error("  -- Error attaching plugin...", error);
        console.log("Error attaching plugin... " + error);
      },
      onmessage: (msg: any, jsep) => {
        Janus.debug(" ::: Got a message (publisher) :::", msg);
        var event = msg["videoroom"];
        Janus.debug("Event: " + event);
        if (event) {
          if (event === "joined") {
              publisher.id = msg.id

              this.screenSharePluginHandle.createOffer({
                media: {
                  video: 'screen',
                  audioSend: true,
                  videoRecv: false,
                }, // Screen sharing Publishers are sendonly
                success: (jsep) => {
                  Janus.debug("Got publisher SDP!", jsep);
                  var publish = {
                    request: "configure",
                    audio: false,
                    video: true,
                  };
                  this.screenSharePluginHandle.send({
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
        }
        if (jsep) {
          Janus.debug("Handling SDP as well...", jsep);
          this.screenSharePluginHandle.handleRemoteJsep({
            jsep: jsep,
          });
        }
      },
      onlocaltrack: (stream, on) => {
        // Share screen local track
      }
    })
  }

  createRemotePublisherFeed(publishers: any) {
    publishers.forEach((publisher: any) => {
      let remoteFeed: any = null;
      let subscription: any = [];

      this.janusRef.attach({
        plugin: "janus.plugin.videoroom",
        success: (pluginHandle: any) => {
          remoteFeed = pluginHandle;
          console.log("  -- This is a subscriber");
          publisher.streams.forEach((stream: any) => {
            if (
              stream.type === "video" &&
              Janus.webRTCAdapter.browserDetails.browser === "safari" &&
              (stream.codec === "vp9" ||
                (stream.codec === "vp8" && !Janus.safariVp8))
            ) {
              console.warn(
                "Publisher is using " +
                  stream.codec.toUpperCase +
                  ", but Safari doesn't support it: disabling video stream #" +
                  stream.mindex
              );
            } else {
              subscription.push({
                feed: publisher.id, // This is mandatory
                mid: stream.mid, // This is optional (all streams, if missing)
              });
            }
          });

          remoteFeed.send({
            message: {
              request: "join",
              room: this.roomId, // ID комнаты
              ptype: UserTypeEnum.Subscriber,
              streams: subscription,
              audiolevel_event: true, // 🔥 Enable audio level detection
              audio_active_packets: 7, // How quickly it detects speech
            },
          });

        },
        onmessage: (message, jsep) => {
          if(jsep) {
            remoteFeed.createAnswer({
              jsep: jsep,
              tracks: [{ type: "data" }],
              media: { audio: true, video: false },
              success: (jsepAnswer: any) => {
                Janus.debug("Got SDP!", jsep);
                remoteFeed.send({
                  message: { request: "start", room: this.roomId },
                  jsep: jsepAnswer,
                });
              },
              error: (error: any) => {
                Janus.error("WebRTC error:", error);
                alert("WebRTC error... " + error.message);
              },
            });
          }
        },
        onremotetrack: (track, mid, on, metadata) => {
          console.log("  -- Remote track:", track, mid, on, metadata);

          if (track.kind === "video") {
            let remoteStream = new MediaStream();
            remoteStream.addTrack(track);

            if(publisher.metadata?.isScreenShare) {
              this.screenShareTrack$.next(track)
            }else {
              this.remoteUserTrack$.next({id: publisher.id, track, name: publisher.display});
            }
          } else if(track.kind === 'audio') {
            let remoteStream = new MediaStream();
            remoteStream.addTrack(track);
          }
        },
        error: function (error: any) {
          console.error("  -- Error attaching plugin...", error);
        },
    })
    })
  }

  joinRoom(roomId: number, username: string) {
    console.log('Joining room:', roomId);
    JanusUtil.pluginHandler.send({
      message: {
        request: 'join',
        room: roomId,
        token: ROOM_TOKEN,
        ptype: UserTypeEnum.Publisher,
        audiolevel_event: true,
        audio_active_packets: 7,
        display: username,
      },
    });
  }

  endScreenShare(onSuccess) {
    const unpublish = {
      request: "unpublish",
    };
    this.screenSharePluginHandle.send({
      message: unpublish,
      success: () => {
        onSuccess()
      },
    });
  }
}
