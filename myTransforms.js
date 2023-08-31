import { Transform } from 'stream';
import { createCanvas, createImageData, Image } from 'canvas';

const asciiScale = ' .,:;irsXA253hMHGS#9B&@';

export class GreyScaleTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
  }

  _transform(chunk, encoding, callback) {
    const {width, height} = this.gifObject;
    let greyscaleBuffer = Buffer.alloc(height * width);
    for (let i = 0; i < greyscaleBuffer.length; i++) {
      const [r, g, b, a] = chunk.slice(i * 4, i * 4 + 4);
      const greyscale = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
      greyscaleBuffer[i] = greyscale;
    }

    this.push(greyscaleBuffer);
    callback();
  }
}

export class CompressionTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
  }

  _transform(chunk, encoding, callback) {
    const {width: _gifWidth, height: _gifHeight, widthCompression, heightCompression} = this.gifObject;
    const pixelSize = widthCompression;
    const pixelSizeHeight = heightCompression;
    
    const {compressedWidth, compressedHeight} = this.gifObject;
    let compressions = Buffer.alloc(compressedWidth * compressedHeight);
    let index = 0;
    for (let i = 0; i <= _gifHeight - pixelSizeHeight; i+=pixelSizeHeight) {
      for (let j = 0; j <= _gifWidth - pixelSize; j+=pixelSize) {
        let greySum = 0;
        for (let k = 0; k < pixelSizeHeight; k++) {
          for (let l = 0; l < pixelSize; l++) {
            greySum += chunk[i * _gifWidth + j + k * _gifWidth + l];
          }
        }

        const greyAvg = greySum / (pixelSize * pixelSizeHeight);
        compressions[index++] = greyAvg
      }
    }

    this.push(compressions);
    callback();
  }
}

export class AsciiTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
  }

  _transform(chunk, encoding, callback) {
    const {compressedWidth} = this.gifObject;
    const rows = [];
    let rowString = '';
    for (let i = 0; i < chunk.length; i++) {
      const asciiIndex = Math.round(chunk[i] / 255 * (asciiScale.length - 1));
      rowString = rowString + asciiScale[asciiIndex];
      if ((i + 1) % (compressedWidth) === 0) {
        rows.push(rowString);
        rowString = '';
      }
    }
    this.push(rows.join('\n'));
    callback();
  }
}

export class PulseTransform extends Transform {
  constructor(gifObject, frames, options) {
    super(options);
    this.gifObject = gifObject
    this.frames = frames;
  }

  _transform(chunk, encoding, callback) {
    const {delayTimes} = this.gifObject;
    this.push(chunk);
    const delay = delayTimes.shift();
    this.frames.push({chunk, delay})
    setTimeout(() => {
      callback();
    }, delay * 10);
  }
}

export class CanvasTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
    this.previousTail = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    const {width, height} = this.gifObject;
    const arraySize = width * height * 4
    // Convert chunk to a Uint8ClampedArray

    const buffer = Buffer.concat([this.previousTail, chunk]);
    if (buffer.length === arraySize) {
      this.previousTail = Buffer.alloc(0);
    } else {
      this.previousTail = buffer;
      callback();
      return
    }
    const myImg = createImageData(new Uint8ClampedArray(buffer), width, height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.putImageData(myImg, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    this.push(dataUrl);
    callback();
  }
}