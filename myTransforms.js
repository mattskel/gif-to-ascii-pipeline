import { Transform } from 'stream';
import { createCanvas, createImageData, Image } from 'canvas';

// const asciiScale = ' .,:ilwW'
const asciiScale = ' .,:;irsXA253hMHGS#9B&@';
// const asciiScale = '@#%*+=-:. ';

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
    } else {
      // console.log('gifHeader', gifHeader.toString());
    }
    const gifVersion = chunk.slice(3, 6);
    const gifWidth = chunk.readUInt16LE(6);
    this.myObject.width = gifWidth;
    const gifHeight = chunk.readUInt16LE(8);
    this.myObject.height = gifHeight;

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
    // console.log('')
    console.log('\n=================================')
    console.log('this.previousTail.length', this.previousTail.length);
    console.log('buffer.length', buffer.length);
    console.log('this.identifier', this.identifier);
    console.log('this.blocks.length', this.blocks.length);
    

    if (this.identifier === undefined) {
      this.identifier = buffer[index++];
    }
    console.log('this.identifier', this.identifier);

    while (this.identifier !== undefined) {

      /// EOF
      if (this.identifier === 0x3b) {
        callback();
        return;
      }

      // 0x21 Meta data identifier
      if (this.identifier === 0x21) {
        console.log('Meta data identifier')
        if (buffer.length - index < 1) {
          this.previousTail = buffer.slice(index);
          callback();
          return;
        }
        if (this.subType === undefined) {
          this.subType = buffer[index++];
        }

        console.log('this.subType', this.subType);

        // 0xf9 Graphic Control Extension
        if (this.subType === 0xf9) {
          console.log('Graphic Control Extension');
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
          this.myObject.delayTimes.push(delayTime);
          const transparentColor = buffer[index++];
          this.myObject.transparentColors.push(transparentColor);
          const terminator = buffer[index++];
          if (terminator !== 0x00) {
            throw new Error('Invalid metadata block');
          }

          // this.subType = undefined;
        } else if (this.subType === 0xff) {
          // 0xff Application Extension
          let subBlockLength = buffer[index++];
          if (subBlockLength !== 0x0b) {
            throw new Error('Invalid metadata block');
          }

          if (buffer.length - index < subBlockLength) {
            this.previousTail = buffer.slice(index);
            callback();
            return;
          }

          const appIdentifier = buffer.slice(index, index + 8);
          index += 8;
          const appAuthenticationCode = buffer.slice(index, index + 3);
          index += 3;

          if (appIdentifier.toString() === 'NETSCAPE') {
            const subBlockLength = buffer[index++];
            if (subBlockLength !== 0x03) {
              throw new Error('Invalid metadata block');
            }

            const subBlockIdentifier = buffer[index++];
            if (subBlockIdentifier !== 0x01) {
              throw new Error('Invalid metadata block');
            }

            const loopCount = buffer[index++] | (buffer[index++] << 8);
            this.myObject.loopCount = loopCount;
            const terminator = buffer[index++];
            if (terminator !== 0x00) {
              throw new Error('Invalid metadata block');
            }
          }

          // this.subType = undefined;
        } else if (this.subType === 0xfe) {
          // 0xfe Comment Extension
          let subBlockLength = buffer[index++];
          if (subBlockLength === 0x00) {
            this.subType = undefined;
          } else {
            if (buffer.length - index < subBlockLength) {
              this.previousTail = buffer.slice(index);
              callback();
              return;
            }
            const comment = buffer.slice(index, index + subBlockLength);
            this.myObject.comments.push(comment.toString());
            index += subBlockLength;
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
        console.log('LWZ image');
        const blockSize = 9;
        if (buffer.length - index < blockSize) {
          this.previousTail = buffer.slice(index);
          callback();
          return;
        }
        
        if (this.subBlockLength === undefined && this.blocks.length === 0) {
          const left = buffer[index++] | (buffer[index++] << 8);
          const top = buffer[index++] | (buffer[index++] << 8);
          const width = buffer[index++] | (buffer[index++] << 8);
          const height = buffer[index++] | (buffer[index++] << 8);
          this.myObject.imagePositions.push({left, top, width, height});
          const flags = buffer[index++];
          // console.log('flags', flags);
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
        } else if (this.subBlockLength === undefined) {
          this.subBlockLength = buffer[index++];
          // console.log('this.subBlockLength', this.subBlockLength);
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
          // if (index >= buffer.length) {
          //   break;
          // }

          this.subBlockLength = buffer[index++];
        }

        if (this.subBlockLength === 0) {
          console.log('***** pushing *****')
          const _buffer = Buffer.concat(this.blocks);
          console.log('_buffer.length', _buffer.length)
          console.log('buffer[index]', buffer[index])
          console.log('buffer[index + 1]', buffer[index + 1])
          console.log('buffer[index + 2]', buffer[index + 2])
          
          this.push(_buffer);
          this.subBlockLength = undefined;
          this.blocks = [];
          this.identifier = buffer[index++];
          // this.identifier = undefined;
          // this.previousTail = buffer.slice(index);
          // console.log('this.previousTail[0]', this.previousTail[0]);


          // this.previousTail = buffer.slice(index);
        // } else if (this.subBlockLength === undefined) {
        //   this.subBlockLength = buffer[index++];
        //   this.previousTail = buffer.slice(index);
        //   callback();
        //   return;
        }
        // this.previousTail = buffer.slice(index);
        // if (this.previousTail.length === 0) {
        //   this.previousTail = buffer.slice(index);
        // }
      }
      if (this.identifier !== undefined) {
        console.log(`!!!!! this.subBlockLength is ${this.subBlockLength} !!!!!`);
      }
    }

    callback();

  }
}

