#!/usr/bin/env node
/**
 * 统一同步脚本
 *
 * 从 tools.json 同步到所有相关文件：
 * - index.html: CATEGORIES 数组、TOOLS 数组、SEO meta、统计数字
 * - README.md: 徽章、标题、工具数量
 * - sitemap.xml: 所有工具 URL
 * - manifest.json: 描述中的工具数量
 * - GitHub 仓库描述
 *
 * 用法: pnpm run sync
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const TOOLS_JSON = path.join(ROOT_DIR, 'tools.json');
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const README_MD = path.join(ROOT_DIR, 'README.md');
const SITEMAP_XML = path.join(ROOT_DIR, 'sitemap.xml');
const MANIFEST_JSON = path.join(ROOT_DIR, 'manifest.json');
const LLMS_TXT = path.join(ROOT_DIR, 'llms.txt');
const EN_JSON = path.join(ROOT_DIR, 'i18n', 'en.json');
const ZH_JSON = path.join(ROOT_DIR, 'i18n', 'zh-CN.json');

// 网站域名 (不带尾部斜杠)
const SITE_URL = 'https://tools.realtime-ai.chat';

// 优先显示的分类顺序
const PRIORITY_CATEGORIES = [
  'dev',
  'text',
  'time',
  'generator',
  'media',
  'privacy',
  'security',
  'network',
  'calculator',
  'converter',
  'extractor',
  'ai',
  'life'
];

/**
 * 转义特殊字符
 */
