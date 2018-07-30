import {cp, generateJson, readDirSync, replaceChByKey} from './app';
import config from './config';

console.log('开始复制...');
cp();
console.log('复制已完成...');
console.log('----------------');
if (config.onlyTw) {
    setTimeout(() => {
        readDirSync(config.distDir);
    }, 2000);
} else {
    console.log('----------------2s后生成中文json，确保复制已完成...----------------');
    console.log('----------------');
    setTimeout(() => {
        console.log('开始生成中文json...');
        generateJson();
        console.log('中文json已生成...');
        console.log('----------------');
        console.log('----------------2s后处理文件，确保中文json已完成...----------------');
        console.log('----------------');
        setTimeout(() => {
            console.log('开始处理文件...');
            replaceChByKey();
            console.log('文件已完成...');
        }, 2000);
    }, 2000);
}