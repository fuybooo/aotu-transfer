import config from './config';
import * as fs from 'fs';
import * as pinyin from 'pinyin';
import * as Chinese from 'chinese-s2t';

let zhFileList = [];
let zhList = [];
let zhKeyMap: any = {}; // 中文对应的key 如 {'返回': 'fan_hui'}
const UTF8 = 'utf-8';
const REG = {
    hasZh: /[\u4e00-\u9fa5]/,
    replaceZh: /[\u4e00-\u9fa5]+/g,
    replaceZhStr: /'.*[\u4e00-\u9fa5]+.*'/g,
    replaceZhStr2: /`.*[\u4e00-\u9fa5]+.*`/g,
    replaceNotZh: /[^\u4e00-\u9fa5]/g,
};

/**
 * 复制文件夹
 * step0 测试阶段需要对副本进行操作
 */
export function cp() {
    const child_process = require('child_process');

    child_process.spawn('rm', ['-rf', config.i18nDir + '/*']);

    child_process.spawn('rm', ['-rf', config.distDir]);
    child_process.spawn('cp', ['-r', config.baseDir, config.distDir]);
}

/**
 * 生成中文的json文件以备翻译
 */
export function generateJson() {
    // 生成zhList
    readDirSync(config.distDir);
    // 用zhList生成一个zh-empty.json
    sortChinese(zhList);
    let data: any = {};
    if (fs.existsSync(config.i18nDir + '/zh.json')) {
        // 读取原始的zh.json
        const originZhContent = fs.readFileSync(config.i18nDir + '/zh.json', UTF8);
        let difZhList = zhList.filter(item => !originZhContent.includes(`"${item}"`));
        data = zhListAppendToContent({
            zhLines: originZhContent,
            enLines: fs.readFileSync(config.i18nDir + '/en.json', UTF8),
            twLines: fs.readFileSync(config.i18nDir + '/tw.json', UTF8),
            keyLines: fs.readFileSync(config.i18nDir + '/key.json', UTF8),
        }, difZhList);
    } else {
        data = zhListToContent(zhList);
    }
    function writeFile(lang) {
        let content = data[`${lang}Lines`];
        if (!content.startsWith('{')) {
            content = `{${content}}`
        }
        fs.writeFileSync(config.i18nDir + `/${lang}.json`, content, UTF8);
    }
    writeFile('zh');
    writeFile('en');
    writeFile('tw');
    writeFile('key');
    let zhKeyMapLines = '';
    for (let p in zhKeyMap) {
        zhKeyMapLines += `${p}: ${zhKeyMap[p]}\n`;
    }
    fs.writeFileSync(config.zhKeyMap, zhKeyMapLines, UTF8);
}
export function replaceChByKey() {
    const length = zhFileList.length;
    // console.log(zhFileList);
    zhFileList.forEach((filePath, i) => {
        // console.log(`    正在处理 --> ${i + 1}/${length}，文件名：${filePath.slice(filePath.lastIndexOf('/') + 1)}`);
        handleFile(filePath);
    });
}
/**
 * 读取文件
 * @param _path
 */
export function readDirSync(_path) {
    // 如果要生成空的中文json则初始化zhList
    const pa = fs.readdirSync(_path);
    pa.forEach((p) => {
        const filePath = _path + "/" + p;
        const info = fs.statSync(filePath);
        if (info.isDirectory()) {
            readDirSync(filePath);
        } else {
            if (filePath.endsWith('.html') || filePath.endsWith('.model.ts') || filePath.endsWith('.ts')) {
                handleFile(filePath, true);
            }
        }
    });
}