function escapeString(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * 生成工具的 JS 对象字符串
 */
function toolToJsLine(tool) {
  const url = escapeString(tool.path);
  const category = escapeString(tool.category);
  const name = escapeString(tool.name);
  const desc = escapeString(tool.description || tool.name);
  const icon = escapeString(tool.icon || '🔧');
  const keywords = escapeString(tool.keywords || tool.name);
  const pop = Number.isFinite(tool.popularity) ? tool.popularity : 0;

  return `      { url: '${url}', category: '${category}', name: '${name}', desc: '${desc}', icon: '${icon}', keywords: '${keywords}', pop: ${pop} },`;
}

/**
 * 获取排序后的分类列表
 */
function getSortedCategories(categories) {
  const allCatIds = Object.keys(categories);
  const sorted = [];

  for (const catId of PRIORITY_CATEGORIES) {
    if (categories[catId]) {
      sorted.push(catId);
    }
  }

  for (const catId of allCatIds) {
    if (!sorted.includes(catId)) {
      sorted.push(catId);
    }
  }

  return sorted;
}

/* ---------- 分类落地页 ---------- */

/** HTML 文本转义 */
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML 属性值转义 */
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

/** 把对象序列化为可安全内嵌 <script> 的 JSON-LD 文本 */
function toJsonLd(obj) {
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

/** 分类落地页的内联样式（与 tool-base.css 设计 token 一致） */
const CATEGORY_PAGE_CSS = `
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg-deep);
        color: var(--text-primary);
        font-family: var(--font-sans);
        -webkit-font-smoothing: antialiased;
      }
      .cat-main {
        max-width: 1100px;
        margin: 0 auto;
        padding: calc(var(--nav-height) + var(--space-6)) var(--space-5) var(--space-10);
      }
      .cat-hero {
        text-align: center;
        margin-bottom: var(--space-8);
      }
      .cat-hero-icon {
        font-size: 3rem;
        line-height: 1;
      }
      .cat-hero h1 {
        font-size: 1.9rem;
        margin: var(--space-3) 0 var(--space-2);
      }
      .cat-intro {
        max-width: 640px;
        margin: 0 auto var(--space-3);
        color: var(--text-secondary);
        line-height: 1.7;
      }
      .cat-meta {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 0.8rem;
        color: var(--text-muted);
      }
      .cat-table {
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--bg-card);
        contain: layout style;
      }
      .cat-table-header {
        display: grid;
        grid-template-columns: minmax(220px, 1.2fr) minmax(260px, 2.2fr);
        align-items: center;
        padding: 0 16px;
        height: 44px;
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border-subtle);
        font-family: var(--font-mono);
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        user-select: none;
      }
      .cat-viewport {
        max-height: 62vh;
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      .cat-spacer {
        position: relative;
        width: 100%;
      }
      .cat-row {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: var(--row-height, 52px);
        display: grid;
        grid-template-columns: minmax(220px, 1.2fr) minmax(260px, 2.2fr);
        align-items: center;
        padding: 0 16px;
        border-bottom: 1px solid var(--border-subtle);
        background: var(--bg-card);
        transition: background 0.15s ease;
        will-change: transform;
      }
      .cat-row:hover {
        background: var(--bg-card-hover);
      }
      .cat-col {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: hidden;
      }
      .cat-col-desc {
        font-size: 0.85rem;
        color: var(--text-secondary);
        white-space: nowrap;
        text-overflow: ellipsis;
        user-select: text;
      }
      .cat-row-link {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        text-decoration: none;
        color: inherit;
      }
      .cat-row-link .cat-icon-sm {
        width: 30px;
        height: 30px;
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        flex-shrink: 0;
        transition: all 0.3s ease;
      }
      .cat-row-link:hover .cat-icon-sm {
        background: var(--accent-cyan);
        border-color: var(--accent-cyan);
      }
      .cat-row-name {
        font-family: var(--font-mono);
        font-size: 0.88rem;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cat-row-link:hover .cat-row-name {
        color: var(--accent-cyan);
      }
      .cat-faq {
        margin-top: var(--space-10);
      }
      .cat-faq h2 {
        font-size: 1.1rem;
        margin-bottom: var(--space-3);
      }
      .cat-footer {
        margin-top: var(--space-8);
        text-align: center;
      }
      .cat-footer a {
        font-size: 0.9rem;
        color: var(--accent-cyan);
        text-decoration: none;
      }
      .cat-footer a:hover {
        text-decoration: underline;
      }
      @media (width <= 640px) {
        .cat-main {
          padding-left: var(--space-3);
          padding-right: var(--space-3);
        }
        .cat-table-header,
        .cat-row {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
          padding: 0 12px;
        }
        .cat-viewport {
          height: 56vh;
          min-height: 260px;
        }
        .cat-row-name {
          font-size: 0.8rem;
        }
        .cat-col-desc {
          font-size: 0.78rem;
        }
      }
`;

/** 计算从 tools/<catId>/index.html 到目标工具的相对链接 */
function relToolHref(catId, toolPath) {
  return path.posix.relative('tools/' + catId, toolPath);
}

/**
 * 生成单个分类落地页 HTML
 */
function categoryPageHtml(catId, cat, catTools) {
  const name = cat.name;
  const intro = cat.intro || `${name}相关的在线工具集合。`;
  const icon = cat.icon || '📦';
  const count = catTools.length;
  const canonical = `${SITE_URL}/tools/${catId}/index.html`;
  const title = `${name} - 在线工具合集（${count}个）| WebUtils`;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: name, item: canonical }
    ]
  };
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: intro,
    url: canonical,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: count,
      itemListElement: catTools.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: t.name,
        url: `${SITE_URL}/${t.path}`
      }))
    }
  };

  // 内联工具数据：原始值进 JSON（JSON.stringify 已处理引号/反斜杠），
  // 额外把 < 转义为 \u003c 防止 </script> 提前闭合内联脚本
  const toolsData = catTools.map((t) => ({
    href: relToolHref(catId, t.path),
    icon: t.icon || '🔧',
    name: t.name,
    desc: t.description || t.name
  }));

  const toolsJson = JSON.stringify(toolsData).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttr(intro)}" />
    <meta name="keywords" content="${escapeAttr(name + ',在线工具,免费工具,' + name + '大全')}" />
    <meta name="author" content="WebUtils" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:title" content="${escapeAttr(title)}" />
    <meta property="og:description" content="${escapeAttr(intro)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="WebUtils" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:image" content="${SITE_URL}/social-preview.png" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeAttr(title)}" />
    <meta name="twitter:description" content="${escapeAttr(intro)}" />
    <meta name="twitter:image" content="${SITE_URL}/social-preview.png" />
    <script type="application/ld+json">
${toJsonLd(breadcrumb)}
    </script>
    <script type="application/ld+json">
