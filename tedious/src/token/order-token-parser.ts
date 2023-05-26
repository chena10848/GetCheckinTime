// s2.2.7.14
import Parser, { ParserOptions } from './stream-parser';

import { OrderToken } from './token';

function orderParser(parser: Parser, _options: ParserOptions, callback: (token: OrderToken) => void) {
  parser.readUInt16LE((length) => {
    const columnCount = length / 2;
    const orderColumns: number[] = [];

    let i = 0;
    function next(done: () => void) {
      if (i === columnCount) {
        return done();
      }

      parser.readUInt16LE((column) => {
        orderColumns.push(column);

        i++;

        next(done);
      });
    }

    next(() => {
      callback(new OrderToken(orderColumns));
    });
  });
}

export default orderParser;
module.exports = orderParser;
