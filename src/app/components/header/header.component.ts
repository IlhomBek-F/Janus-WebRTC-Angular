import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { JanusVideoRoomService } from '../../services/janus-video-room.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserTypeEnum } from '../../core/enums';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [FormsModule, NzButtonModule, NzInputModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  roomId: number;
  hostName='';
  remoteUsername = '';

  isLoading = false;
  isJoining = false;

  constructor(
    private _videoRoomService: JanusVideoRoomService,
    private message: NzMessageService,
  ){}

    onSuccessStream(roomId: number) {
    this.roomId = roomId;
    this.isLoading = false;
    this.isJoining = false;
    // this.initialVirtualBackground();
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


  private initialJanus() {
    this._videoRoomService.initialJanusInstance(this.onSuccessStream.bind(this), {hostName: this.hostName, userName: this.remoteUsername})
  }
}
