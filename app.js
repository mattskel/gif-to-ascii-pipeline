import {get} from 'https';
import { 
  // HeaderTransform, 
  // FrameHeaderTransform, 
  // FrameImageTransform, 
  // GreyScaleTransform,
  GreyScaleTransform,
  CompressionTransform,
  AsciiTransform,
  PulseTransform,
  CanvasTransform,
} from './myTransforms.js';
import {
  HeaderTransform, 
  FrameHeaderTransform, 
  FrameImageTransform, 
  ColorTransform,
} from './lwzTransforms.js';
import { pipeline } from 'stream';

function myTransform(url, _res, io) {
  get(url, (res) => {
    const frames = [];
    const myObject = {};
    myObject.delayTimes = []; 
    myObject.imagePositions = [];
    myObject.codeSizes = [];
    myObject.frames = [];
    myObject.canvasDataUrls = [];
    myObject.transparentColors = [];
    myObject.comments = [];
    myObject.localColorTables = [];

    const frameStream = pipeline(
      res,  
      new HeaderTransform(myObject),
      new FrameHeaderTransform(myObject),
      new FrameImageTransform(myObject),
      new ColorTransform(myObject),
      (err) => {
        if (!err) {
          return;
        }

        console.log('err', err);
        _res.status(500).send({ error: 'something blew up' })
        _res.end();
      }
    );

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
        io.emit('asciiFrame', data.toString());
      })
      .on('finish', () => {
        // need to extract the delays from the frames
        const delays = frames
          .map(({delay}) => delay);
        _res.status(200).send(delays)
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