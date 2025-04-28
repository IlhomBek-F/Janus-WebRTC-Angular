import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import Janus from 'janus-gateway';
import { FormsModule } from '@angular/forms';
import { JanusUtil } from './utils';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { JanusVideoRoomService } from './services/janus-video-room.service';
import { UserTypeEnum } from './core/enums';
import { CommonModule } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-converter";
import "@tensorflow/tfjs-backend-webgl";
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NzIconModule,NzInputModule,NzToolTipModule, FormsModule, NzButtonModule, CommonModule, NzPopoverModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('localVideo', { static: true }) localVideoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('localCanvas', { static: true }) localCanvasElement!: ElementRef<HTMLCanvasElement>;
  @ViewChildren('remoteVideo') remoteVideoRefs: QueryList<ElementRef<HTMLVideoElement>>
  @ViewChild('screenShare', { static: true }) screenShare!: ElementRef<HTMLVideoElement>;

  private readonly message = inject(NzMessageService);
  private segmenter: any; // Define segmenter as a class variable for body segmentation
  public blurAmount: number = 0; // Control the amount of blur
  private isBlurMode: boolean = true; // Toggle between blur mode and background image mode
  visible = false;
  janusRef!: Janus;
  janusRoom!: Janus;
  remotePushedData = [];

  roomId: number;
  hostName='';
  remoteUsername = '';
  remoteFeed!: any;
  feeds: any = [];

  remoteUserStream: { id: number; stream: MediaStream, talking: boolean }[] = [];
  remoteUserAudioStream!: { id: string; stream: MediaStream, talking: boolean }[];
  remoteUserMediaState: Record<string, { isCamMute: boolean; isMicMute: boolean }> = {};

  isLoading = false;
  isJoining = false;
  constructor(private _videoRoomService: JanusVideoRoomService, private _destroyRef: DestroyRef) {
  }

  ngOnInit() {
    this.handleLocalUserTrack();
    this.handleShareScreenTrack();
    this.handleUserTalkingStatus();
  }

  clickMe(): void {
    this.visible = false;
  }

  ngAfterViewInit(): void {
    this.handleRemoteUserTrack();
  }

  onSuccessStream(roomId: number) {
    this.roomId = roomId;
    this.isLoading = false;
    this.isJoining = false;
    // this.handleVirtualBackground();
  }

  handleLocalUserTrack() {
    this._videoRoomService.localTrack$.subscribe((track: MediaStreamTrack) => {
      const localVideoElement = this.localVideoElement.nativeElement
      if(localVideoElement.srcObject) {
        (localVideoElement.srcObject as MediaStream).addTrack(track);
      } else {
        const stream = new MediaStream([track]);
        localVideoElement.srcObject = stream;
        this.isBlurMode = true;
        this.blurAmount = 10;
      }
    });
  }

  handleRemoteUserTrack() {
    this._videoRoomService.remoteUserTrack$
      .subscribe((streamObj: {id: number, track: MediaStreamTrack}) => {
        const existStream = this.remoteUserStream.findIndex(({id}) => +id === streamObj.id);

        if(existStream === -1) {
          const stream = new MediaStream();
          stream.addTrack(streamObj.track);
          this.remoteUserStream.push({id: streamObj.id, stream, talking: false})
        }

          (this.remoteVideoRefs || [])?.forEach((videoEl, i) => {
            if(existStream > -1) {
              (videoEl.nativeElement.srcObject as MediaStream).addTrack(streamObj.track)
            } else {
              const stream = new MediaStream();
              stream.addTrack(streamObj.track);
              videoEl.nativeElement.srcObject = stream;
            }
          });

        this.remoteUserStream.forEach((user) => {
          if(!this.remoteUserMediaState[user.id]) {
            this.remoteUserMediaState[user.id] = {isCamMute: false, isMicMute: false}
          }
        })
    })

    // this._videoRoomService.remoteUserAudioTrack$.pipe(
    //   map((streamObj) => {
    //     return Object.entries(streamObj).map(([key, value]) => ({id: key, stream: value, talking: false}));
    //   })
    // ).subscribe((streamObj) => {
    //    this.remoteUserAudioStream = streamObj;
    // })
  }

  handleShareScreenTrack() {
    this._videoRoomService.screenShareTrack$.subscribe((stream: any) => {
      if(this.screenShare.nativeElement.srcObject) {
        (this.screenShare.nativeElement.srcObject as MediaStream).addTrack(stream);
      } else {
        this.screenShare.nativeElement.srcObject = stream;
      }
    })
  }

  handleUserTalkingStatus() {
    this._videoRoomService.userTalkingStatus$
     .subscribe(({id, status}) => {
      this.remoteUserStream = this.remoteUserStream.map((userData) => {
         userData.talking = +userData.id === id ? status : userData.talking;
         return userData;
      })
     })
  }

  isVirtualBackground = false;
  blur = 0;
  isImage = false;
  bgImage:any;

  handleVirtualBackground(blur: number) {
    const inputVideo = document.createElement('video');
    this.blur = blur;
    const canvasElement = document.createElement('canvas');
    const ctx = canvasElement.getContext('2d');

    if(!this.isVirtualBackground) {
      const segmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });

      segmentation.setOptions({
        modelSelection: 1,
      });
      segmentation.onResults(results => {
        canvasElement.width = results.image.width;
        canvasElement.height = results.image.height;
      // STEP 1: Draw blurred background

       ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
       ctx.save();

      if(this.isImage) {
        ctx.filter = 'none';
        ctx.drawImage(this.bgImage, 0, 0, canvasElement.width, canvasElement.height);
      }else {
        ctx.filter = `blur(${this.blur}px)`;
        ctx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
      }

      ctx.restore();


      // STEP 2: Erase the person area (make it transparent)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);

      // STEP 3: Draw the original (sharp) person on top
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

      // STEP 4 (optional): Reset
      ctx.globalCompositeOperation = 'source-over';
      });

      const camera = new Camera(inputVideo, {
        onFrame: async () => {
          await segmentation.send({ image: inputVideo });
        },
        width: 640,
        height: 480
      });
      camera.start();
    }

    const stream = canvasElement.captureStream(30); // 30 FPS\
 // Here's the trick: stream canvas into video
    if(!this.isVirtualBackground) {
     this.isVirtualBackground = true;
     this.localVideoElement.nativeElement.srcObject = stream;

     JanusUtil.pluginHandler.send({ message: { request: "unpublish" }, success: () => {

     } });

     setTimeout(() => {
      JanusUtil.publishOwnFeed(stream)
     }, 5000);
   }
  }

  setBackgroundImage() {
    const bgImage = new Image();
    bgImage.crossOrigin = 'anonymous'; // Important!
    bgImage.src = 'https://tse1.mm.bing.net/th?id=OIP.yLf7kQVaLpxqCZX1VRHw-wHaEK&pid=Api';
    bgImage.onload = () => {
      this.isImage = true;
      this.bgImage = bgImage;
      this.handleVirtualBackground(0)
    }
  }

  private initialJanus() {
    this._videoRoomService.initialJanusInstance(this.onSuccessStream.bind(this), {hostName: this.hostName, userName: this.remoteUsername})
  }

  createRoom() {
    if(!this.hostName.trim().length) {
      this.message.info('Please enter host name');
      return;
    }

    this.isLoading = true;
    this.initialJanus();
  }

  joinAsRemoteRoom() {
    if(!this.remoteUsername.trim().length) {
      this.message.info('Please enter user name');
      return;
    }

    if(!this.roomId) {
      this.message.info('Please enter room number');
      return;
    }

    this._videoRoomService.roomId = +this.roomId;
    this._videoRoomService.userType = UserTypeEnum.Publisher;
    this.isJoining = true;
    this.initialJanus()
  }

  destroyRoom(id: string) : void {
    JanusUtil.destroyRoom()
  }

  toggleRemoteUserMic(user: any) {
   this.remoteUserMediaState[user.id].isMicMute = !this.remoteUserMediaState[user.id].isMicMute;
   JanusUtil.toggleRemoteUserMic(user.id, user.isMute);
  }

  toggleRemoteUserCam(user: any) {
    this.remoteUserMediaState[user.id].isCamMute = !this.remoteUserMediaState[user.id].isCamMute;
    JanusUtil.toggleRemoteUserCam(user.id, this.remoteUserMediaState[user.id].isCamMute);
  }

  shareScreen() {
    this._videoRoomService.userType = UserTypeEnum.ScreenShare;
    this._videoRoomService.initialJanusInstance(this.onSuccessStream, {hostName: this.hostName, userName: this.remoteUsername});
  }

  stopShareScreen() {
    JanusUtil.endScreenShare(() => {
      this.screenShare.nativeElement.srcObject = null;
    })
  }
}
