import { DataType } from '../data-type';
import WritableTrackingBuffer from '../tracking-buffer/writable-tracking-buffer';

const NULL_LENGTH = Buffer.from([0x00]);

const Time: DataType = {
  id: 0x29,
  type: 'TIMEN',
  name: 'Time',

  declaration: function(parameter) {
    return 'time(' + (this.resolveScale!(parameter)) + ')';
  },

  resolveScale: function(parameter) {
    if (parameter.scale != null) {
      return parameter.scale;
    } else if (parameter.value === null) {
      return 0;
    } else {
      return 7;
    }
  },

  generateTypeInfo(parameter) {
    return Buffer.from([this.id, parameter.scale!]);
  },

  generateParameterLength(parameter, options) {
    if (parameter.value == null) {
      return NULL_LENGTH;
    }

    switch (parameter.scale) {
      case 0:
      case 1:
      case 2:
        return Buffer.from([0x03]);
      case 3:
      case 4:
        return Buffer.from([0x04]);
      case 5:
      case 6:
      case 7:
        return Buffer.from([0x05]);
      default:
        throw new Error('invalid scale');
    }
  },

  * generateParameterData(parameter, options) {
    if (parameter.value == null) {
      return;
    }

    const buffer = new WritableTrackingBuffer(16);
    const time = parameter.value;

    let timestamp;
    if (options.useUTC) {
      timestamp = ((time.getUTCHours() * 60 + time.getUTCMinutes()) * 60 + time.getUTCSeconds()) * 1000 + time.getUTCMilliseconds();
    } else {
      timestamp = ((time.getHours() * 60 + time.getMinutes()) * 60 + time.getSeconds()) * 1000 + time.getMilliseconds();
    }

    timestamp = timestamp * Math.pow(10, parameter.scale! - 3);
    timestamp += (parameter.value.nanosecondDelta != null ? parameter.value.nanosecondDelta : 0) * Math.pow(10, parameter.scale!);
    timestamp = Math.round(timestamp);

    switch (parameter.scale) {
      case 0:
      case 1:
      case 2:
        buffer.writeUInt24LE(timestamp);
        break;
      case 3:
      case 4:
        buffer.writeUInt32LE(timestamp);
        break;
      case 5:
      case 6:
      case 7:
        buffer.writeUInt40LE(timestamp);
    }

    yield buffer.data;
  },

  validate: function(value): null | number | Date {
    if (value == null) {
      return null;
    }

    if (!(value instanceof Date)) {
      value = new Date(Date.parse(value));
    }

    if (isNaN(value)) {
      throw new TypeError('Invalid time.');
    }

    return value;
  }
};


export default Time;
module.exports = Time;