export class FrameImageTransform extends Transform {
  constructor(myObject, options) {
    super(options);
    this.myObject = myObject;
    // this.count = 0;
  }

  _transform(chunk, encoding, callback) {
    // console.log('chunk.length', chunk.length);
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

    // console.log('N', N);
    // console.log('subBlockLength', subBlockLength);
    if (subBlockLength !== 0) {
      const subBlock = chunk;
      let subIndex = 0;
      while (subIndex < subBlockLength) {
        // if (subIndex === 0 && (this.count === 0 || this.count === 1)) {
          // console.log('subBlock[...]', subBlock.slice(0, 10));
        
        // }
        // console.log('subIndex < subBlockLength');
        // console.log('subIndex', subIndex);
        // console.log('subBlockLength', subBlockLength);
        binString = subBlock[subIndex++].toString(2).padStart(8, '0') + binString;
        // if (subIndex === 5378) {
        //   console.log('subBlock[subIndex]', subBlock[subIndex]);
        //   console.log('chunk.length', chunk.length);
        // }
        // if (subIndex === 5378 && subBlock[subIndex] === 21) {
        //   console.log('$here');
        // }
        if (binString.length >= currentCodeSize) {
          let _tmp = binString.slice(-currentCodeSize);
          // if (code === 1339 && parseInt(_tmp, 2) === 4033) {
          //   console.log('here');
          // }
          if (subIndex === 5380 && subBlock[subIndex] === 66) {
            console.log('#here');
          }
          if (subIndex === 5379 && subBlock[subIndex] === 252) {
            console.log('##here');
          }

          
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
            console.log('\n**********************');
            console.log('next_code', next_code);
            console.log('prev_code', prev_code);
            console.log('code', code);
            throw new Error('Something went wrong');
          }

          if (next_code === 2 ** currentCodeSize - 1 && currentCodeSize < 12) {
            currentCodeSize++;
          }

          if (next_code < 4096) {
            if (code === 4033 && next_code === 3991) {
              console.log('@here');
            }
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
    // console.log('CompressionTransform transform');
    const {width: _gifWidth, height: _gifHeight, widthCompression, heightCompression} = this.gifObject;
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

    // console.log('pushing')
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
    // console.log('AsciiTransform');
    const {width: _gifWidth, widthCompression} = this.gifObject;
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
    // console.log('!here');
    this.push(rows.join('\n'));
    // this.push(`<p>${rows.join('</p><br><p>')}</p>`);
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
    // callback();
  }
}

export class ColorTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
    // this.context = undefined;
    // this.canvas = undefined;
    this.frameBuffer = undefined;
  }

  _transform(chunk, encoding, callback) {

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


    // console.log('imagePosition', imagePosition);
    // console.log('pixels', width * height);
    // console.log('chunk', chunk);
    let x = left;
    let y = top;
    const a = 255;
    const transparentColor = this.gifObject.transparentColors.shift();
    // console.log('transparentColor', transparentColor);
    // debugger;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] !== transparentColor) {
        const colorIndex = chunk[i] * 3;
        const [r, g, b] = this.gifObject.globalColorTable.slice(colorIndex, colorIndex + 3);
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

export class RGBTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
  }

  _transform(chunk, encoding, callback) {
    const colorBuffer = Buffer.alloc(chunk.length * 3);
    const transparentColor = this.gifObject.transparentColors.shift();
    for (let i = 0; i < chunk.length; i++) {
      let r, g, b;
      if (chunk[i] !== transparentColor) {
        const colorIndex = chunk[i] * 3;
        [r, g, b] = this.gifObject.globalColorTable.slice(colorIndex, colorIndex + 3);
        // add r, g, b to buffer
        colorBuffer[i * 3] = r;
        colorBuffer[i * 3 + 1] = g;
        colorBuffer[i * 3 + 2] = b;
        
      }
      x++;
      if (x - left === width) {
        x = left;
        y++;
      }
    }
    this.push(colorBuffer);
    callback();
  }
}

export class _CanvasTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
    this.context = undefined;
    this.canvas = undefined;
  }

  _transform(chunk, encoding, callback) {
    if (!this.context) {
      const {width, height} = this.gifObject;
      const canvas = createCanvas(width, height);
      this.context = canvas.getContext('2d');
      this.canvas = canvas;
    }

    const imagePosition = this.gifObject.imagePositions.shift();
    const {left = 0, top = 0, width, height} = (imagePosition)
      ? imagePosition
      : this.gifObject;


    let x = left;
    let y = top;
    while (chunk.length) {
      const [r, g, b] = chunk.splice(0, 3);
      this.context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      this.context.fillRect(x, y, 1, 1);
      x++;
      if (x - left === width) {
        x = left;
        y++;
      }
    }

    // this.push(Buffer.from(this.canvas.toDataURL('image/png')));
    this.push(this.canvas.toBuffer('image/jpeg'), {quality: 0.5, progressive: false, chromaSubsampling: true});
    callback();
  }
}

