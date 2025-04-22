import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  QueryList,
  ViewChild,
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
  @ViewChild('remoteVideo') remoteVideoRefs: QueryList<ElementRef<HTMLVideoElement>>
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
  }

  handleLocalUserTrack() {
    this._videoRoomService.localTrack$.subscribe((track: MediaStreamTrack) => {
      const localVideoElement = this.localVideoElement.nativeElement
      if(localVideoElement.srcObject) {
        (localVideoElement.srcObject as MediaStream).addTrack(track);
      } else {
        const stream = new MediaStream([track]);
        localVideoElement.srcObject = stream;
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

  async initSegmenter() {
    const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
    const segmenterConfig: any = {
      runtime: 'mediapipe',
      solutionPath:
        'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation',
      modelType: 'general',
    };

    this.segmenter = await bodySegmentation.createSegmenter(
      model,
      segmenterConfig
    );

    this.localVideoElement.nativeElement.hidden = true;
    this.localCanvasElement.nativeElement.classList.remove('hidden')
    if (this.isBlurMode) {
      this.localCanvasElement.nativeElement.setAttribute('style', `background-image: none`);
      this.blurBackground();
    } else {
      this.removeBackground();
    }
  }

  async blurBackground() {
    const foregroundThreshold = 0.5;
    const edgeBlurAmount = 3;
    const flipHorizontal = false;
    const context = this.localCanvasElement.nativeElement.getContext('2d');

    // Continuously process video frames
    const processFrame = async () => {
      // Draw the video frame on the canvas
      context.drawImage(this.localVideoElement.nativeElement, 0, 0, 640, 480);
      // Apply the background blur effect
      await bodySegmentation.drawBokehEffect(
        this.localCanvasElement.nativeElement,
        this.localVideoElement.nativeElement,
        await this.segmenter.segmentPeople(this.localVideoElement.nativeElement),
        foregroundThreshold,
        this.blurAmount,
        edgeBlurAmount,
        flipHorizontal
      );

      // Request the next frame
      requestAnimationFrame(processFrame);
    };

    // Start processing the first frame
    requestAnimationFrame(processFrame);
  }

  async removeBackground() {
    this.localCanvasElement.nativeElement.width = 640;
    this.localCanvasElement.nativeElement.height = 480;
    const context = this.localCanvasElement.nativeElement.getContext('2d');

    // Continuously process video frames
    const processFrame = async () => {
      // Draw the video frame on the canvas
      context.drawImage(this.localVideoElement.nativeElement, 0, 0);

      const segmentation = await this.segmenter.segmentPeople(
        this.localVideoElement.nativeElement
      );
      const foregroundColor = { r: 0, g: 0, b: 0, a: 12 };
      const backgroundColor = { r: 0, g: 0, b: 0, a: 15 };

      const coloredPartImage = await bodySegmentation.toBinaryMask(
        segmentation,
        foregroundColor,
        backgroundColor
      );

      // Get the image data of the canvas
      const imageData = context.getImageData(0, 0, 640, 480);
      const pixels = imageData.data;

      // Loop through each pixel to set transparency
      for (let i = 3; i < pixels.length; i += 4) {
        if (coloredPartImage.data[i] === 15) {
          pixels[i] = 0; // Set the alpha channel to 0 (transparent)
        }
      }

      await bodySegmentation.drawBokehEffect(
        this.localCanvasElement.nativeElement,
        imageData,
        segmentation,
        0.5,
        10
      );

      // Request the next frame
      requestAnimationFrame(processFrame);
    };

    // Start processing the first frame
    requestAnimationFrame(processFrame);
  }

  noBlur(): void {
    if (!this.isBlurMode) {
      this.isBlurMode = true;
      this.initSegmenter();
    }
    this.blurAmount = 0;
  }

  lowBlur(): void {
    if (!this.isBlurMode) {
      this.isBlurMode = true;
      this.initSegmenter();
    }
    this.blurAmount = 3;
  }

  midBlur(): void {
    if (!this.isBlurMode) {
      this.isBlurMode = true;
      this.initSegmenter();
    }
    this.blurAmount = 5;
  }

  highBlur(): void {
      this.isBlurMode = true;
      this.initSegmenter();
    this.blurAmount = 10;
  }

  setBackgroundImage() {
    if (this.isBlurMode) {
      this.isBlurMode = false;
      this.initSegmenter();
    }
    this.localCanvasElement.nativeElement.setAttribute(
      'style',
      `background-image: url('https://tse2.mm.bing.net/th?id=OIP.7cRYFyLoDEDh4sRtM73vvwHaDg&pid=Api&P=0&h=220');
       background-repeat: no-repeat;
       background-position: center;
       background-size: cover
      `
    );
  }
}
