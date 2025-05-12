import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, QueryList, ViewChildren, type OnInit } from '@angular/core';
import { JanusVideoRoomService } from '../../services/janus-video-room.service';
import { CommonModule } from '@angular/common';
import { NzPopoverModule } from 'ng-zorro-antd/popover';

@Component({
  selector: 'app-remote-users-stream',
  standalone: true,
  imports: [CommonModule, NzPopoverModule],
  templateUrl: './remote-users-stream.component.html',
  styleUrl: './remote-users-stream.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteUsersStreamComponent implements OnInit {
  @ViewChildren('remoteVideo') remoteVideoRefs: QueryList<ElementRef<HTMLVideoElement>>

  remoteUserStream: { id: number; stream: MediaStream, talking: boolean, name: string }[] = [];
  remoteUserAudioStream!: { id: string; stream: MediaStream, talking: boolean }[];
  remoteUserMediaState: Record<string, { isCamMute: boolean; isMicMute: boolean }> = {};

  visible = false;

  constructor(private _videoRoomService: JanusVideoRoomService, private _cdr: ChangeDetectorRef) {

  }

  ngOnInit(): void {
    this.handleRemoteUserTrack();
    this.handleUserTalkingStatus();
  }

   handleRemoteUserTrack() {
    this._videoRoomService.remoteUserTrack$
      .subscribe((streamObj: {id: number, track: MediaStreamTrack, name: string}) => {
        const existStream = this.remoteUserStream.findIndex(({id}) => +id === streamObj.id);

        if(existStream === -1) {
          const stream = new MediaStream();
          stream.addTrack(streamObj.track);
          this.remoteUserStream.push({id: streamObj.id, stream, talking: false, name: streamObj.name})
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

        this._cdr.markForCheck();
    })

    // this._videoRoomService.remoteUserAudioTrack$.pipe(
    //   map((streamObj) => {
    //     return Object.entries(streamObj).map(([key, value]) => ({id: key, stream: value, talking: false}));
    //   })
    // ).subscribe((streamObj) => {
    //    this.remoteUserAudioStream = streamObj;
    // })
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

}