export class CanvasTransform extends Transform {
  constructor(gifObject, options) {
    super(options);
    this.gifObject = gifObject;
    // this.context = undefined;
    // this.canvas = undefined;
  }

  _transform(chunk, encoding, callback) {
    const {width, height} = this.gifObject;
    // Convert chunk to a Uint8ClampedArray

    const buffer = Buffer.from(chunk);
    const arraySize = width * height * 4
    const myImg = createImageData(new Uint8ClampedArray(buffer), width, height);
    // const myImg = createImageData(new Uint8ClampedArray(arraySize), width, height);
    // const myImg = new Image();
    // console.log(typeof myImg);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.putImageData(myImg, 0, 0);
    // if (!this.context) {
    //   this.canvas = canvas;
    // }

    // const imagePosition = this.gifObject.imagePositions.shift();
    // const {left = 0, top = 0, width, height} = (imagePosition)
    //   ? imagePosition
    //   : this.gifObject;


    // let x = left;
    // let y = top;
    // while (chunk.length) {
    //   const [r, g, b] = chunk.splice(0, 3);
    //   this.context.fillStyle = `rgb(${r}, ${g}, ${b})`;
    //   this.context.fillRect(x, y, 1, 1);
    //   x++;
    //   if (x - left === width) {
    //     x = left;
    //     y++;
    //   }
    // }

    const dataUrl = canvas.toDataURL('image/png');
    // const dataUrl = canvas.toBuffer('image/png');
    // console.log(dataUrl);
    this.push(dataUrl);
    // this.push(canvas.toBuffer('image/png', {quality: 0.5}));
    callback();
  }
}