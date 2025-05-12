import {
  Component,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import Janus from 'janus-gateway';
import { FormsModule } from '@angular/forms';
import { JanusUtil } from './utils';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { JanusVideoRoomService } from './services/janus-video-room.service';
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
import { HeaderComponent } from "./components/header/header.component";
import { LocalUserStreamComponent } from "./components/local-user-stream/local-user-stream.component";
import { RemoteUsersStreamComponent } from "./components/remote-users-stream/remote-users-stream.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NzIconModule,
    NzInputModule,
    NzToolTipModule,
    FormsModule,
    NzButtonModule,
    CommonModule,
    NzPopoverModule,
    HeaderComponent,
    LocalUserStreamComponent,
    RemoteUsersStreamComponent
],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('localCanvas', { static: true }) localCanvasElement!: ElementRef<HTMLCanvasElement>;
  @ViewChild('screenShare', { static: false }) screenShare!: ElementRef<HTMLVideoElement>;

  private readonly message = inject(NzMessageService);
  public blurAmount: number = 0; // Control the amount of blur
  janusRef!: Janus;
  janusRoom!: Janus;
  remotePushedData = [];

  visible = false;
  remoteFeed!: any;
  feeds: any = [];


  virtualBackgroundState = {blur: 0, isImage: false, imageInstance: null, cameraInstance: null};

  selfieSegmentation: SelfieSegmentation

  constructor(private _videoRoomService: JanusVideoRoomService, private _ngZone: NgZone) {
  }

  ngOnInit() {
    this.handleShareScreenTrack();
  }

  ngOnDestroy(): void {
    this.selfieSegmentation.close()
  }

  async turnOnCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video: true});

      // this.localVideoElement.nativeElement.srcObject = stream;
      this.intialVirtualBackgroundMode()
    } catch (error) {
      JanusUtil.publishOwnFeedWithoutCamera()
    }
  }

  recordingStream: MediaStream = null;
  mediarecorder: MediaRecorder = null;

  startRecording() {
    this._ngZone.runOutsideAngular(async () => {
   try {
    const constraints = {
      video: { frameRate: { ideal: 30 }, width: 1920, height: 1080 },
      audio: true
    };

    this.recordingStream = await navigator.mediaDevices.getDisplayMedia(constraints);
    this.mediarecorder = new MediaRecorder(this.recordingStream, { mimeType: 'video/webm;codecs=vp8,opus' });
    this.mediarecorder.start();

    const [video] = this.recordingStream.getVideoTracks();
    video.addEventListener("ended", () => {
      this.stopRecording();
    });

    this.mediarecorder.addEventListener("dataavailable", (e) => {
      this.downloadRecording(e.data);
    });
  } catch (error) {
    console.error("Error al grabar la pantalla:", error);
  }
    })
  }

  downloadRecording(data) {
  const blob = new Blob([data], { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lesson-${new Date().toISOString()}.webm`;
  link.click();
}

stopRecording() {
  if (this.mediarecorder) {
    this.mediarecorder.stop();
    this.mediarecorder = null;
    this.recordingStream.getTracks().forEach(track => track.stop());
    this.recordingStream = null;
  }
}

  handleShareScreenTrack() {
    this._videoRoomService.screenShareTrack$.subscribe((streamTrack: MediaStreamTrack) => {
      // this.isScreenShare = true;
      // this.isAvailableShareScreen = false;
      setTimeout(() => {
        if(this.screenShare.nativeElement.srcObject) {
          (this.screenShare.nativeElement.srcObject as MediaStream).addTrack(streamTrack);
        } else {
          const stream = new MediaStream([streamTrack]);
          this.screenShare.nativeElement.srcObject = stream;
        }
      }, 0);
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
    // this.localVideoElement.nativeElement.srcObject = outputStream;
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

  destroyRoom(id: string) : void {
    JanusUtil.destroyRoom()
  }

  toggleLocalUserMic() {
    JanusUtil.toggleLocalUserMic();
  }

  toggleLocalUserCam() {
    JanusUtil.toggleLocalUserCam();
  }

  // toggleRemoteUserMic(user: any) {
  //  this.remoteUserMediaState[user.id].isMicMute = !this.remoteUserMediaState[user.id].isMicMute;
  //  JanusUtil.toggleRemoteUserMic(user.id, user.isMute);
  // }

  // toggleRemoteUserCam(user: any) {
  //   this.remoteUserMediaState[user.id].isCamMute = !this.remoteUserMediaState[user.id].isCamMute;
  //   JanusUtil.toggleRemoteUserCam(user.id, this.remoteUserMediaState[user.id].isCamMute);
  // }
}
