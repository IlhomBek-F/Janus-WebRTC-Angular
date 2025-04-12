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
import { map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NzIconModule,NzInputModule,NzToolTipModule, FormsModule, NzButtonModule, CommonModule, ],
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
  remoteUserMediaState: Record<string, { isCamMute: boolean; isMicMute: boolean }> = {};

  constructor(private _videoRoomService: JanusVideoRoomService) {
  }

  ngOnInit() {
    this.handleLocalUserTrack();
    this.handleRemoteUserTrack();
    this.handleShareScreenTrack()
  }

  handleLocalUserTrack() {
    this._videoRoomService.localTrack$.subscribe((stream: MediaStream) => {
      this.videoElement.nativeElement.srcObject = stream;
      this.videoElement.nativeElement.play();
    });
  }

  handleRemoteUserTrack() {
    this._videoRoomService.remoteUserTrack$.pipe(
      map((streamObj) => {
        return Object.entries(streamObj).map(([key, value]) => ({id: key, stream: value}));
      })
    ).subscribe((streamObj) => {
      this.remoteUserStream = streamObj;
        this.remoteUserStream.forEach((user) => {
          if(!this.remoteUserMediaState[user.id]) {
            this.remoteUserMediaState[user.id] = {isCamMute: false, isMicMute: false}
          }
        })
    })
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

  createRoom() {
    this._videoRoomService.initialJanusInstance()
  }

  joinRoom(roomId: number) {
    console.log('Joining room:', roomId);
    JanusUtil.pluginHandler.send({
      message: {
        request: 'join',
        room: +roomId,
        ptype: 'publisher',
        display: 'AngularUser' + Janus.randomString(3),
      },
    });
  }

  joinAsRemoteRoom() {
    this._videoRoomService.roomId = +this.roomId;
    this._videoRoomService.userType = UserTypeEnum.Publisher;
    this.createRoom()
    this.subsribeMode = true
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
    this._videoRoomService.initialJanusInstance();
  }

  stopShareScreen() {
    JanusUtil.endScreenShare(() => {
      this.screenShare.nativeElement.srcObject = null;
    })
  }
}
