import { Injectable } from '@angular/core';
import Janus from 'janus-gateway';
import { JanusPlugin } from '../core/enums';

const serverUrl = 'http://185.221.214.97:8088/janus';

@Injectable({ providedIn: 'root' })
export class JanusVideoRoomService {
  janusRef: Janus;
  pluginRef: any;
  roomId: number;

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
      success: () => this.attachPlugin(),
    });
  }

  attachPlugin() {
    this.janusRef.attach({
      plugin: JanusPlugin.VideoRoom,
      success: (plugin: any) => {
        this.pluginRef = plugin;
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
            // After creating room needs to join
            console.log('Joining room:', this.roomId);
            this.pluginRef.send({
              message: {
                request: 'join',
                room: this.roomId,
                ptype: 'publisher',
                display: 'User Admin',
              },
            });
          },
        });
      },
    });
  }
}
