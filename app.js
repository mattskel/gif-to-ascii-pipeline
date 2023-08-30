import {get} from 'https';
// import express from 'express';
import { 
  HeaderTransform, 
  FrameHeaderTransform, 
  FrameImageTransform, 
  GreyScaleTransform,
  CompressionTransform,
  AsciiTransform,
  PulseTransform,
  ColorTransform,
  CanvasTransform,
} from './myTransforms.js';
import { pipeline } from 'stream';

const fixedLength = 4;
function myTransform(url, _res, io) {
  get(url, (res) => {
    const frames = [];
    const myObject = {};
    myObject.delayTimes = []; 
    myObject.imagePositions = [];
    myObject.codeSizes = [];
    myObject.widthCompression = 8;
    myObject.heightCompression = 8;
    myObject.frames = [];
    myObject.canvasDataUrls = [];
    myObject.transparentColors = [];
    myObject.comments = [];
    myObject.localColorTables = [];
    // const frameStream = res  
    //   .pipe(new HeaderTransform(myObject))
    //   .pipe(new FrameHeaderTransform(myObject))
    //   .pipe(new FrameImageTransform(myObject))
    //   .pipe(new ColorTransform(myObject))
    //   .on('error', (err) => {
    //     _res.status(500).send({ error: 'something blew up' })
    //     _res.end();

    //     return;
    //   });
    // _res.status(200);
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
        _res.status(500).json({ error: 'something blew up' })
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
        // const buffer = Buffer.allocUnsafe(fixedLength);
        // buffer.writeInt32LE(data.length, 0);
        // _res.write(Buffer.concat([buffer, data]))
        io.emit('asciiFrame', data.toString());
      })
      .on('finish', () => {
        // need to extract the delays from the frames
        const delays = frames
          .map(({delay}) => delay);

        // const buffer = Buffer.allocUnsafe(fixedLength);
        // buffer.writeInt32LE(delays.length, 0);
        // _res.write(Buffer.concat([buffer, new Uint8Array(delays)]));
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