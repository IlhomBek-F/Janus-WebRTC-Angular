import {  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Output, ViewChild, type OnInit } from '@angular/core';
import { JanusVideoRoomService } from '../../services/janus-video-room.service';
import { JanusUtil } from '../../utils';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-local-user-stream',
  standalone: true,
  imports: [NzPopoverModule, NzButtonModule],
  templateUrl: './local-user-stream.component.html',
  styleUrl: './local-user-stream.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalUserStreamComponent implements OnInit {
  @ViewChild('localVideo', { static: true }) localVideoElement!: ElementRef<HTMLVideoElement>;
  @Output() startShareScreen  = new EventEmitter()
  @Output() stopShareScreen  = new EventEmitter()

  visible = false;

  constructor(
    private _videoRoomService: JanusVideoRoomService,
    private _cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.handleLocalUserTrack();
    this.handlePiPWindow();
  }

    handleLocalUserTrack() {
    this._videoRoomService.localTrack$
    .subscribe((track: MediaStreamTrack) => {
      const localVideoElement = this.localVideoElement.nativeElement
      if(localVideoElement.srcObject) {
        (localVideoElement.srcObject as MediaStream).addTrack(track);
      } else {
        const stream = new MediaStream([track]);
        localVideoElement.srcObject = stream;
      }

      this._cdr.markForCheck()
    });
  }

  handlePiPWindow() {
    document.addEventListener('visibilitychange', async (e) => {
      if(document.visibilityState === 'hidden') {
       await this.enterPiP()
      }
    })
  }

  async enterPiP() {
    if (document.pictureInPictureEnabled && this.localVideoElement.nativeElement) {
    this.localVideoElement.nativeElement.requestPictureInPicture()
    } else {
      console.warn('Picture-in-Picture is not supported or enabled in this browser.');
    }
  }

  toggleLocalUserMic() {
      JanusUtil.toggleLocalUserMic();
    }

    toggleLocalUserCam() {
      JanusUtil.toggleLocalUserCam();
    }
}
