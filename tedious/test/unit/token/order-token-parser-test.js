const StreamParser = require('../../../src/token/stream-parser');
const WritableTrackingBuffer = require('../../../src/tracking-buffer/writable-tracking-buffer');
const assert = require('chai').assert;

describe('Order Token Parser', () => {
  it('should have one column', async () => {
    const numberOfColumns = 1;
    const length = numberOfColumns * 2;
    const column = 3;

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa9);
    buffer.writeUInt16LE(length);
    buffer.writeUInt16LE(column);
    // console.log(buffer.data)

    const parser = StreamParser.parseTokens([buffer.data], {}, { tdsVersion: '7_2' });
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.strictEqual(token.orderColumns.length, 1);

    assert.strictEqual(token.orderColumns[0], column);
  });

  it('should have two columns', async () => {
    const numberOfColumns = 2;
    const length = numberOfColumns * 2;
    const column1 = 3;
    const column2 = 4;

    const buffer = new WritableTrackingBuffer(50, 'ucs2');

    buffer.writeUInt8(0xa9);
    buffer.writeUInt16LE(length);
    buffer.writeUInt16LE(column1);
    buffer.writeUInt16LE(column2);
    // console.log(buffer.data)

    const parser = StreamParser.parseTokens([buffer.data], {}, { tdsVersion: '7_2' });
    const result = await parser.next();
    assert.isFalse(result.done);
    const token = result.value;
    assert.strictEqual(token.orderColumns.length, 2);
    assert.strictEqual(token.orderColumns[0], column1);
    assert.strictEqual(token.orderColumns[1], column2);

    assert.isTrue((await parser.next()).done);
  });
});
