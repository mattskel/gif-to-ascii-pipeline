import { Transform } from 'stream';
import { createCanvas, createImageData, Image } from 'canvas';

const asciiScale = ' .,:;irsXA253hMHGS#9B&@';

export class HeaderTransform extends Transform {
  constructor(
    myObject,
    options
  ) {
    super(options);
    this.myObject = myObject;
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
    this.myObject.width = gifWidth;
    const gifHeight = chunk.readUInt16LE(8);
    this.myObject.height = gifHeight;

    const characterSize = 5.75;
    const viewWidth = 400;
    const compression = Math.floor(characterSize * gifWidth / viewWidth);
    const compressedWidth = (gifWidth - (gifWidth % compression)) / compression;
    const compressedHeight = (gifHeight - (gifHeight % compression)) / compression;

    this.myObject.compressedWidth = compressedWidth;
    this.myObject.compressedHeight = compressedHeight;
    this.myObject.widthCompression = compression;
    this.myObject.heightCompression = compression;

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

    this.myObject.gifBackground = chunk.readUInt8(11);
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
    const globalColorTable = chunk.slice(13, 13 + sizeOfGlobalColorTableInBytes3);
    this.myObject.globalColorTable = globalColorTable;

    // Get the start of the image descriptor
    const _imageDescriptorStart = 13 + sizeOfGlobalColorTableInBytes3;
    const imageDescriptor = chunk.slice(_imageDescriptorStart, _imageDescriptorStart + 1);
    
    // check if the imageDescriptor value is 0x21
    // If it is then we have metadata block
    // let graphicControlExtensionStart = _imageDescriptorStart + 1;
    let graphicControlExtensionStart = _imageDescriptorStart;
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

export class FrameHeaderTransform extends Transform {
  constructor(myObject, options) {
    super(options);
    this.previousTail = Buffer.alloc(0);
    this.identifier;
    this.subType;
    this.frame = {index: 0};
    this.blocks = [];
    this.count = 0;
    this.myObject = myObject;
  }

  _transform(chunk, encoding, callback) {
    let index = 0;
    const buffer = Buffer.concat([this.previousTail, chunk]);
    if (buffer.length < 1) {
      callback();
      return;
    }
    
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
        if (buffer.length - index < 1) {
          this.previousTail = buffer.slice(index);
          callback();
          return;
        }
        if (this.subType === undefined && buffer.length - index >= 1) {
          this.subType = buffer[index++];
        }

        // 0xf9 Graphic Control Extension
        if (this.subType === 0xf9) {
          let subBlockLength;
          if (buffer.length - index < subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          subBlockLength = buffer[index++];
          if (subBlockLength !== 0x04) {
            throw new Error('Invalid metadata block');
          }

          if (buffer.length - index < subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          // TODO Need to read in the options
          const options = buffer[index++];

          const delayTime = buffer[index++] | (buffer[index++] << 8);
          this.myObject.delayTimes.push(delayTime);
          const transparentColor = buffer[index++];
          this.myObject.transparentColors.push(transparentColor);
          const terminator = buffer[index++];
          if (terminator !== 0x00) {
            throw new Error('Invalid metadata block');
          }

        } else if (this.subType === 0xff) {
          if (buffer.length - index < 1) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          let subBlockLength = buffer[index++];
          while (subBlockLength !== 0x00 && buffer.length - index >= subBlockLength) {
            index += subBlockLength;
            subBlockLength = buffer[index++];
          }

          if (subBlockLength !== 0x00) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

        } else if (this.subType === 0xfe) {
          // 0xfe Comment Extension
          let subBlockLength = buffer[index++];
          if (buffer.length - index < subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }
          const comment = buffer.slice(index, index + subBlockLength);
          this.myObject.comments.push(comment.toString());
          index += subBlockLength;
          if (buffer[index++] !== 0x00) {
            throw new Error('Invalid metadata block');
          }
        } else if (this.subType === 0x01) {
          // 0x01 Plain Text Extension
          let subBlockLength = buffer[index++];
          if (subBlockLength !== 0x0c) {
            throw new Error('Invalid metadata block');
          }

          if (buffer.length - index < subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          const left = buffer[index++] | (buffer[index++] << 8);
          const top = buffer[index++] | (buffer[index++] << 8);
          const width = buffer[index++] | (buffer[index++] << 8);
          const height = buffer[index++] | (buffer[index++] << 8);
          const cellWidth = buffer[index++];
          const cellHeight = buffer[index++];
          const foregroundColorIndex = buffer[index++];
          const backgroundColorIndex = buffer[index++];
          const terminator = buffer[index++];
          if (terminator !== 0x00) {
            throw new Error('Invalid metadata block');
          }
          
        }
        this.subType = undefined;

        if (buffer.length < 1) {
          callback();
          return;
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
        
        if (this.subBlockLength === undefined && !this.localColorTableFlags) {
          const left = buffer[index++] | (buffer[index++] << 8);
          const top = buffer[index++] | (buffer[index++] << 8);
          const width = buffer[index++] | (buffer[index++] << 8);
          const height = buffer[index++] | (buffer[index++] << 8);
          this.myObject.imagePositions.push({left, top, width, height});
          const flags = buffer[index++];
          this.localColorTableFlags = flags.toString(2).padStart(8, '0')
          this.hasLocalColorTable = this.localColorTableFlags[0] === '1';
        }

        // TODO Add the local color table info
        if (this.hasLocalColorTable && this.localColorTable === undefined) {
          const sizeOfLocalColorTable = this.localColorTableFlags.slice(5, 8);
          const sizeOfLocalColorTableInt = parseInt(sizeOfLocalColorTable, 2);
          const sizeOfLocalColorTableInBytes = 2 ** (sizeOfLocalColorTableInt + 1);
          const sizeOfLocalColorTableInBytes3 = 3 * sizeOfLocalColorTableInBytes;
          if (buffer.length - index < sizeOfLocalColorTableInBytes3) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          this.localColorTable = buffer.slice(index, index + sizeOfLocalColorTableInBytes3);
          index += sizeOfLocalColorTableInBytes3;
        }

        // For now assume that the global color table is used
        // But in future will have to account for the size of the colour table here
        if (buffer.length - index < 2) {
          this.previousTail = buffer.slice(index);
          callback();
          return;
        }

        if (this.subBlockLength === undefined && this.blocks.length === 0) {
          this.codeSize = buffer[index++];
          let N = this.codeSize
          this.myObject.codeSizes.push(N);
        }

        if (this.previousTail.length > 0) {
          this.previousTail = Buffer.alloc(0);
        }

        if (this.subBlockLength === undefined) {
          this.subBlockLength = buffer[index++];
        }

        while (this.subBlockLength !== undefined && this.subBlockLength !== 0) {
          if (buffer.length - index < this.subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          const data = buffer.slice(index, index + this.subBlockLength);
          this.blocks.push(data);
          index += this.subBlockLength;

          this.subBlockLength = buffer[index++];
        }

        if (this.subBlockLength === 0) {
          const _buffer = Buffer.concat(this.blocks);
          this.subBlockLength = undefined;
          this.blocks = [];
          this.identifier = buffer[index++];

          // Clear out local color table info
          this.myObject.localColorTables.push(this.localColorTable);
          this.hasLocalColorTable = false;
          this.localColorTable = undefined;
          this.localColorTableFlags = undefined;

          /** 
           * Have to be really careful where you put these 
           * Previously was before I updated the local color table
           * It was reaching the ColorTransform block and thinking it was the local color table
           */
          this.push(_buffer);
        }


      }

      if (index > buffer.length) {
        callback();
        return;
      }
      
    }

    callback();

  }
}

export class FrameImageTransform extends Transform {
  constructor(myObject, options) {
    super(options);
    this.myObject = myObject;

    // Add a new array to buffer
    this.myObject.frameBufferImageLengths = [];
  }

  _transform(chunk, encoding, callback) {
    const {codeSizes} = this.myObject;
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
            code_table[code] = [];
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
              prev_code = code;
              continue;
            }
          } else if (code_table[prev_code]) {
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

      // Get the _buffer length before pushing
      const frameBuffer = Buffer.from(indexStream)
      this.myObject.frameBufferImageLengths.push(frameBuffer.length);
      this.push(frameBuffer);
      callback();
    } else {
      // reached the end of the frame
      callback();
    }

    this.count++;
  }
}

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

export class ColorTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
    this.frameBuffer = undefined;
    this.previousTail = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    const buffer = Buffer.concat([this.previousTail, chunk]);
    if (this.chunkLength === undefined) {
      this.chunkLength = this.gifObject.frameBufferImageLengths.shift();
    }

    if (this.chunkLength === buffer.length) {
      this.previousTail = Buffer.alloc(0);
      this.chunkLength = undefined;
    } else {
      this.previousTail = chunk;
      callback();
      return;
    }

    if (!this.frameBuffer) {
      const {width, height} = this.gifObject;
      this.width = width;
      this.height = height;
      this.frameBuffer = Buffer.alloc(this.width * this.height * 4)
    }

    const imagePosition = this.gifObject.imagePositions.shift();
    const {left = 0, top = 0, width: subWidth, height: subHeight} = (imagePosition)
      ? imagePosition
      : this.gifObject;

    let x = left;
    let y = top;
    const a = 255;
    const transparentColor = this.gifObject.transparentColors.shift();
    const localColorTable = this.gifObject.localColorTables.shift();
    const globalColorTable = this.gifObject.globalColorTable;
    const colorTable = localColorTable || globalColorTable;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] !== transparentColor) {
        const colorIndex = buffer[i] * 3;
        const [r, g, b] = colorTable.slice(colorIndex, colorIndex + 3);
        // const rgbIndex = y * width * 4 + x * 4; // This line here is wrong and has screwed me over for hours
        const rgbIndex = y * this.width * 4 + x * 4;
        this.frameBuffer[rgbIndex] = r;
        this.frameBuffer[rgbIndex + 1] = g;
        this.frameBuffer[rgbIndex + 2] = b;
        this.frameBuffer[rgbIndex + 3] = a;
      }
      x++;
      if (x - left === subWidth) {
        x = left;
        y++;
      }
    }

    this.push(this.frameBuffer);
    callback();
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