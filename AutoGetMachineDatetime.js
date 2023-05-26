const HTMLParser = require('node-html-parser');
const iconv = require('iconv-lite');
var request = require('request');
const df = require('./datetimeFormat.js');
const fs = require('fs');
const { parse } = require('path');
const mysql = require('mysql2');



let today = new Date();
let yesterday = new Date((new Date(today)).setDate(today.getDate() - 1));
let recordTidy = [];


let apiCount = 0;

// 取得所有使用者的 uid
async function getAllUserId() {
    return new Promise((resolve, reject) => {
        request({
            uri: `http://*.*.*.*/csl/download`,
            method: "GET",
            encoding: null,
        }, (err, res) => {
            let data = iconv.decode(res.body, 'big5');

            let root = HTMLParser.parse(data);
            let uids = root.querySelectorAll('table tr td input[type=checkbox]');
            let result = []

            uids.forEach(el => { result.push(el._attrs.value); })

            resolve(result);
        })
    })
}

// 呼叫刷卡機 API 下載所有 uid 某天的打卡資料存成檔案
async function downloadAttendance(date, uids) {
    return new Promise((resolve, reject) => {
        request({
            uri: `http://*.*.*.*/form/Download`,
            method: "POST",
            encoding: null,
            form: {
                sdate: date.Format('yyyy-MM-dd'),
                edate: date.Format('yyyy-MM-dd'),
                period: 1,
                uid: parseUids(uids)
            }
        }, (err, res) => {
            let result = iconv.decode(res.body, 'big5');

            resolve(result);
        })
    })
}

// parse uid array to FormData acceptable Type
function parseUids(uids) {
    let result = "";

    for (let i = 0; i < uids.length; i++) {
        if (i == 0) result += uids[i];
        else result += `&uid=${uids[i]}`;
    }

    return result;
}

function parseData(result) {
    let parseResult = [];
    let rows = result.split('\r\n');

    for (let i = 0; i < rows.length - 1; i++) {

        parseResult.push(parseRow(rows[i]));

    }

    return parseResult;
}

function parseRow(dat) {
    let data = dat.split('\t');

    let ASCII = data[0].substring(0, 2);
    let englishASCII = String.fromCharCode(ASCII);

    return [
        englishASCII + data[0].substring(2, 8),
        data[2],
        "0000-00-00 00:00:00",
        "",
        "0000-00-00 00:00:00",
        0,
        "",
        "0000-00-00 00:00:00",
    ]
}

async function checkMechanism(rowsDetail) {

    const connection = mysql.createConnection({
        host: '*.*.*.*',
        user: '*',
        password: '*',
        database: 'engineroom',
        port: 3306 // 默认为 3306
    });

    return new Promise((resolve, reject) => {
        let query = 'SELECT cr01,cr02 FROM checkinrecord';
        connection.query(query, (err, rows) => {
            if (err) reject(err);

            const resultRecord = [];
            for (let i = 0; i < rows.length; i++) {
                const inputTime = rows[i]['cr02'];
                const date = new Date(inputTime);
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const hours = date.getHours();
                const minutes = date.getMinutes();
                const seconds = date.getSeconds();
                const convertedTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                const output = convertedTime.replace('T', ' ');

                let obj = {
                    cr01: rows[i]['cr01'],
                    cr02: output
                }

                recordTidy.push(obj)
            }

            for (let i = 0; i < rowsDetail.length; i++) {
                let check = true;
                for (let y = 0; y < recordTidy.length; y++) {

                    if (rowsDetail[i][0] == recordTidy[y]['cr01'] && rowsDetail[i][1] == recordTidy[y]['cr02']) {
                        check = false;
                    }
                }

                if (check) {
                    resultRecord.push([
                        rowsDetail[i][0],
                        rowsDetail[i][1],
                        "0000-00-00 00:00:00",
                        "",
                        "0000-00-00 00:00:00",
                        0,
                        "",
                        "0000-00-00 00:00:00",
                    ]);
                }
            }


            resolve(resultRecord);
        });

        connection.end();
    });
}

function addDetail(rowsDetail) {

    const connection = mysql.createConnection({
        host: '*.*.*.*',
        user: '*',
        password: '*',
        database: 'engineroom',
        port: 3306 // 3306
    });

    // 執行批次插入

    connection.query('INSERT INTO checkinrecord (cr01, cr02 ,cr03 ,cr04 ,cr05 ,cr06 ,cr07 ,cr08) VALUES ?', [rowsDetail], function(err, results) {
        if (err) {
            console.log(loadingTime() + ' - 已寫入完畢 ');
        } else {
            console.log(loadingTime() + ' - 寫入 ' + results.affectedRows + ' 筆資料');
        }
    });

    // 關閉資料庫連線
    connection.end();
}

function nowTime() {
    const now = new Date();
    const date = new Date(now);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const convertedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const output = convertedTime.replace('T', ' ');
    return output;
}

function loadingTime() {
    const now = new Date();
    const date = new Date(now);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const convertedTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    const output = convertedTime.replace('T', ' ');
    return output;
}


async function Main() {
    var uids = await getAllUserId();
    run(uids);

    const tmrCheck = setInterval(() => { runs(); }, 1 * 1000);
}

async function run(uids) {
    uids = await getAllUserId();
    var rows = await downloadAttendance(yesterday, uids);
    var parseResult = parseData(rows);

    checkMechanism(parseResult).then((result) => {
        addDetail(result);
    });
}

async function runs() {
    switch (nowTime()) {
        case "00:00:00":
        case "01:00:00":
        case "02:00:00":
        case "03:00:00":
        case "04:00:00":
        case "05:00:00":
        case "07:00:00":
        case "08:00:00":
        case "09:00:00":
        case "10:00:00":
        case "11:00:00":
        case "12:00:00":
        case "13:00:00":
        case "14:00:00":
        case "15:00:00":
        case "16:00:00":
        case "17:00:00":
        case "18:00:00":
        case "19:00:00":
        case "20:00:00":
        case "21:00:00":
        case "22:00:00":
        case "23:00:00":
            console.log("現在時間 : ", loadingTime());
            console.log("--------------------------------------------");
            break;
    }

    if (nowTime() == "06:00:00") {
        today = new Date();
        yesterday = new Date((new Date(today)).setDate(today.getDate() - 1));
        console.log("要匯入的時間 : ", yesterday);
        var uids = await getAllUserId();
        var rows = await downloadAttendance(yesterday, uids);
        var parseResult = parseData(rows);

        checkMechanism(parseResult).then((result) => {
            addDetail(result);
        });
    }
}


Main();