function handleFile(filePath, isGenerateJson = false) {
    const type = getFileType(filePath);
    let fileContent = fs.readFileSync(filePath, UTF8);
    if (config.onlyTw) {
        // 只做繁体转化
        fileContent = Chinese.s2t(fileContent);
        fs.writeFileSync(filePath, fileContent, UTF8);
        return;
    }
    if ((isGenerateJson && REG.hasZh.test(fileContent)) || !isGenerateJson) {
        let contentLines = fileContent.split('\n'); // 以行区分的内容数组
        let replacedContentLines = [];
        // console.log(('正在处理的是' + filePath.slice(filePath.lastIndexOf('/') + 1)));
        // if (filePath.endsWith('org.component.ts')) {
        //     console.log('对org.component.ts进行提取：', contentLines)
        // }
        for (let line = 0, lineLength = contentLines.length; line < lineLength; line ++) {
            let lineContent = contentLines[line]; // 每行的内容
            // 判断该行是否为注释，如果是则不处理
            if (!isNoteLine(lineContent, type)) {
                // 如果该行包含中文，且没有被翻译
                if (isJsLineIncludesZh(lineContent)) {
                    if ((isGenerateJson && !isTranslated(lineContent, type)) || !isGenerateJson) {
                        if (isGenerateJson && zhFileList.indexOf(filePath) === -1) {
                            zhFileList.push(filePath);
                        }
                        // 如果是js，则只替换 // 之前的中文
                        let afterPart = '';
                        if (type !== 'html' && lineContent.includes('//')) {
                            lineContent = lineContent.slice(0, lineContent.indexOf('//'));
                            afterPart = lineContent.slice(lineContent.indexOf('//'));
                        }
                        replacedContentLines.push(
                            lineContent.replace(type === 'html' ?
                                REG.replaceZh : (lineContent.includes('`') ?
                                    REG.replaceZhStr2 : REG.replaceZhStr), (_sub) => {
                                let sub = _sub.replace(lineContent.includes('`') ? /`/g : /'/g, '').replace(REG.replaceNotZh, '_');
                                if (isGenerateJson) {
                                    // sub 不在 zhList 中，则插入
                                    if (zhList.indexOf(sub) === -1) {
                                        zhList.push(sub);
                                        // if (filePath.endsWith('org.component.ts')) {
                                        //     console.log('对org.component.ts进行提取：', sub)
                                        // }
                                    }
                                    let ret = `{{'${sub}' | translate}}`;
                                    // if (type === 'html') {
                                    //     // 将 中文 替换成 {{'中文' | translate}}
                                    //     return `{{'${sub}' | translate}}`;
                                    // }
                                    if (type === 'model.ts') {
                                        // 将 '中文' 替换成 '中文'
                                        ret = `'${sub}'`;
                                        // return `'${sub}'`;
                                    } else if (type === 'js') {
                                        // 将 '中文' 替换成 this.translateService.instant('中文')
                                        ret = `this.translateService.instant('${sub}')`;
                                        // return `this.translateService.instant('${sub}')`;
                                    } else {
                                        ret = `{{'${sub}' | translate}}`;
                                    }
                                    // console.log(`将${_sub}替换成${ret}`);
                                    return ret;
                                } else {
                                    // if (filePath.endsWith('org.component.ts')) {
                                    //     console.log('对org.component.ts进行替换：', sub)
                                    // }
                                    // html：将 {{'中文' | translate}}中的 中文 替换成 zhong_wen
                                    // js: 将 this.translateService.instant('中文') 中的 中文 替换成 zhong_wen
                                    // console.log(`将${_sub}替换成${zhKeyMap[sub]}`);
                                    return type === 'html' ? zhKeyMap[sub] : `'${zhKeyMap[sub]}'`;
                                }
                        }) + afterPart);
                    } else {
                        replacedContentLines.push(lineContent);
                    }
                } else {
                    replacedContentLines.push(lineContent);
                }
            } else {
                replacedContentLines.push(lineContent);
            }
        }
        // 将替换后的内容回写入文件
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        fs.writeFileSync(filePath, replacedContentLines.join('\n'), UTF8);
    }
}
function getFileType(filePath) {
    return filePath.endsWith('.html') ? 'html' : (filePath.endsWith('.model.ts') ? 'model.ts' : 'js');
}
function isNoteLine(line, type = 'js') {
    if (type === 'js' || type === 'model.ts') {
        if (line.trim()) {
            if (line.trim().startsWith('/') || line.trim().startsWith('*')) {
                return true;
            }
        }
    } else if (type === 'html') {
        if (line.includes('<!--') || line.includes('-->')) {
            return true;
        }
    }
}
function isJsLineIncludesZh(line) {
    let checkStr = line;
    if (line.includes('//')) {
        checkStr = line.split('//')[0];
    }
    return REG.hasZh.test(checkStr);
}
function isTranslated(line, type = 'js') {
    let isT = false;
    if (type === 'html') {
        if (line.includes('| translate')) {
            isT = true;
        }
    } else {
        if (line.includes('translateService.instant(')) {
            isT = true;
        }
    }
    return isT;
}

/**
 * 获取字符串在数组中的重复位置
 * @param list 例如 ['abc', 'a', 'b', 'c', 'abc', 'abc']
 * @param str 例如 'abc'
 * @param index 例如 4
 * @return {number}返回所在的重复位置 上面的例子应该返回 1 表示第一个重复的
 */
function getReplaceIndex(list, str, index) {
    // 判断字符串在数组中出现的次数，如果为1，则直接返回0
    let count = 0; // 总共出现次数
    let current = 0; // 在当前index时出现的次数
    for (let i = 0, l = list.length; i < l; i++) {
        const item = list[i];
        if (item === str) {
            count ++; // 出现一次就加1
            if (i === index) {
                current = count; // 当前位置时出现的次数
                return current - 1;
            }
        }
    }
    return 0;
}
function sortChinese(arr) {
    // 先按拼音排序
    arr.sort((item1, item2) => pinyin(item1, {style: pinyin.STYLE_NORMAL}).map(item => item[0]) > pinyin(item2, {style: pinyin.STYLE_NORMAL}).map(item => item[0]));
    // 在按长度排序
    arr.sort((item1, item2) => item1.length > item2.length);
    return arr.sort();
}
/**
 * 根据中文list转化为json内容
 * list = ['返回', '登录'];
 * @param list
 */
function zhListToContent(list) {
    let twLines = [];
    let zhLines = [];
    let enLines = [];
    let keyLines = [];
    let keyCache = [];
    list.forEach((item, i) => {
        let key = pinyin(item, {style: pinyin.STYLE_NORMAL}).map(item => item[0]).join('_');
        keyCache.push(key);
        if (keyCache.indexOf(key) !== -1) {
            key = key + '_'.repeat(getReplaceIndex(keyCache, key, i));
        }
        zhKeyMap[item] = key;
        zhLines.push(`  "${key}": "${item}",`);
        twLines.push(`  "${key}": "${Chinese.s2t(item)}",`);
        enLines.push(`  "${key}": "",`);
        keyLines.push(`  "${key}": "", // ${item}`);
    });
    // console.log('中文keymap', zhKeyMap);
    return {
        zhLines: zhLines.join('\r\n'),
        twLines: twLines.join('\r\n'),
        enLines: enLines.join('\r\n'),
        keyLines: keyLines.join('\r\n'),
    };
}
function zhListAppendToContent(originContent, list) {
    function getContent(key) {
        return originContent[key].replace('/{/g', '').replace('/}/g', '') + '\r\n' + zhListToContent(list)[key];
    }
    return {
        zhLines: getContent('zhLines'),
        twLines: getContent('twLines'),
        enLines: getContent('enLines'),
        keyLines: getContent('keyLines'),
    }
}