${toJsonLd(collection)}
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../../assets/css/tool-base.css" />
    <style>${CATEGORY_PAGE_CSS}    </style>
    <!-- PWA -->
    <link rel="manifest" href="../../manifest.json" />
    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="../../favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="../../favicon-16x16.png" />
    <link rel="apple-touch-icon" href="../../apple-touch-icon.png" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#1a1a1a" media="(prefers-color-scheme: dark)" />
    <script src="../../assets/js/tool-chrome.js"></script>
  </head>
  <body>
    <main class="cat-main">
      <header class="cat-hero">
        <div class="cat-hero-icon">${escapeHtml(icon)}</div>
        <h1>${escapeHtml(name)}</h1>
        <p class="cat-intro">${escapeHtml(intro)}</p>
        <p class="cat-meta">${count} 个工具 · 纯本地运行 · 免费 · 无广告</p>
      </header>
      <section class="cat-table">
        <div class="cat-table-header" aria-hidden="true">
          <span class="cat-col">工具</span>
          <span class="cat-col cat-col-desc">描述</span>
        </div>
        <div class="cat-viewport" id="cat-viewport" role="list" aria-label="${escapeAttr(name + '工具列表')}">
          <div class="cat-spacer" id="cat-spacer"></div>
        </div>
      </section>
      <footer class="cat-footer">
        <a href="../../index.html">← 返回 WebUtils 全部工具</a>
      </footer>
    </main>
    <script src="../../assets/js/virtual-core.js"></script>
    <script>
      // 分类工具数据（由 sync 脚本生成）
      const CAT_TOOLS = ${toolsJson};
      const ROW_HEIGHT = 52;
      const vp = document.getElementById('cat-viewport');
      const spacer = document.getElementById('cat-spacer');
      const rowCache = new Map();

      const virtualizer = new VirtualCore.Virtualizer({
        count: CAT_TOOLS.length,
        getScrollElement: () => vp,
        estimateSize: () => ROW_HEIGHT,
        overscan: 8,
        observeElementRect: VirtualCore.observeElementRect,
        observeElementOffset: VirtualCore.observeElementOffset,
        scrollToFn: VirtualCore.elementScroll,
        getItemKey: (index) => index,
        onChange: () => renderRows()
      });

      function createRow(tool) {
        const row = document.createElement('div');
        row.className = 'cat-row';
        const link = document.createElement('a');
        link.className = 'cat-row-link';
        link.href = tool.href;
        const icon = document.createElement('span');
        icon.className = 'cat-icon-sm';
        icon.textContent = tool.icon;
        const name = document.createElement('span');
        name.className = 'cat-row-name';
        name.textContent = tool.name;
        link.appendChild(icon);
        link.appendChild(name);
        const desc = document.createElement('span');
        desc.className = 'cat-col cat-col-desc';
        desc.textContent = tool.desc;
        desc.title = tool.desc;
        row.appendChild(link);
        row.appendChild(desc);
        return row;
      }

      function renderRows() {
        const items = virtualizer.getVirtualItems();
        spacer.style.height = virtualizer.getTotalSize() + 'px';
        const liveKeys = new Set(items.map((i) => i.key));
        for (const [key, row] of rowCache) {
          if (!liveKeys.has(key)) {
            row.remove();
            rowCache.delete(key);
          }
        }
        for (const item of items) {
          let row = rowCache.get(item.key);
          if (!row) {
            row = createRow(CAT_TOOLS[item.index]);
            rowCache.set(item.key, row);
          }
          if (!row.isConnected) {
            spacer.appendChild(row);
          }
          row.style.transform = 'translateY(' + item.start + 'px)';
        }
      }

      virtualizer._willUpdate();
      virtualizer.measure();
    </script>
  </body>
