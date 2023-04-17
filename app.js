import {get} from 'https';
import http from 'http';
import express from 'express';
import path from 'path';
import {Server} from 'socket.io';
import { Transform } from 'stream';

const asciiScale = ' .,:ilwW'
let currentCodeSize;
let globalColorTable;
let _gifWidth;
let _gifHeight;
let delayTimes = [];
let imagePositions = [];
const widthCompression = 5;
const heightCompression = 10;
let rowReturn;
let gifBackground;
let frames = [];
let buffer;
const codeSizes = [];


class _ForkTransform extends Transform {
  constructor(options) {
    super(options);
    this.previousTail = Buffer.alloc(0);
    this.identifier;
    this.subType;
    this.frame = {index: 0};
    this.blocks = [];
    this.count = 0;
  }

  _transform(chunk, encoding, callback) {
    let index = 0;
    buffer = Buffer.concat([this.previousTail, chunk]);
    

    if (this.identifier === undefined) {
      this.identifier = buffer[index++];
    }

    while (this.identifier !== undefined) {

      /// EOF
      if (this.identifier === 0x3b) {
        callback();
        return;
      }

      // 0x21 Meta data identifier
      if (this.identifier === 0x21) {
        if (this.subType === undefined) {
          this.subType = buffer[index++];
        }

        // 0xf9 Graphic Control Extension
        if (this.subType === 0xf9) {
          let subBlockLength = buffer[index++];
          if (subBlockLength !== 0x04) {
            throw new Error('Invalid metadata block');
          }

          if (buffer.length - index < subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          const options = buffer[index++];
          const delayTime = buffer[index++] | (buffer[index++] << 8);
          delayTimes.push(delayTime);
          const transparentColor = buffer[index++];
          const terminator = buffer[index++];
          if (terminator !== 0x00) {
            throw new Error('Invalid metadata block');
          }

          this.subType = undefined;
        } 
        this.identifier = buffer[index++];
      }

      // LWZ image
      if (this.identifier === 0x2c) {
        const blockSize = 9;
        if (buffer.length - index < blockSize) {
          this.previousTail = buffer.slice(index);
          callback();
          return;
        }
        
        if (this.subBlockLength === undefined) {
          const left = buffer[index++] | (buffer[index++] << 8);
          const top = buffer[index++] | (buffer[index++] << 8);
          const width = buffer[index++] | (buffer[index++] << 8);
          const height = buffer[index++] | (buffer[index++] << 8);
          imagePositions.push({left, top, width, height});
          const flags = buffer[index++];
        }

        // For now assume that the global color table is used
        // But in future will have to account for the size of the colour table here

        if (buffer.length - index < 2) {
          this.previousTail = buffer.slice(index);
          callback();
          return;
        }

        if (this.subBlockLength === undefined) {
          this.codeSize = buffer[index++];
          let N = this.codeSize
          codeSizes.push(N);
        }

        if (this.previousTail.length > 0) {
          this.previousTail = Buffer.alloc(0);
        } else {
          this.subBlockLength = buffer[index++];
        }

        while (this.subBlockLength !== 0) {
          if (buffer.length - index < this.subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          const data = buffer.slice(index, index + this.subBlockLength);
          this.blocks.push(data);
          index += this.subBlockLength;
          if (index >= buffer.length) {
            break;
          }

          this.subBlockLength = buffer[index++];
        }

        if (this.subBlockLength === 0) {
          const _buffer = Buffer.concat(this.blocks);
          this.push(_buffer);
          this.subBlockLength = undefined;
          this.blocks = [];
          this.identifier = buffer[index++];
        }
      }
    }

    callback();

  }
}

class __ForkTransform extends Transform {
  constructor(options) {
    super(options);
  }

  _transform(chunk, encoding, callback) {
    const subBlockLength = chunk.length;
    const indexStream = [];
    const N = codeSizes.shift();
    const clear_code = 2 ** N;
    const eoi_code = 2 ** N + 1;

    let currentCodeSize = N + 1;
    let binString = '';
    let code_table;
    let code;
    let prev_code;
    let next_code;
    let k;
    if (subBlockLength !== 0) {
      const subBlock = chunk;
      let subIndex = 0;
      while (subIndex < subBlockLength) {
        binString = subBlock[subIndex++].toString(2).padStart(8, '0') + binString;
        if (binString.length >= currentCodeSize) {
          let _tmp = binString.slice(-currentCodeSize);
          code = parseInt(_tmp, 2);
          binString = binString.slice(0, -currentCodeSize);

          if ( code === clear_code) {
            // Initialise the code table
            code_table = new Array(4096);
            for (let i = 0; i < clear_code; i++) {
              code_table[i] = [i];
            }
            next_code = eoi_code + 1;
            k = undefined;
            code_table[ code] = [];
            currentCodeSize = N + 1;
            prev_code = undefined;
            continue;
          } else if ( code === eoi_code) {
            break;
          } else if (code_table[code] !== undefined) {
            // output goes here
            indexStream.push(...code_table[code]);
            k = code_table[code][0];
            if (prev_code === undefined) {
              prev_code =  code;
              continue;
            }
          } else {
            k = code_table[prev_code][0];
            indexStream.push(...code_table[prev_code], k);
          }

          if (code_table[prev_code] === undefined) {
            throw new Error('Something went wrong');
          }

          if (next_code === 2 ** currentCodeSize - 1 && currentCodeSize < 12) {
            currentCodeSize++;
          }

          if (next_code < 4096) {
            code_table[next_code++] = [...code_table[prev_code], k];
            prev_code = code;
          }
        }
      }

      this.push(Buffer.from(indexStream));
      callback();
    } else {
      // reached the end of the frame
      callback();
    }
  }
}

// A class that transforms byte array into gif
class GIFTransform extends Transform {
  constructor(options) {
    super(options);
  }

  _transform(chunk, encoding, callback) {
    const buffer = Buffer.from(chunk);
    const gifHeader = chunk.slice(0, 3);
    if (gifHeader.toString() !== 'GIF') {
      this.push(buffer);
      callback();
      return;
    }
    const gifVersion = chunk.slice(3, 6);
    const gifWidth = chunk.readUInt16LE(6);
    _gifWidth = gifWidth;
    const gifHeight = chunk.readUInt16LE(8);
    _gifHeight = gifHeight;
    rowReturn = _gifHeight / heightCompression

    const gifField = chunk.readUInt8(10);
    const colorTableStart = 10;
    const colorTableInfo = chunk.slice(colorTableStart, colorTableStart + 1);

    let _byte = '';
    for (let i = 7; i >= 0; i--) {
      const bit = (gifField >> i) & 1;
      _byte += bit;
    }
    const colorTableBits = colorTableInfo[0].toString(2).padStart(8, '0')
    const globalColorTableFlag = _byte[0];
    const colorResolution = _byte.slice(1, 4);
    const sortFlag = _byte[4];
    const sizeOfGlobalColorTable = _byte.slice(5, 8);

    gifBackground = chunk.readUInt8(11);
    const gifAspectRatio = chunk.readUInt8(12);

    // If the global color table flag is set to 1
    // then we need to read the global color table
    let sizeOfGlobalColorTableInBytes3 = 0;
    if (globalColorTableFlag === '1') {
      // The size of the global color table is determined by the size of global color table field
      // convert sizeOfGlobalColorTable from binary to integer
      const sizeOfGlobalColorTableInt = parseInt(sizeOfGlobalColorTable, 2);
      // The size of the global color table is 2^(sizeOfGlobalColorTableInt + 1)
      const sizeOfGlobalColorTableInBytes = 2 ** (sizeOfGlobalColorTableInt + 1);
      // The size of the global color table is 3 * sizeOfGlobalColorTableInBytes
      sizeOfGlobalColorTableInBytes3 = 3 * sizeOfGlobalColorTableInBytes;
    }

    // Map the global color table
    globalColorTable = chunk.slice(13, 13 + sizeOfGlobalColorTableInBytes3);

    // Get the start of the image descriptor
    const _imageDescriptorStart = 13 + sizeOfGlobalColorTableInBytes3;
    const imageDescriptor = chunk.slice(_imageDescriptorStart, _imageDescriptorStart + 1);
    
    // check if the imageDescriptor value is 0x21
    // If it is then we have metadata block
    let graphicControlExtensionStart = 0;
    if (imageDescriptor.toString() === '!') {
      // Get the start of the metadata block
      const metadataBlockStart = _imageDescriptorStart + 1;
      // Get the subType of the metadata block
      const metadataBlockSubType = chunk.slice(metadataBlockStart, metadataBlockStart + 1);

      // If the subType is 0xFF then we have an application extension
      if (metadataBlockSubType.readUInt8(0) === 255) {
        // The app indent is always 11 bytes long
        // const appIndent = chunk.slice(metadataBlockStart, metadataBlockStart + 32);
        // If the first 8 bytes are NETSCAPE then we have a netscape extension

        const blockSizeStart = metadataBlockStart + 1;
        const blockSize = chunk.slice(blockSizeStart, blockSizeStart + 1);

        const appIdentifierStart = blockSizeStart + 1;
        const appIdentifier = chunk.slice(appIdentifierStart, appIdentifierStart + 8);

        const appAuthenticationCodeStart = appIdentifierStart + 8;
        const appAuthenticationCode = chunk.slice(appAuthenticationCodeStart, appAuthenticationCodeStart + 3);

        const appDataStart = appAuthenticationCodeStart + 3;
        const appData = chunk.slice(appDataStart, appDataStart + 4);

        const extensionTerminatorStart = appDataStart + 4;
        const extensionTerminator = chunk.slice(extensionTerminatorStart, extensionTerminatorStart + 1);

        const foo = chunk.slice(extensionTerminatorStart + 1);
        graphicControlExtensionStart = extensionTerminatorStart + 1;

      }

      this.push(chunk.slice(graphicControlExtensionStart));
      callback();
      return;
    }
    callback();
  }
}

class FooTransform extends Transform {
  constructor(options) {
    super(options);
  }

  _transform(chunk, encoding, callback) {
    // chunk represents a single image with dimensions gifWidth x gifHeight
    // First need to transform the chunk into the rgb from the color table
    // Then we need to transform the rgb values into greyscale
    let greyscaleBuffer = Buffer.alloc(chunk.length);
    for (let i = 0; i < chunk.length; i++) {
      const colorIndex = chunk[i] * 3;
      const rgb = globalColorTable.slice(colorIndex, colorIndex + 3);
      const greyscale = Math.round(rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114);
      greyscaleBuffer[i] = greyscale;
    }

    this.push(greyscaleBuffer);
    callback();
  }
}

class FrameTransform extends Transform {
  constructor(options) {
    super(options);
    this.frame;
  }

  _transform(chunk, encoding, callback) {
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

class BarTransform extends Transform {
  constructor(options) {
    super(options);
  }

  _transform(chunk, encoding, callback) {
    const pixelSize = widthCompression;
    const pixelSizeHeight = heightCompression;
    let compressions = Buffer.alloc((_gifWidth * _gifHeight)/(pixelSize * pixelSizeHeight));
    let index = 0;
    for (let i = 0; i < _gifHeight; i+=pixelSizeHeight) {
      for (let j = 0; j < _gifWidth; j+=pixelSize) {
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

class AsciiTransform extends Transform {
  constructor(options) {
    super(options);
  }

  _transform(chunk, encoding, callback) {
    const rows = [];
    let rowString = '';
    for (let i = 0; i < chunk.length; i++) {
      const asciiIndex = Math.round(chunk[i] / 255 * (asciiScale.length - 1));
      rowString = rowString + asciiScale[asciiIndex];
      if ((i + 1) % (_gifWidth / widthCompression) === 0) {
        rows.push(rowString);
        rowString = '';
      }
    }
    this.push(rows.join('\n'));
    callback();
    
  }
}

// A transformer class that will take a stream of bytes and output a stream of frames
// And apply a delay between each frame
class PulseTransform extends Transform {
  constructor(options) {
    super(options);
    this.frames = []
  }

  _transform(chunk, encoding, callback) {
    this.push(chunk);
    // this.push(`\u001b[${rowReturn - 1}A`)
    // this.push('\r');
    const delay = delayTimes.shift();
    frames.push({chunk, delay})
    setTimeout(() => {
      callback();
    }, delay * 10);
  }

}

function _tmp(chunk, encoding, push, callback) {
  
  const subBlockLength = chunk.length;
  const indexStream = [];
  const N = codeSizes.shift();
  const clear_code = 2 ** N;
  const eoi_code = 2 ** N + 1;

  let currentCodeSize = N + 1;
  let binString = '';
  let code_table;
  let code;
  let prev_code;
  let next_code;
  let k;
  if (subBlockLength !== 0) {
    const subBlock = chunk;
    let subIndex = 0;
    while (subIndex < subBlockLength) {
      binString = subBlock[subIndex++].toString(2).padStart(8, '0') + binString;
      if (binString.length >= currentCodeSize) {
        let _tmp = binString.slice(-currentCodeSize);
        code = parseInt(_tmp, 2);
        binString = binString.slice(0, -currentCodeSize);

        if ( code === clear_code) {
          // Initialise the code table
          code_table = new Array(4096);
          for (let i = 0; i < clear_code; i++) {
            code_table[i] = [i];
          }
          next_code = eoi_code + 1;
          k = undefined;
          code_table[ code] = [];
          currentCodeSize = N + 1;
          prev_code = undefined;
          continue;
        } else if ( code === eoi_code) {
          break;
        } else if (code_table[code] !== undefined) {
          // output goes here
          indexStream.push(...code_table[code]);
          k = code_table[code][0];
          if (prev_code === undefined) {
            prev_code =  code;
            continue;
          }
        } else {
          k = code_table[prev_code][0];
          indexStream.push(...code_table[prev_code], k);
        }

        if (code_table[prev_code] === undefined) {
          throw new Error('Something went wrong');
        }

        if (next_code === 2 ** currentCodeSize - 1 && currentCodeSize < 12) {
          currentCodeSize++;
        }

        if (next_code < 4096) {
          code_table[next_code++] = [...code_table[prev_code], k];
          prev_code = code;
        }
      }
    }

    push(Buffer.from(indexStream));
    return callback();
  } else {
    // reached the end of the frame
    callback();
  }
}

class ParralelTransform extends Transform {
  constructor(_tmp, options) {
    super(options);
    this._tmp = _tmp;
    this.running = 0;
    this.terminateCallback = null;
  }

  _transform(chunk, encoding, callback) {
    this.running++;
    setTimeout(() => {
      _tmp(chunk, encoding, this.push.bind(this), this._onComplete.bind(this));
    });
    callback();
  }

  _flush(callback) {
    if (this.running > 0) {
      this.terminateCallback = callback;
    } else {
      callback();
    }
  }

  _onComplete(err) {
    this.running--;
    if (err) {
      this.emit('error', err);
    }
    if (this.running === 0) {
      this.terminateCallback && this.terminateCallback();
    }
  }
}

const app = express();
const __dirname = path.resolve();
const server = http.createServer(app);
const io = new Server(server);

// get('https://media.giphy.com/media/8YNxrDHjOFE7qZKXS5/giphy.gif', (res) => {
get('https://media.giphy.com/media/3o7527pa7qs9kCG78A/giphy.gif', (res) => {
  const stream = res  
    .pipe(new GIFTransform())
    .pipe(new _ForkTransform())
    .pipe(new __ForkTransform())
    // .pipe(new ParralelTransform(_tmp))
    .pipe(new FooTransform())
    .pipe(new FrameTransform())
    .pipe(new BarTransform())
    .pipe(new AsciiTransform())
    .pipe(new PulseTransform())
    .on('data', async (data) => {
      io.emit('frame', data.toString());
    })
    // .pipe(process.stdout)
    // .on('error', (err) => {
    //   if (err) {
    //     console.log(err)
    //   }
    // })
    .on('finish', async () => {
      console.log('done');
      let i = 0;
      while (i < frames.length) {
        const {chunk, delay} = frames[i];
        await new Promise((resolve) => {
          io.emit('frame', chunk.toString());
          setTimeout(resolve, delay * 10);
        });

        i = (i + 1) % frames.length;
      }
    })

  res.on('end', () => {
    console.log('response finished');
  });  
})
  .on('error', (err) => {
    if (err) {
      console.log(err);
    }
  })



app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});