const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
// 替换 pureimage 方案为 node-canvas
const { createCanvas, registerFont, loadImage } = require('canvas');
const FONT_CJK_PATH = path.join(__dirname, 'fonts', 'SourceHanSansSC-Regular.otf');
let FONT_CJK_OK = false;
if (fs.existsSync(FONT_CJK_PATH)) {
  registerFont(FONT_CJK_PATH, { family: 'Source Han Sans SC' });
  FONT_CJK_OK = true;
}
// 注册 Roboto 字体
const FONT_ROBOTO_PATH = path.join(__dirname, 'fonts', 'Roboto-Regular.ttf');
let FONT_ROBOTO_OK = false;
if (fs.existsSync(FONT_ROBOTO_PATH)) {
  registerFont(FONT_ROBOTO_PATH, { family: 'Roboto' });
  FONT_ROBOTO_OK = true;
}

const app = express();
const PORT = 3000;
const CACHE_PATH = path.join(__dirname, 'latest.png');
const CACHE_META = path.join(__dirname, 'cache.json');
const BLOG_URL = 'https://modcxblog.cn/';

// 获取最新文章信息
async function fetchLatestArticle() {
  const res = await axios.get(BLOG_URL);
  const $ = cheerio.load(res.data);
  // 获取首页第一篇文章（不限制年份）
  const firstArticle = $('a[href*="/"]').filter((i, el) => {
    const href = $(el).attr('href');
    // 匹配文章链接格式，如 /2024/07/22/文章名/ 或 /2025/01/01/文章名/
    return href && /\/\d{4}\/\d{2}\/\d{2}\//.test(href);
  }).first();
  const title = firstArticle.text().trim();
  const link = firstArticle.attr('href');
  let createdAt = '', views = '', tags = '', comments = '', words = '', readTime = '';
  if (link) {
    try {
      const articleRes = await axios.get(link);
      const $a = cheerio.load(articleRes.data);
      const metaText = $a('.post-meta').text();
      createdAt = metaText.match(/\d{4}-\d{1,2}-\d{1,2} \d{2}:\d{2}/)?.[0] || '';
      views = metaText.match(/\|\s*([\d,]+)\s*\|/)?.[1] || '';
      comments = metaText.match(/\|\s*[\d,]+\s*\|\s*(\d+)\s*\|/)?.[1] || '';
      words = metaText.match(/(\d+) 字/)?.[1] || '';
      readTime = metaText.match(/(\d+) 分钟/)?.[1] || '';
      tags = $a('.post-meta a').map((i, el) => $a(el).text()).get().join(', ');
    } catch (e) {}
  }
  return { title, createdAt, views, tags, comments, words, readTime, link };
}

// 判断字符是否为中文
function isChinese(char) {
  return /[\u4e00-\u9fa5]/.test(char);
}
// 判断字符是否为英文或符号
function isAscii(char) {
  return /[\x00-\x7F]/.test(char);
}
// 支持中英文混排的文本自动换行渲染
function drawText(ctx, text, x, y, maxWidth, lineHeight) {
  let lastFont = null;
  let drawX = x;
  let fontSize = ctx.font.match(/\d+pt/)[0];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isZh = /[\u4e00-\u9fa5]/.test(char);
    const font = isZh ? "'Microsoft YaHei'" : "'Roboto'";
    const fontStr = fontSize + ' ' + font;
    if (lastFont !== fontStr) {
      ctx.font = fontStr;
      lastFont = fontStr;
    }
    const charWidth = ctx.measureText(char).width;
    if (drawX + charWidth > x + maxWidth) {
      y += lineHeight;
      drawX = x;
    }
    ctx.fillText(char, drawX, y);
    drawX += charWidth;
  }
}

// node-canvas 绘制 svg icon 辅助函数
async function drawIcon(ctx, iconName, x, y, size = 22) {
  const iconPath = path.join(__dirname, 'icons', iconName + '.svg');
  if (fs.existsSync(iconPath)) {
    const img = await loadImage(iconPath);
    ctx.drawImage(img, x, y, size, size);
  }
}

