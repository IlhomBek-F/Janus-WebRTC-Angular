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
import { map, Observable } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, NzButtonModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @ViewChild('videoElement', { static: true })
  videoElement!: ElementRef<HTMLVideoElement>;

  @ViewChild('screenShare', { static: true })
  screenShare!: ElementRef<HTMLVideoElement>;

  janusRef!: Janus;
  janusRoom!: Janus;
  subsribeMode = false;
  pushedData: any = [];
  remotePushedData = [];

  roomId = 0;
  remoteFeed!: any;
  feeds: any = [];

  remoteUserStream!: { id: string; stream: MediaStream }[];

  constructor(private _videoRoomService: JanusVideoRoomService) {
  }

  ngOnInit() {
    this._videoRoomService.localTrack$.subscribe((stream: MediaStream) => {
      this.videoElement.nativeElement.srcObject = stream;
      this.videoElement.nativeElement.play();
    });

    this._videoRoomService.remoteUserTrack$.pipe(
      map((streamObj) => {
        return Object.entries(streamObj).map(([key, value]) => ({id: key, stream: value}));
      })
    ).subscribe((streamObj) => {
      this.remoteUserStream = streamObj;
    })
  }

  createJanus(stream?: MediaStream) {
    this._videoRoomService.initialJanusInstance()
  }

  joinRoom(roomId: number) {
    console.log('Joining room:', roomId);
    JanusUtil.pluginHandler.send({
      message: {
        request: 'join',
        room: roomId,
        ptype: 'publisher',
        display: 'AngularUser' + Janus.randomString(3),
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
    this.createJanus()
    this.subsribeMode = true
  }

  start_screensharing() {
    // JanusUtil.startScreenShare();
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    .then((stream) => {
      this.listenForScreenShareEnd(stream);
      localStorage.setItem('screenShare', JSON.stringify(stream))
      setTimeout(() => {
        // this.screenShare.nativeElement.srcObject = JSON.parse(localStorage.getItem('screenShare')!);
        console.log(JSON.parse(localStorage.getItem('screenShare')!))
        this.screenShare.nativeElement.play();
      }, 4000)
    }).catch(console.log)

  }

  stop_screensharing() {
    JanusUtil.stopScreenShare()
  }

  listenForScreenShareEnd(stream) {
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      console.log("Stop button pressed in browser");
 this.screenShare.nativeElement.srcObject
    });
  }

  destroyRoom(id: string) : void {
    JanusUtil.destroyRoom()
  }
}
