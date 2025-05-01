import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NzIconModule,NzInputModule,NzToolTipModule, FormsModule, NzButtonModule, CommonModule, NzPopoverModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('localVideo', { static: true }) localVideoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('localCanvas', { static: true }) localCanvasElement!: ElementRef<HTMLCanvasElement>;
  @ViewChildren('remoteVideo') remoteVideoRefs: QueryList<ElementRef<HTMLVideoElement>>
  @ViewChild('screenShare', { static: true }) screenShare!: ElementRef<HTMLVideoElement>;

  private readonly message = inject(NzMessageService);
  public blurAmount: number = 0; // Control the amount of blur
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
  virtualBackgroundState = {blur: 0, isImage: false, imageInstance: null, cameraInstance: null};

  isLoading = false;
  isJoining = false;

  selfieSegmentation: SelfieSegmentation

  constructor(private _videoRoomService: JanusVideoRoomService, private _destroyRef: DestroyRef) {
  }

  ngOnInit() {
    this.handleLocalUserTrack();
    this.handleShareScreenTrack();
    this.handleUserTalkingStatus();
  }

  ngOnDestroy(): void {
    this.selfieSegmentation.close()
  }

  async turnOnCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video: true});

      this.localVideoElement.nativeElement.srcObject = stream;
      this.intialVirtualBackgroundMode()
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          JanusUtil.publishOwnFeedWithoutCamera()
        alert('Permission denied error');
      } else {
        alert(`Error: ${error.name}`);
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
    const inputVideoRef = document.createElement('video')
    const canvasRef = document.createElement('canvas')
    const ctx = canvasRef.getContext('2d')!;

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    inputVideoRef.srcObject = stream;
    await inputVideoRef.play();

    // Mirror canvas to video output
    const outputStream = canvasRef.captureStream(25);
    this.localVideoElement.nativeElement.srcObject = outputStream;
    JanusUtil.publishOwnFeed(outputStream)

    const selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    selfieSegmentation.setOptions({
      modelSelection: 1,
    });

    selfieSegmentation.onResults((results) => {
      const width = results.image.width;
      const height = results.image.height;

      canvasRef.width = width;
      canvasRef.height = height;

      ctx.clearRect(0, 0, width, height);
      ctx.save();

      if(this.virtualBackgroundState.isImage) {
        ctx.filter = 'none';
        ctx.drawImage(this.virtualBackgroundState.imageInstance, 0, 0, canvasRef.width, canvasRef.height);
      }else {
        ctx.filter = `blur(${this.virtualBackgroundState.blur}px)`;
        ctx.drawImage(results.image, 0, 0, canvasRef.width, canvasRef.height);
      }
      ctx.restore();

      // STEP 2: Remove person
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(results.segmentationMask, 0, 0, width, height);

      // STEP 3: Draw person over background
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(results.image, 0, 0, width, height);

      ctx.globalCompositeOperation = 'source-over';
    });

    this.selfieSegmentation = selfieSegmentation;

    const processLoop = async () => {
      if (!inputVideoRef.paused && !inputVideoRef.ended) {
        await selfieSegmentation.send({ image: inputVideoRef });
        requestAnimationFrame(processLoop);
      }
    };

    processLoop();
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
