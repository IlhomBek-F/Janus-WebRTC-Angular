import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, QueryList, ViewChildren, type OnInit } from '@angular/core';
import { JanusVideoRoomService } from '../../services/janus-video-room.service';
import { CommonModule } from '@angular/common';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-remote-users-stream',
  standalone: true,
  imports: [CommonModule, NzPopoverModule, NzButtonModule],
  templateUrl: './remote-users-stream.component.html',
  styleUrl: './remote-users-stream.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteUsersStreamComponent implements OnInit {
  @ViewChildren('remoteVideo') remoteVideoRefs: QueryList<ElementRef<HTMLVideoElement>>
  @ViewChildren('remoteAudio') remoteAudioRefs: QueryList<ElementRef<HTMLAudioElement>>

  remoteUserStream: { id: number; stream: MediaStream, talking: boolean, name: string, audioStream?: MediaStream }[] = [];
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
          this.remoteUserStream.push({id: streamObj.id, stream, talking: false, name: streamObj.name, audioStream: null})
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

    this._videoRoomService.remoteUserAudioTrack$.pipe(
    ).subscribe((streamObj) => {
        const existStream = this.remoteUserStream.find(({id}) => +id === streamObj.id);

        if(!existStream?.audioStream) {
           const stream = new MediaStream();
           stream.addTrack(streamObj.track);

           if(!existStream) {
              this.remoteUserStream.push({id: streamObj.id, stream: null, talking: false, name: 'asdasd', audioStream: stream})
           }else {
             existStream.audioStream = stream;
           }
        }

         (this.remoteAudioRefs || [])?.forEach((audioEl, i) => {
            if(existStream.audioStream) {
              (audioEl.nativeElement.srcObject as MediaStream).addTrack(streamObj.track)
            } else {
              const stream = new MediaStream();
              stream.addTrack(streamObj.track);
              audioEl.nativeElement.srcObject = stream;
            }
          });

                  this._cdr.markForCheck();
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

}
