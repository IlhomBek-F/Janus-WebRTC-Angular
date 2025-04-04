import { Injectable } from '@angular/core';
import Janus from 'janus-gateway';
import { JanusUtil } from '../utils';
import { JanusPluginEnum, UserTypeEnum } from '../core/enums';

// const serverUrl = 'http://185.221.214.97:8088/janus';
const serverUrl = 'http://34.57.163.85:8088/janus';

@Injectable({ providedIn: 'root' })
export class JanusVideoRoomService {
  janusRef: Janus;
  pluginRef: any;
  roomId: number;
  userType = UserTypeEnum.Admin; // Default to Admin

  initialJanusInstance() {
    Janus.init({
      debug: 'all',
      callback: () => {
        if (!Janus.isWebrtcSupported()) {
          alert('No WebRTC support... ');
          return;
        }

        this.janusRef = this.createJanusInstance();
      },
    });
  }

  createJanusInstance() {
    return new Janus({
      server: serverUrl,
      success: () => this.userType === UserTypeEnum.Admin ? this.attachAdminPlugin() : this.attachUserPlugin(),
    });
  }

  attachUserPlugin() {
    this.janusRef.attach({
      plugin: JanusPluginEnum.VideoRoom,
      success: (plugin: any) => {
        JanusUtil.setPlugin(plugin);
        const publisherOption = {
          request: 'join',
          ptype: 'publisher',
          display: 'User Admin',
          permanent: false, // Set to true if you want it to persist
          publishers: 10, // Max participants
          bitrate: 128000,
          fir_freq: 10,
          audiocodec: 'opus',
          videocodec: 'vp8',
          room: this.roomId,
        };

        plugin.send({
          message: publisherOption,
          success: (message: any) => {
            console.log('Joining room:', this.roomId);
            this.joinRoom(this.roomId);
          },
        });
      },
      error(error) {
        console.error('Error attaching plugin:', error);
      },
      onmessage: (message: any, jsep: any) => {

      },
      onlocaltrack: (track, on) => {

      },
    });
  }


  attachAdminPlugin() {
    this.janusRef.attach({
      plugin: JanusPluginEnum.VideoRoom,
      success: (plugin: any) => {
        JanusUtil.setPlugin(plugin);
        const publisherOption = {
          request: 'create',
          ptype: 'publisher',
          display: 'User Admin',
          permanent: false, // Set to true if you want it to persist
          publishers: 10, // Max participants
          bitrate: 128000,
          fir_freq: 10,
          audiocodec: 'opus',
          videocodec: 'vp8',
        };

        plugin.send({
          message: publisherOption,
          success: (message: any) => {
            this.roomId = message.room;
            console.log('Joining room:', this.roomId);
            this.joinRoom(this.roomId);
          },
        });
      },
      error(error) {
        console.error('Error attaching plugin:', error);
      },
      onmessage: (message: any, jsep: any) => {

      },
      onlocaltrack: (track, on) => {

      },
    });
  }

  joinRoom(roomId: number) {
    console.log('Joining room:', roomId);
    JanusUtil.pluginHandler.send({
      message: {
        request: 'join',
        room: roomId,
        ptype: 'publisher',
        display: 'AngularUser',
      },
    });
  }
}
