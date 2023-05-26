import { DataType } from '../data-type';

const MAX = (1 << 16) - 1;
const UNKNOWN_PLP_LEN = Buffer.from([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
const PLP_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00]);

const NULL_LENGTH = Buffer.from([0xFF, 0xFF]);
const MAX_NULL_LENGTH = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

const NVarChar: { maximumLength: number } & DataType = {
  id: 0xE7,
  type: 'NVARCHAR',
  name: 'NVarChar',
  maximumLength: 4000,

  declaration: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.

    let length;
    if (parameter.length) {
      length = parameter.length;
    } else if (value != null) {
      length = value.toString().length || 1;
    } else if (value === null && !parameter.output) {
      length = 1;
    } else {
      length = this.maximumLength;
    }

    if (length <= this.maximumLength) {
      return 'nvarchar(' + length + ')';
    } else {
      return 'nvarchar(max)';
    }
  },

  resolveLength: function(parameter) {
    const value = parameter.value as any; // Temporary solution. Remove 'any' later.
    if (parameter.length != null) {
      return parameter.length;
    } else if (value != null) {
      if (Buffer.isBuffer(value)) {
        return (value.length / 2) || 1;
      } else {
        return value.toString().length || 1;
      }
    } else {
      return this.maximumLength;
    }
  },

  generateTypeInfo(parameter) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(this.id, 0);

    if (parameter.length! <= this.maximumLength) {
      buffer.writeUInt16LE(parameter.length! * 2, 1);
    } else {
      buffer.writeUInt16LE(MAX, 1);
    }

    if (parameter.collation) {
      parameter.collation.toBuffer().copy(buffer, 3, 0, 5);
    }

    return buffer;
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      if (parameter.length! <= this.maximumLength) {
        return NULL_LENGTH;
      } else {
        return MAX_NULL_LENGTH;
      }
    }

    let value = parameter.value;
    if (parameter.length! <= this.maximumLength) {
      let length;
      if (value instanceof Buffer) {
        length = value.length;
      } else {
        value = value.toString();
        length = Buffer.byteLength(value, 'ucs2');
      }

      const buffer = Buffer.alloc(2);
      buffer.writeUInt16LE(length, 0);
      return buffer;
    } else {
      return UNKNOWN_PLP_LEN;
    }
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    let value = parameter.value;

    if (parameter.length! <= this.maximumLength) {
      if (value instanceof Buffer) {
        yield value;
      } else {
        value = value.toString();
        yield Buffer.from(value, 'ucs2');
      }
    } else {
      if (value instanceof Buffer) {
        const length = value.length;

        if (length > 0) {
          const buffer = Buffer.alloc(4);
          buffer.writeUInt32LE(length, 0);
          yield buffer;
          yield value;
        }
      } else {
        value = value.toString();
        const length = Buffer.byteLength(value, 'ucs2');

        if (length > 0) {
          const buffer = Buffer.alloc(4);
          buffer.writeUInt32LE(length, 0);
          yield buffer;
          yield Buffer.from(value, 'ucs2');
        }
      }

      yield PLP_TERMINATOR;
    }
  },

  validate: function(value): null | string {
    if (value == null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError('Invalid string.');
    }

    return value;
  }
};

export default NVarChar;
module.exports = NVarChar;
