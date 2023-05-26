// @ts-check

const TYPES = require('../../src/tedious').TYPES;
const fs = require('fs');

const { assert } = require('chai');

import Connection from '../../src/connection';
import Request from '../../src/request';

function getConfig() {
  var config = JSON.parse(
    fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')
  ).config;

  config.options.tdsVersion = process.env.TEDIOUS_TDS_VERSION;

  config.options.debug = {
    packet: true,
    data: true,
    payload: true,
    token: true,
    log: true
  };

  return config;
}

describe('calling a procedure that takes and returns a TVP', function() {
  /** @type {any} */
  let config;

  /** @type {Connection} */
  let connection;

  beforeEach(function(done) {
    config = getConfig();

    connection = new Connection(config);
    connection.connect(done);
  });

  beforeEach(function() {
    if (config.options.tdsVersion < '7_3_A') {
      this.skip();
    }
  });

  beforeEach(function(done) {
    connection.execSqlBatch(new Request(`
      DROP PROCEDURE IF EXISTS [__tediousTvpTest]
    `, done));
  });

  beforeEach(function(done) {
    connection.execSqlBatch(new Request(`
      DROP TYPE IF EXISTS [__tediousTvpType];
      CREATE TYPE [__tediousTvpType] AS TABLE (
        a bit,
        b tinyint,
        c smallint,
        d int,
        e bigint,
        f real,
        g float,
        h varchar (100),
        i nvarchar (100),
        j datetime
      )
    `, done));
  });

  beforeEach(function(done) {
    connection.execSqlBatch(new Request(`
      CREATE PROCEDURE [__tediousTvpTest] @tvp __tediousTvpType readonly AS BEGIN
        select * from @tvp
      END
    `, done));
  });

  afterEach(function(done) {
    const sql = 'DROP PROCEDURE IF EXISTS [__tediousTvpTest]';
    connection.execSqlBatch(new Request(sql, done));
  });

  afterEach(function(done) {
    const sql = 'DROP TYPE IF EXISTS [__tediousTvpType]';
    connection.execSqlBatch(new Request(sql, done));
  });

  afterEach(function() {
    connection.close();
  });

  it('returns the same data', function(done) {
    const request = new Request('__tediousTvpTest', done);

    request.on('doneInProc', function(rowCount, more) {
      assert.strictEqual(rowCount, 1);
    });

    request.on('row', function(columns) {
      assert.strictEqual(columns[0].value, false);
      assert.strictEqual(columns[1].value, 1);
      assert.strictEqual(columns[2].value, 2);
      assert.strictEqual(columns[3].value, 3);
      assert.strictEqual(columns[4].value, '4');
      assert.strictEqual(columns[5].value, 5.5);
      assert.strictEqual(columns[6].value, 6.6);
      assert.strictEqual(columns[7].value, 'asdf');
      assert.strictEqual(columns[8].value, 'asdf');
      assert.strictEqual(+columns[9].value, +new Date(Date.UTC(2014, 0, 1)));
    });

    const table = {
      columns: [
        {
          name: 'a',
          type: TYPES.Bit
        },
        {
          name: 'b',
          type: TYPES.TinyInt
        },
        {
          name: 'c',
          type: TYPES.SmallInt
        },
        {
          name: 'd',
          type: TYPES.Int
        },
        {
          name: 'e',
          type: TYPES.BigInt
        },
        {
          name: 'f',
          type: TYPES.Real
        },
        {
          name: 'g',
          type: TYPES.Float
        },
        {
          name: 'h',
          type: TYPES.VarChar,
          length: 100
        },
        {
          name: 'i',
          type: TYPES.NVarChar,
          length: 100
        },
        {
          name: 'j',
          type: TYPES.DateTime,
          length: 100
        }
      ],
      rows: [
        [
          false,
          1,
          2,
          3,
          4,
          5.5,
          6.6,
          'asdf',
          'asdf',
          new Date(Date.UTC(2014, 0, 1))
        ]
      ]
    };

    request.addParameter('tvp', TYPES.TVP, table, {});

    connection.callProcedure(request);
  });

  it('correctly handles validation errors', function(done) {
    const request = new Request('__tediousTvpTest', (err) => {
      assert.instanceOf(err, TypeError);
      assert.strictEqual(err?.message, 'Value must be between 0 and 255, inclusive.');

      const request = new Request('SELECT 1', done);
      connection.execSql(request);
    });

    const table = {
      columns: [
        {
          name: 'a',
          type: TYPES.Bit
        },
        {
          name: 'b',
          type: TYPES.TinyInt
        },
        {
          name: 'c',
          type: TYPES.SmallInt
        },
        {
          name: 'd',
          type: TYPES.Int
        },
        {
          name: 'e',
          type: TYPES.BigInt
        },
        {
          name: 'f',
          type: TYPES.Real
        },
        {
          name: 'g',
          type: TYPES.Float
        },
        {
          name: 'h',
          type: TYPES.VarChar,
          length: 100
        },
        {
          name: 'i',
          type: TYPES.NVarChar,
          length: 100
        },
        {
          name: 'j',
          type: TYPES.DateTime,
          length: 100
        }
      ],
      rows: [
        [
          false,
          // This value is outside of `tinyint` range
          1123,
          2,
          3,
          4,
          5.5,
          6.6,
          'asdf',
          'asdf',
          new Date(Date.UTC(2014, 0, 1))
        ]
      ]
    };

    request.addParameter('tvp', TYPES.TVP, table, {});

    connection.callProcedure(request);
  });
});
