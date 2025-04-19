import {
  Component,
  ElementRef,
  inject,
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
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NzIconModule,NzInputModule,NzToolTipModule, FormsModule, NzButtonModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @ViewChild('videoElement', { static: true })
  videoElement!: ElementRef<HTMLVideoElement>;

  @ViewChild('screenShare', { static: true })
  screenShare!: ElementRef<HTMLVideoElement>;
  private readonly message = inject(NzMessageService);

  janusRef!: Janus;
  janusRoom!: Janus;
  remotePushedData = [];

  roomId: number;
  hostName='';
  remoteUsername = '';
  remoteFeed!: any;
  feeds: any = [];

  remoteUserStream!: { id: string; stream: MediaStream, talking: boolean }[];
  remoteUserAudioStream!: { id: string; stream: MediaStream, talking: boolean }[];
  remoteUserMediaState: Record<string, { isCamMute: boolean; isMicMute: boolean }> = {};

  isLoading = false;
  isJoining = false;
  constructor(private _videoRoomService: JanusVideoRoomService) {
  }

  ngOnInit() {
    this.handleLocalUserTrack();
    this.handleRemoteUserTrack();
    this.handleShareScreenTrack();
    this.handleUserTalkingStatus();
  }

  onSuccessStream(roomId: number) {
    this.roomId = roomId;
    this.isLoading = false;
    this.isJoining = false;
  }

  handleLocalUserTrack() {
    this._videoRoomService.localTrack$.subscribe((stream: MediaStream) => {
      this.videoElement.nativeElement.srcObject = stream;
    });
  }

  handleRemoteUserTrack() {
    this._videoRoomService.remoteUserTrack$.pipe(
      map((streamObj) => {
        return Object.entries(streamObj).map(([key, value]) => ({id: key, stream: value, talking: false}));
      })
    ).subscribe((streamObj) => {
      this.remoteUserStream = streamObj;
        this.remoteUserStream.forEach((user) => {
          if(!this.remoteUserMediaState[user.id]) {
            this.remoteUserMediaState[user.id] = {isCamMute: false, isMicMute: false}
          }
        })
    })

    this._videoRoomService.remoteUserAudioTrack$.pipe(
      map((streamObj) => {
        return Object.entries(streamObj).map(([key, value]) => ({id: key, stream: value, talking: false}));
      })
    ).subscribe((streamObj) => {
       this.remoteUserAudioStream = streamObj;
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
    this._videoRoomService.initialJanusInstance(this.onSuccessStream.bind(this))
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
    this._videoRoomService.initialJanusInstance(this.onSuccessStream);
  }

  stopShareScreen() {
    JanusUtil.endScreenShare(() => {
      this.screenShare.nativeElement.srcObject = null;
    })
  }
}