</html>
`;
}

/**
 * 生成全部分类落地页 tools/<cat>/index.html
 * 已作为工具登记的分类首页（如 ai-coding 的手工导航页）不覆盖。
 * 幂等写入：生成内容先经 prettier 格式化，与磁盘相同则不写，
 * 避免 dev watcher 监听 tools/ 时陷入「sync 写文件 → watcher 触发 → 再 sync」循环。
 * @returns {Promise<string[]>} 生成的页面相对路径列表
 */
async function generateCategoryPages(categories, groupedTools, registeredPaths) {
  let prettier = null;
  try {
    prettier = await import('prettier');
  } catch {
    // prettier 不可用时降级为不格式化（保持原有行为）
  }

  const generated = [];
  let writtenCount = 0;
  for (const catId of Object.keys(categories)) {
    const rel = `tools/${catId}/index.html`;
    if (registeredPaths.has(rel)) continue;
    const catTools = groupedTools[catId] || [];
    if (catTools.length === 0) continue;
    let html = categoryPageHtml(catId, categories[catId], catTools);

    // 与 prettier 格式化后的产物保持一致（CI 同步检查依赖此稳定性）
    if (prettier) {
      try {
        html = await prettier.format(html, { parser: 'html' });
      } catch {
        // 格式化失败时用原始输出
      }
    }

    // 所有应存在的分类页都计入 generated（sitemap 依赖此完整列表），
    // 仅内容变化时写盘，避免 dev watcher 陷入 rebuild 循环
    generated.push(rel);
    const abs = path.join(ROOT_DIR, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf8') !== html) {
      fs.writeFileSync(abs, html);
      writtenCount++;
    }
  }
  console.log(`✅ 分类落地页: ${generated.length} 个${writtenCount > 0 ? `（写入 ${writtenCount} 个）` : '（无变化）'}`);
  return generated;
}

/**
 * 主函数
 */
async function main() {
  console.log('🔄 开始同步...\n');

  // 读取 tools.json
  if (!fs.existsSync(TOOLS_JSON)) {
    console.error('❌ tools.json not found');
    process.exit(1);
  }

  const toolsData = JSON.parse(fs.readFileSync(TOOLS_JSON, 'utf8'));
  const { categories, tools: toolsObj } = toolsData;
  const tools = Object.values(toolsObj);

  const toolCount = tools.length;
  const categoryCount = Object.keys(categories).length;
  const sortedCategories = getSortedCategories(categories);

  console.log(`📦 数据源: ${toolCount} 工具, ${categoryCount} 分类\n`);

  // 按分类分组
  const groupedTools = {};
  for (const tool of tools) {
    if (!groupedTools[tool.category]) {
      groupedTools[tool.category] = [];
    }
    groupedTools[tool.category].push(tool);
  }

  // 检查未定义的分类
  const undefinedCategories = Object.keys(groupedTools).filter((cat) => !categories[cat]);
  if (undefinedCategories.length > 0) {
    console.warn(`⚠️  未定义的分类: ${undefinedCategories.join(', ')}`);
  }

  // 生成 CATEGORIES 数组
  const categoriesItems = [
    "      { id: 'all', name: '全部', icon: '🏠' },",
    "      { id: 'favorites', name: '收藏', icon: '⭐' },",
    "      { id: 'recent', name: '最近', icon: '🕐' },"
  ];

  for (const catId of sortedCategories) {
    const cat = categories[catId];
    if (cat && groupedTools[catId] && groupedTools[catId].length > 0) {
      const icon = escapeString(cat.icon || '📦');
      categoriesItems.push(
        `      { id: '${catId}', name: '${escapeString(cat.name)}', icon: '${icon}' },`
      );
    }
  }

  const categoriesJs = `const CATEGORIES = [\n${categoriesItems.join('\n')}\n    ];`;

  // 生成 TOOLS 数组
  const toolsLines = [];

  for (const catId of sortedCategories) {
    const catTools = groupedTools[catId];
    if (catTools && catTools.length > 0) {
      const catName = categories[catId]?.name || catId;
      toolsLines.push(`      // ${catName}`);

      for (const tool of catTools) {
        toolsLines.push(toolToJsLine(tool));
      }
    }
  }

  const toolsJs = `const TOOLS = [\n${toolsLines.join('\n')}\n    ];`;

  // 生成分类落地页（须在 sitemap 之前，sitemap 要纳入这些页面的 URL）
  const registeredPaths = new Set(tools.map((t) => t.path));
  const categoryPages = await generateCategoryPages(categories, groupedTools, registeredPaths);

  // 执行所有同步
  const results = {
    indexHtml: await updateIndexHtml(categoriesJs, toolsJs, toolCount, categoryCount),
    readme: updateReadme(toolCount, categoryCount),
    sitemap: updateSitemap(tools, toolCount, categoryPages),
    manifest: updateManifest(toolCount),
    i18n: updateI18n(toolCount),
    llmsTxt: updateLlmsTxt(toolCount, categories, groupedTools, sortedCategories),
    github: updateGitHubDescription(toolCount)
  };

  // 统计各分类数量
  const activeCategories = sortedCategories.filter(
    (cat) => groupedTools[cat] && groupedTools[cat].length > 0
  );
  console.log(`\n📊 分类统计 (${activeCategories.length} 个活跃分类):`);
  for (const cat of activeCategories) {
    const catInfo = categories[cat];
    const count = groupedTools[cat]?.length || 0;
    console.log(`   ${catInfo?.icon || '📦'} ${catInfo?.name || cat}: ${count}`);
  }

  // 汇总结果
  console.log('\n' + '='.repeat(50));
  console.log('📋 同步结果汇总:');
  console.log(`   index.html:    ${results.indexHtml ? '✅ 已更新' : '⏭️  无变化'}`);
  console.log(`   README.md:     ${results.readme ? '✅ 已更新' : '⏭️  无变化'}`);
  console.log(`   sitemap.xml:   ${results.sitemap ? '✅ 已更新' : '⏭️  无变化'}`);
  console.log(`   manifest.json: ${results.manifest ? '✅ 已更新' : '⏭️  无变化'}`);
  console.log(`   i18n:          ${results.i18n ? '✅ 已更新' : '⏭️  无变化'}`);
  console.log(`   llms.txt:      ${results.llmsTxt ? '✅ 已更新' : '⏭️  无变化'}`);
  console.log(`   GitHub 描述:   ${results.github ? '✅ 已更新' : '⏭️  无变化'}`);
  console.log('='.repeat(50));
}

