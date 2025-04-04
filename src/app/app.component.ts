import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from '@angular/core';
import Janus from 'janus-gateway';
import { FormsModule } from '@angular/forms';
import { JanusUtil } from './utils';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { JanusVideoRoomService } from './services/janus-video-room.service';
import { UserTypeEnum } from './core/enums';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, NzButtonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @ViewChild('videoElement', { static: true })
  videoElement!: ElementRef<HTMLVideoElement>;

  janusRef!: Janus;
  janusRoom!: Janus;
  subsribeMode = false;
  pushedData: any = [];
  remotePushedData = [];

  roomId = 0;
  remoteFeed!: any;
  feeds: any = [];

  constructor(private _videoRoomService: JanusVideoRoomService) {}

  ngOnInit() {
    this._videoRoomService.localTrack$.subscribe((stream: MediaStream) => {
      this.videoElement.nativeElement.srcObject = stream;
      this.videoElement.nativeElement.play();
    })
  }

  createJanus() {
    this._videoRoomService.initialJanusInstance()
    // Janus.init({
    //   debug: 'all',
    //   callback: () => {
    //     if (!Janus.isWebrtcSupported()) {
    //       alert('No WebRTC support... ');
    //       return;
    //     }

    //     this.janusRef = new Janus({
    //       server: 'http://34.57.163.85/janus',
    //       success: (message: any) => {
    //         this.janusRef.attach({
    //           plugin: 'janus.plugin.videoroom',
    //           success: (pluginHandle: any) => {
    //             JanusUtil.setPlugin(pluginHandle);
    //             const piblisherOption = {
    //               request: this.subsribeMode ? 'join' :'create',
    //               ptype: 'publisher',
    //               display: 'AngularUser',
    //               permanent: false, // Set to true if you want it to persist
    //               publishers: 10, // Max participants
    //               bitrate: 128000,
    //               fir_freq: 10,
    //               audiocodec: 'opus',
    //               videocodec: 'vp8',
    //               ...(this.subsribeMode ? {room: this.roomId} : {})
    //             }

    //               pluginHandle.send({
    //                 message:  piblisherOption,
    //                 success: (message: any) => {
    //                   this.roomId = message.room
    //                   this.joinRoom(message.room);
    //                 },
    //               });
    //           },
    //           onmessage: (message: any, jsep) => {
    //             if (message.videoroom === 'joined') {
    //               console.log('Successfully joined room!');

    //               if(!this.subsribeMode) {
    //                 this.publishOwnFeed(true);
    //               }
    //               // 🔹 Step 4: Publish Audio/Video
    //               JanusUtil.pluginHandler.send({
    //                 message: { request: 'configure', audio: true, video: true },
    //               });
    //               if (message["publishers"] !== undefined && message["publishers"] !== null) {
    //                 let list = message["publishers"];
    //                 for (let f in list) {
    //                   let id = list[f]["id"];
    //                   let display = list[f]["display"];
    //                   this.createRemoteFeed(id, display);
    //                 }
    //               }
    //             }else  if(message.videoroom === 'event') {
    //               if (
    //                 message["publishers"] !== undefined &&
    //                 message["publishers"] !== null
    //               ) {
    //                 let list = message["publishers"];
    //                 console.log("Got a list of available publishers/feeds:");
    //                 console.log(list);
    //                 for (let f in list) {
    //                   let id = list[f]["id"];
    //                   let display = list[f]["display"];
    //                   this.createRemoteFeed(id, display);
    //                 }
    //               }
    //             }

    //             if (jsep) {
    //               JanusUtil.pluginHandler.createAnswer({
    //                 jsep,
    //                 media: { audio: true, video: true },
    //                 success: (jsepAnswer: any) => {
    //                   JanusUtil.pluginHandler.send({
    //                     message: {},
    //                     jsep: jsepAnswer,
    //                   });
    //                 },
    //                 error: (error: any) =>
    //                   console.error('WebRTC error:', error),
    //               });
    //             }
    //           },
    //           onlocaltrack: (track, on) => {
    //             if (track.kind === "video") {
    //               let localStream = new MediaStream();
    //               localStream.addTrack(track);
    //               Janus.attachMediaStream(this.videoElement.nativeElement, localStream)
    //             }
    //           },
    //           error: (error) => console.error('Plugin error:', error),
    //         });
    //       },
    //       error: (error) => console.error('Janus initialization failed', error),
    //     });
    //   },
    // });
  }

  joinRoom(roomId: number) {
    console.log('Joining room:', roomId);
    JanusUtil.pluginHandler.send({
      message: {
        request: 'join',
        room: roomId,
        ptype: 'publisher',
        display: 'AngularUser',
      },
    });
  }

  publishOwnFeed(useAudio: any) {
    // Publish our stream
    JanusUtil.pluginHandler.createOffer({
        media: {
          audioRecv: false,
          videoRecv: false,
          audioSend: useAudio,
          videoSend: true,
        }, // Publishers are sendonly
        success: (jsep: any) => {
          const publish = {
            request: "configure",
            audio: useAudio,
            video: true,
            record: false,
            bitrate: 102400
          };
          JanusUtil.pluginHandler.send({ message: publish, jsep: jsep });
        },
        error: function (error: any) {
          console.error("WebRTC error:", error);
          if (useAudio) {
            this.publishOwnFeed(false);
          }
        },
      });
  }

  createRemoteFeed(id: any, display: any) {
    let remoteFeed: any = {};
    this.janusRef.attach({
      plugin: "janus.plugin.videoroom",
      success: (pluginHandle: any) => {
        remoteFeed = pluginHandle;
        console.log("  -- This is a subscriber");
        // We wait for the plugin to send us an offer
        let subscribe = {
          request: "join",
          room: this.roomId,
          ptype: "subscriber",
          feed: id
        };
        remoteFeed.videoCodec = true;
        remoteFeed.send({ message: subscribe });
        console.log(subscribe);
      },
      error: function (error: any) {
        console.error("  -- Error attaching plugin...", error);
      },
      onmessage: (msg: any, jsep: any) => {
        console.debug(" ::: Got a message (subscriber) :::", msg);
        let event = msg["videoroom"];
        if (event) {
          if (event === "attached") {
            console.log(`subscriber created and attached!`);
            // Subscriber created and attached
            for (let i = 1; i < 6; i++) {
              if (!this.feeds[i]) {
                this.feeds[i] = remoteFeed;
                remoteFeed.rfindex = i;
                break;
              }
            }
            remoteFeed.rfid = msg["id"];
            remoteFeed.rfdisplay = msg["display"];
          }
        }
        if (jsep) {
          console.debug("Handling SDP as well...", jsep);
          // Answer and attach
          remoteFeed.createAnswer({
            jsep: jsep,
            media: { audioSend: false, videoSend: false }, // We want recvonly audio/video
            success: (jsep: any) => {
              console.log("Got SDP!", jsep);
              let body = { request: "start", room: this.roomId };
              remoteFeed.send({ message: body, jsep: jsep });
            },
            error: (error: any) => {
              console.error("WebRTC error:", error);
            },
          });
        }
      },
      iceState: (state: any) => {
      },
      webrtcState: (on: any) => {
        console.log(
          "Janus says this WebRTC PeerConnection (feed #" +
            remoteFeed.rfindex +
            ") is " +
            (on ? "up" : "down") +
            " now"
        );
      },
      onlocaltrack(track, on) {
        console.log(on)
      },
      onremotetrack: (stream: any) => {
        if (stream.kind === "video") {
          let localStream = new MediaStream();
          localStream.addTrack(stream);
          const indexOfData: any = this.pushedData.findIndex((remote) => {
            return remote.id === remoteFeed.id;
          });

          if(indexOfData !== -1) return;

          if (indexOfData < 0) {
            this.pushedData.push(remoteFeed);
            this.remotePushedData.push(remoteFeed);
          }

        const container = document.getElementById('container');
        const btn = document.createElement('button');
        btn.innerText = 'leave room';
        const videoElement = document.createElement('video');
        videoElement.setAttribute('id', `remotevideo${remoteFeed.id}`);
        videoElement.setAttribute('autoPlay', 'true');
        videoElement.setAttribute('playsInline', 'true');
        videoElement.style.width = '500px';

        container.appendChild(videoElement);
        container.appendChild(btn);

        const video: any = document.getElementById(
          `remotevideo${remoteFeed.id}`
        )!;

        btn.addEventListener('click', () => this.destroyRoom(`remotevideo${remoteFeed.id}`))

        Janus.attachMediaStream(video, localStream);
      }
      },
      oncleanup: function () {},
    });
  }

  joinAsRemoteRoom() {
    this._videoRoomService.roomId = this.roomId;
    this._videoRoomService.userType = UserTypeEnum.Publisher;
    this._videoRoomService.initialJanusInstance()
    this.subsribeMode = true
  }

  start_screensharing() {
    JanusUtil.startScreenShare()
  }

  stop_screensharing() {
    JanusUtil.stopScreenShare()
  }

  destroyRoom(id: string) : void {
    JanusUtil.destroyRoom()
  }
}