// 生成图片（使用 node-canvas）
async function generateImage({ title, createdAt, views, tags, comments, words, readTime, updatedAt }) {
  const width = 1000;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景 - 线性渐变
  const gradient = ctx.createLinearGradient(width, height, 0, 0);
  gradient.addColorStop(0, '#5E72E4'); // 主题色
  gradient.addColorStop(0.4, '#8A9BFF'); // 中间过渡色
  gradient.addColorStop(1, '#E8ECFF'); // 浅色结束
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 毛玻璃效果 - 半透明白色覆盖层
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(0, 0, width, height);

  // 毛玻璃效果 - 添加微妙噪点纹理
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2 + 1;
    ctx.fillRect(x, y, size, size);
  }

  // 毛玻璃效果 - 第二层半透明覆盖
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(0, 0, width, height);

  // 标题 - 添加阴影效果
  ctx.save();
  // 阴影
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#222';
  ctx.font = "28pt 'Microsoft YaHei'";
  drawText(ctx, title, 40, 80, width - 80, 34);
  ctx.restore();

  let y = 80 + 34 + 20; // 标题下方间距
  const iconSize = 24; // 放大图标
  const lineHeight = 32; // 放大行高
  ctx.save();
  ctx.font = "18pt 'Microsoft YaHei'"; // 放大字体
  ctx.fillStyle = '#444';
  const iconX = 60; // 往右移动
  const textX = iconX + iconSize + 10; // 调整文字位置
  
  if (createdAt) {
    const iconY = y - iconSize / 2 - 8; // 调整图标位置适应新尺寸
    await drawIcon(ctx, 'clock', iconX, iconY, iconSize);
    drawText(ctx, createdAt, textX, y, width - 80, lineHeight);
    y += lineHeight + 6;
  }
  if (views) {
    const iconY = y - iconSize / 2 - 8;
    await drawIcon(ctx, 'eye', iconX, iconY, iconSize);
    drawText(ctx, views, textX, y, width - 80, lineHeight);
    y += lineHeight + 6;
  }
  if (tags) {
    const iconY = y - iconSize / 2 - 8;
    await drawIcon(ctx, 'tag', iconX, iconY, iconSize);
    drawText(ctx, tags, textX, y, width - 80, lineHeight);
    y += lineHeight + 6;
  }
  if (comments) {
    const iconY = y - iconSize / 2 - 8;
    await drawIcon(ctx, 'comment', iconX, iconY, iconSize);
    drawText(ctx, comments, textX, y, width - 80, lineHeight);
    y += lineHeight + 6;
  }
  if (words) {
    const iconY = y - iconSize / 2 - 8;
    await drawIcon(ctx, 'pen-to-square', iconX, iconY, iconSize);
    drawText(ctx, words, textX, y, width - 80, lineHeight);
    y += lineHeight + 6;
  }
  if (readTime) {
    const iconY = y - iconSize / 2 - 8;
    await drawIcon(ctx, 'hourglass', iconX, iconY, iconSize);
    drawText(ctx, readTime + ' 分钟', textX, y, width - 80, lineHeight);
    y += lineHeight + 6;
  }
  ctx.restore();

  // 更新时间
  ctx.save();
  ctx.font = "12pt 'Microsoft YaHei'";
  ctx.fillStyle = '#888';
  ctx.fillText('更新时间: ' + updatedAt, 40, height - 40);
  ctx.restore();

  // 网站logo
  try {
    const logoImg = await loadImage('./logo.png');
    const logoSize = 220;
    // 保持 logo 原始长宽比进行缩放
    const aspectRatio = logoImg.width / logoImg.height;
    let drawWidth = logoSize, drawHeight = logoSize;
    if (aspectRatio > 1) {
      drawHeight = logoSize / aspectRatio;
    } else {
      drawWidth = logoSize * aspectRatio;
    }
    ctx.drawImage(
      logoImg,
      width - 80 - drawWidth,
      height / 2 - drawHeight / 2,
      drawWidth,
      drawHeight
    );
  } catch (e) {
    // logo加载失败时忽略
  }

  // 签名
  ctx.save();
  ctx.font = "15pt 'Microsoft YaHei'";
  ctx.fillStyle = '#F8F1F1';
  ctx.textAlign = 'right';
  ctx.fillText('惟有忍耐到底的，必然得救', width - 40, height - 80);
  ctx.restore();

  // 网站来源
  ctx.save();
  ctx.font = "12pt 'Microsoft YaHei'";
  ctx.fillStyle = '#F8F1F1';
  ctx.textAlign = 'right';
  ctx.fillText('https://modcxblog.cn/', width - 40, height - 40);
  ctx.restore();

  // 输出buffer
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(CACHE_PATH, buffer);
  return buffer;
}

// 缓存图片和元数据
function saveCache(data, buffer) {
  fs.writeFileSync(CACHE_PATH, buffer);
  fs.writeFileSync(CACHE_META, JSON.stringify(data));
}

// 读取缓存
function loadCache() {
  if (fs.existsSync(CACHE_PATH) && fs.existsSync(CACHE_META)) {
    const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf-8'));
    const buffer = fs.readFileSync(CACHE_PATH);
    return { meta, buffer };
  }
  return null;
}

// 批量修复 /icons 目录下 svg 文件，确保 <svg> 标签有 width/height
function fixSvgIconSize(iconPath, width = 24, height = 24) {
  let content = fs.readFileSync(iconPath, 'utf-8');
  if (!content.includes('width=') || !content.includes('height=')) {
    content = content.replace('<svg ', `<svg width="${width}" height="${height}" `);
    fs.writeFileSync(iconPath, content, 'utf-8');
  }
}
['clock','eye','tag','comment','pen-to-square','hourglass'].forEach(name => {
  const iconPath = path.join(__dirname, 'icons', name + '.svg');
  if (fs.existsSync(iconPath)) fixSvgIconSize(iconPath);
});

app.get('/', async (req, res) => {
  const disableCache = req.query.disable_cache === 'true';
  let cache = null;
  if (!disableCache) {
    cache = loadCache();
  }
  if (cache) {
    res.set('Content-Type', 'image/png');
    res.send(cache.buffer);
    return;
  }
  // 获取最新文章
  let article;
  try {
    article = await fetchLatestArticle();
  } catch (e) {
    res.status(500).send('获取文章失败');
    return;
  }
  const updatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const buffer = await generateImage({
    ...article,
    updatedAt
  });
  saveCache({ updatedAt, ...article }, buffer);
  res.set('Content-Type', 'image/png');
  res.send(buffer);
});

app.listen(PORT, () => {
  console.log(`ModCxBlogLatestArticle API running at http://localhost:${PORT}/`);
});