/**
 * 更新 index.html
 */
async function updateIndexHtml(categoriesJs, toolsJs, toolCount, categoryCount) {
  if (!fs.existsSync(INDEX_HTML)) {
    console.error('❌ index.html not found');
    return false;
  }

  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  let updated = false;

  // 替换 CATEGORIES 数组
  const categoriesRegex = /const CATEGORIES = \[\s*[\s\S]*?\n\s*\];/;
  if (categoriesRegex.test(html)) {
    html = html.replace(categoriesRegex, () => categoriesJs);
    updated = true;
  }

  // 替换 TOOLS 数组
  const toolsRegex = /const TOOLS = \[\s*[\s\S]*?\n\s*\];/;
  if (toolsRegex.test(html)) {
    html = html.replace(toolsRegex, () => toolsJs);
    updated = true;
  }

  // 更新 SEO meta / OG / Twitter / JSON-LD 中所有 "X+ 个 [修饰词] 工具(集)?" 表述
  // 覆盖：包含 1001+ 个实用工具 / 1001+ 个纯前端实用工具 / 1001+ 个纯前端开发者工具集 / 1001+ 个工具
  // 长修饰词放前以便 alternation 优先匹配
  html = html.replace(
    /\d+\+?\s*个(纯前端实用|纯前端开发者|纯前端|实用|开发者)?\s*工具(集)?/g,
    (_m, modifier, suffix) => `${toolCount}+ 个${modifier || ''}工具${suffix || ''}`
  );
  // 同步类别数（如 "等 35 个类别"、"覆盖 35 个类别"）
  html = html.replace(/\d+\s*个类别/g, `${categoryCount} 个类别`);

  // 更新统计初始值
  html = html.replace(/(<span[^>]*id="tool-count"[^>]*>)\d+(<\/span>)/g, `$1${toolCount}$2`);
  html = html.replace(
    /(<span[^>]*id="category-count"[^>]*>)\d+(<\/span>)/g,
    `$1${categoryCount}$2`
  );

  if (updated) {
    // 幂等写入：格式化后与磁盘比较，内容未变化则不写
    let finalHtml = html;
    try {
      const prettier = await import('prettier');
      finalHtml = await prettier.format(html, { parser: 'html' });
    } catch {
      // prettier 不可用时用原始输出
    }
    if (fs.readFileSync(INDEX_HTML, 'utf8') !== finalHtml) {
      fs.writeFileSync(INDEX_HTML, finalHtml);
    } else {
      console.log('⏭️  index.html: 内容无变化');
      return false;
    }
    console.log(`✅ index.html: ${toolCount} 工具, ${categoryCount} 分类`);
    return true;
  }

  console.log('⏭️  index.html: 无需更新');
  return false;
}

