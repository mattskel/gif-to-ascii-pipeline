import {get} from 'https';
import http from 'http';
import express from 'express';
import path from 'path';
import {Server} from 'socket.io';
import { Transform } from 'stream';
import { 
  HeaderTransform, 
  FrameHeaderTransform, 
  FrameImageTransform, 
  GreyScaleTransform,
  CompressionTransform,
  AsciiTransform,
  PulseTransform,
  ColorTransform,
  RGBTransform,
  CanvasTransform,
} from './myTransforms.js';

let frames = [];
const myObject = {
  // delayTimes: [], 
  // imagePositions: [], 
  // codeSizes: [],
  // widthCompression: 5,
  // heightCompression: 10,
  // frames: [],
};

// const headerTransform = new HeaderTransform(myObject);
// const frameHeaderTransform = new FrameHeaderTransform(myObject);
// const frameImageTransform = new FrameImageTransform(myObject);
// const greyScaleTransform = new GreyScaleTransform(myObject);
// const compressionTransform = new CompressionTransform(myObject);
// const asciiTransform = new AsciiTransform(myObject);
// const pulseTransform = new PulseTransform(myObject, frames);

class FrameTransform extends Transform {
  constructor(myObject, options) {
    super(options);
    this.frame;
    this.myObject = myObject;
  }

  _transform(chunk, encoding, callback) {
    const {width: _gifWidth, height: _gifHeight, gifBackground, imagePositions} = this.myObject;
    if (!this.frame) {
      this.frame = new Array(_gifWidth * _gifHeight).fill(gifBackground);
    }

    const {top, left, width, height} = imagePositions.shift();
    const initIndex = top * _gifWidth + left;
    for (let i = 0; i < height; i++) {
      const index = initIndex + i * _gifWidth;
      this.frame.splice(index, width, ...chunk.slice(i * width, i * width + width));
    }

    this.push(Buffer.from(this.frame));
    callback();
  }
}

const app = express();
const __dirname = path.resolve();
const server = http.createServer(app);
// const io = new Server(server);

// get('https://media.giphy.com/media/8YNxrDHjOFE7qZKXS5/giphy.gif', (res) => {
// get('https://media.giphy.com/media/3o7527pa7qs9kCG78A/giphy.gif', (res) => {
function myTransform(url, _res, io) {
  
  // frames = [];
  get(url, (res) => {
    frames = [];
    myObject.delayTimes = []; 
    myObject.imagePositions = [];
    myObject.codeSizes = [];
    myObject.widthCompression = 5;
    myObject.heightCompression = 5;
    myObject.frames = [];
    myObject.canvasDataUrls = [];
    myObject.transparentColors = [];
    const frameStream = res  
      .pipe(new HeaderTransform(myObject))
      .pipe(new FrameHeaderTransform(myObject))
      .pipe(new FrameImageTransform(myObject))
      .pipe(new ColorTransform(myObject))

      frameStream
        .pipe(new CanvasTransform(myObject))
        .on('data', (data) => {
          io.emit('colorFrame', data.toString());
        });

      frameStream
        .pipe(new GreyScaleTransform(myObject))
        .pipe(new CompressionTransform(myObject))
        .pipe(new AsciiTransform(myObject))
        .pipe(new PulseTransform(myObject, frames))
        .on('data', (data) => {
          _res.write(data.toString());
        })
        .on('finish', () => {
          // need to extract the delays from the frames
          const delays = frames
            .map(({delay}) => delay);

          const framesString = JSON.stringify(delays);
          _res.write(framesString);
          _res.end();
        })
  })
    .on('error', (err) => {
      if (err) {
        console.log(err);
      }
    })
}

export default myTransform;



// app.get('/', (req, res) => {
//   res.sendFile(__dirname + '/index.html');
// });

// server.listen(3000, () => {
//   console.log('listening on *:3000');
// });