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
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';

// Add this globally if TypeScript doesn't recognize WebCodecs classes
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack });
  readable: ReadableStream<VideoFrame>;
}

declare class MediaStreamTrackGenerator {
  constructor(init: { kind: 'video' | 'audio' });
  writable: WritableStream<VideoFrame>;
}

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

 globalController = null;
 timestamp = null;
 stream = null;
 customBackgroundImage = new Image();

 canvasElement = null;
 canvasCtx = null;

  remoteUserStream: { id: number; stream: MediaStream, talking: boolean }[] = [];
  remoteUserAudioStream!: { id: string; stream: MediaStream, talking: boolean }[];
  remoteUserMediaState: Record<string, { isCamMute: boolean; isMicMute: boolean }> = {};
  virtualBackgroundState = {blur: 0, isImage: false, imageInstance: null, cameraInstance: null};

  isLoading = false;
  isJoining = false;

  selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
    }
  });

  constructor(private _videoRoomService: JanusVideoRoomService, private _destroyRef: DestroyRef) {
  }

  ngOnInit() {
    this.handleLocalUserTrack();
    this.handleShareScreenTrack();
    this.handleUserTalkingStatus();
    this.selfieSegmentation.setOptions({
      modelSelection: 0
    });
  }

  async turnOnCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video: true
});

      this.localVideoElement.nativeElement.srcObject = stream;
      this.intialVirtualBackgroundMode()
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('Permission denied error');
      } else {
        alert('error');
      }
    }
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
    this.turnOnCamera()
    // this.initialVirtualBackground();
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

  handleVirtualBackground(blur: number) {
    this.virtualBackgroundState.blur = blur;
    this.virtualBackgroundState.isImage = false;
  }

  async intialVirtualBackgroundMode() {
    const transformedStream = await this.transformGetUserMediaStream();
    this.selfieSegmentation.onResults(this.onResults.bind(this));
    this.localVideoElement.nativeElement.srcObject = transformedStream;
    JanusUtil.publishOwnFeed(transformedStream)
  }

  async transformGetUserMediaStream() {
    const videoTrack = (this.localVideoElement.nativeElement.srcObject as MediaStream).getVideoTracks()[0];
    const trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
    const trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
    const { width, height } = videoTrack.getSettings();

    this.canvasElement = new OffscreenCanvas(width, height);
    this.canvasCtx = this.canvasElement.getContext('2d');

    const transformer = new TransformStream({
       transform: async (videoFrame, controller) => {
        this.globalController = controller;
        this.timestamp = videoFrame.timestamp;
        videoFrame.width = width;
        videoFrame.height = height;
        await this.selfieSegmentation.send({ image: videoFrame });
        videoFrame.close();
      }
    });

    trackProcessor.readable.pipeThrough(transformer).pipeTo(trackGenerator.writable);

    const transformedStream = new MediaStream();
    transformedStream.addTrack(trackGenerator as any)
    return transformedStream;
  }

   onResults(results) {
    this.canvasElement.width = results.image.width;
    this.canvasElement.height = results.image.height;

    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    this.canvasCtx.save();

    if(this.virtualBackgroundState.isImage) {
      this.canvasCtx.filter = 'none';
      this.canvasCtx.drawImage(this.virtualBackgroundState.imageInstance, 0, 0, this.canvasElement.width, this.canvasElement.height);
    }else {
      this.canvasCtx.filter = `blur(${this.virtualBackgroundState.blur}px)`;
      this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);
    }
    this.canvasCtx.restore();


    // STEP 2: Erase the person area (make it transparent)
    this.canvasCtx.globalCompositeOperation = 'destination-out';
    this.canvasCtx.drawImage(results.segmentationMask, 0, 0, this.canvasElement.width, this.canvasElement.height);

    // STEP 3: Draw the original (sharp) person on top
    this.canvasCtx.globalCompositeOperation = 'destination-over';
    this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

    // STEP 4 (optional): Reset
    this.canvasCtx.globalCompositeOperation = 'source-over';
    this.globalController.enqueue(new VideoFrame(this.canvasElement, { timestamp: this.timestamp, alpha: 'discard' }));
  }

 private async initialVirtualBackground() {
    const inputVideo = document.createElement('video');

    const canvasElement = document.createElement('canvas');
    const ctx = canvasElement.getContext('2d');

      const segmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });

      segmentation.setOptions({
        modelSelection: 1,
      });

      segmentation.onResults(results => {
        const {isImage, imageInstance, blur} = this.virtualBackgroundState;
        canvasElement.width = results.image.width;
        canvasElement.height = results.image.height;
      // STEP 1: Draw blurred background

       ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
       ctx.save();

      if(isImage) {
        ctx.filter = 'none';
        ctx.drawImage(imageInstance, 0, 0, canvasElement.width, canvasElement.height);
      }else {
        ctx.filter = `blur(${blur}px)`;
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

    this.virtualBackgroundState.cameraInstance = camera;
    const stream = canvasElement.captureStream(30); // 30 FPS\
    // Here's the trick: stream canvas into video
      JanusUtil.publishOwnFeed(stream)
   }

  setBackgroundImage() {
    const bgImage = new Image();
    bgImage.crossOrigin = 'anonymous'; // Important!
    bgImage.src = 'https://tse3.mm.bing.net/th?id=OIP.61WVaITjtcbXRW6YsbWSUAHaE8&pid=Api&P=0&h=220';

    bgImage.onload = () => {
      this.virtualBackgroundState.imageInstance = bgImage
      this.virtualBackgroundState.isImage = true;
    }

    bgImage.onerror = (err) => {
          console.log(err)
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