/**
 * 更新 README.md
 */
function updateReadme(toolCount) {
  try {
    if (!fs.existsSync(README_MD)) {
      return false;
    }

    let readme = fs.readFileSync(README_MD, 'utf8');
    const original = readme;

    // 更新 badge
    readme = readme.replace(/Tools-\d+\+-/g, `Tools-${toolCount}+-`);

    // 更新标题
    readme = readme.replace(/(🚀\s*)?\d+\+\s*纯前端/g, `🚀 ${toolCount}+ 纯前端`);

    // 更新工具列表标题
    readme = readme.replace(/工具列表[^)]*\(\d+\s*个\)/g, `工具列表 (${toolCount} 个)`);
    readme = readme.replace(/#工具列表-\d+-个/g, `#工具列表-${toolCount}-个`);

    // 更新正文中所有 "X+ 个 [修饰词] 工具(集)?" 表述（如 "查看全部 1001+ 个工具"）
    readme = readme.replace(
      /\d+\+?\s*个(纯前端实用|纯前端开发者|纯前端|实用|开发者)?\s*工具(集)?/g,
      (_m, modifier, suffix) => `${toolCount}+ 个${modifier || ''}工具${suffix || ''}`
    );

    if (readme !== original) {
      fs.writeFileSync(README_MD, readme);
      // 运行 prettier 格式化，确保表格列宽等与项目代码风格一致
      try {
        execFileSync('npx', ['prettier', '--write', README_MD], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch {
        // prettier 不可用时静默失败
      }
      console.log(`✅ README.md: ${toolCount}+ 工具`);
      return true;
    }

    console.log('⏭️  README.md: 无需更新');
    return false;
  } catch (err) {
    console.log(`⚠️  README.md: ${err.message}`);
    return false;
  }
}

/**
 * 更新 sitemap.xml
 */
function updateSitemap(tools, toolCount, categoryPages = []) {
  const today = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- 首页 -->
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
`;

  // 分类落地页
  for (const page of categoryPages) {
    xml += `
  <url>
    <loc>${SITE_URL}/${page}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
  }

  // 添加每个工具页面
  for (const tool of tools) {
    xml += `
  <url>
    <loc>${SITE_URL}/${tool.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `
</urlset>
`;

  // 检查是否有变化（按内容整体比对，而非仅按 URL 数量 —— 数量相同但内容不同时不能漏更新）
  if (fs.existsSync(SITEMAP_XML)) {
    const existing = fs.readFileSync(SITEMAP_XML, 'utf8');
    if (existing === xml) {
      console.log('⏭️  sitemap.xml: 无需更新');
      return false;
    }
  }

  fs.writeFileSync(SITEMAP_XML, xml);
  console.log(`✅ sitemap.xml: ${toolCount + 1 + categoryPages.length} URLs`);
  return true;
}

/**
 * 更新 manifest.json
 */
function updateManifest(toolCount) {
  try {
    if (!fs.existsSync(MANIFEST_JSON)) {
      return false;
    }

    let manifest = fs.readFileSync(MANIFEST_JSON, 'utf8');
    const original = manifest;

    // 更新描述中的工具数量 (覆盖所有 "X+ 个 [修饰词] 工具(集)?" 表述)
    manifest = manifest.replace(
      /\d+\+?\s*个(纯前端实用|纯前端开发者|纯前端|实用|开发者)?\s*工具(集)?/g,
      (_m, modifier, suffix) => `${toolCount}+ 个${modifier || ''}工具${suffix || ''}`
    );

    if (manifest !== original) {
      fs.writeFileSync(MANIFEST_JSON, manifest);
      console.log(`✅ manifest.json: ${toolCount}+ 工具`);
      return true;
    }

    console.log('⏭️  manifest.json: 无需更新');
    return false;
  } catch (err) {
    console.log(`⚠️  manifest.json: ${err.message}`);
    return false;
  }
}

/**
 * 更新 i18n 翻译文件中的工具数
 *
 * en.json / zh-CN.json 的 subtitle 含 "N+ ..." 形式的工具数，
 * 这里只替换数字，保留各语言原有措辞。
 */
function updateI18n(toolCount) {
  let changed = false;
  for (const file of [EN_JSON, ZH_JSON]) {
    try {
      if (!fs.existsSync(file)) continue;
      const original = fs.readFileSync(file, 'utf8');
      const updated = original.replace(/("subtitle"\s*:\s*")\d+(\+)/, `$1${toolCount}$2`);
      if (updated !== original) {
        fs.writeFileSync(file, updated);
        changed = true;
      }
    } catch (err) {
      console.log(`⚠️  ${path.basename(file)}: ${err.message}`);
    }
  }
  console.log(changed ? `✅ i18n: ${toolCount}+ 工具` : '⏭️  i18n: 无需更新');
  return changed;
}

/**
 * 更新 llms.txt
 *
 * 内容由 tools.json 完整重生成：固定头部 + 每个分类取 popularity 最高的 N 个工具 + 固定尾部。
 * 不再手工维护内部链接，避免工具改名/移动后产生死链。
 */
function updateLlmsTxt(toolCount, categories, groupedTools, sortedCategories) {
  try {
    const TOP_PER_CATEGORY = 6;

    const header = `# WebUtils

> WebUtils 是一个纯前端开发者工具集，包含 ${toolCount}+ 个实用工具。每个工具都是独立的 HTML 文件，内联 CSS/JS，无需构建，可离线使用。所有数据处理都在浏览器端完成，不上传服务器，保护用户隐私。

WebUtils 提供开发者日常工作中常用的各类工具：JSON/YAML/XML 格式化与转换、Base64/URL/Unicode 编解码、时间戳与时区转换、二维码生成、图片压缩、正则表达式测试、哈希计算等。

技术特点：

- 单文件架构：每个工具是独立 HTML 文件
- 零构建：无需 npm、webpack，直接打开使用
- 可离线：下载到本地即可断网使用
- 隐私安全：所有数据处理在浏览器端完成
`;

    const sections = [];
    for (const catId of sortedCategories) {
      const catTools = groupedTools[catId];
      const catInfo = categories[catId];
      if (!catTools || catTools.length === 0 || !catInfo) continue;

      const top = [...catTools]
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, TOP_PER_CATEGORY);

      const lines = top.map((t) => {
        const desc = (t.description || t.name).replace(/\s+/g, ' ').trim();
        return `- [${t.name}](${SITE_URL}/${t.path}): ${desc}`;
      });

      sections.push(`## ${catInfo.name}\n\n${lines.join('\n')}`);
    }

    const footer = `## Optional

- [GitHub 仓库](https://github.com/chicogong/html-tools): 源代码、Issue 反馈、贡献指南
- [完整工具列表](${SITE_URL}/): 首页查看全部 ${toolCount}+ 工具
`;

    const txt = `${header}\n${sections.join('\n\n')}\n\n${footer}`;

    const existing = fs.existsSync(LLMS_TXT) ? fs.readFileSync(LLMS_TXT, 'utf8') : '';
    if (existing === txt) {
      console.log('⏭️  llms.txt: 无需更新');
      return false;
    }

    fs.writeFileSync(LLMS_TXT, txt);
    console.log(`✅ llms.txt: ${toolCount}+ 工具，${sections.length} 个分类`);
    return true;
  } catch (err) {
    console.log(`⚠️  llms.txt: ${err.message}`);
    return false;
  }
}

/**
 * 更新 GitHub 仓库描述
 */
function updateGitHubDescription(toolCount) {
  try {
    const result = execFileSync(
      'gh',
      ['repo', 'view', '--json', 'description', '-q', '.description'],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    const currentDesc = result.trim();

    const newDesc = currentDesc.replace(/\d+\+\s*纯前端/, `${toolCount}+ 纯前端`);

    if (newDesc !== currentDesc) {
      execFileSync('gh', ['repo', 'edit', '--description', newDesc], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log(`✅ GitHub 描述: ${toolCount}+ 纯前端`);
      return true;
    }

    console.log('⏭️  GitHub 描述: 无需更新');
    return false;
  } catch {
    console.log('⚠️  GitHub 描述: gh CLI 不可用');
    return false;
  }
}

main().catch((err) => {
  console.error('❌ 同步失败:', err);
  process.exit(1);
});
