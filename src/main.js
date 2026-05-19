// ==================== 1. Tauri API 引入与全局变量声明 ====================
const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

const appWindow = getCurrentWindow();
const urlParams = new URLSearchParams(window.location.search);
const isSticker = urlParams.get('sticker') === 'true'; // 判断当前是否为独立磁贴窗口
const currentId = urlParams.get('id'); // 磁贴ID（主窗口为 null）

let globalVditor = null; 
let isAlwaysOnTop = false;
let isPinning = false; 
let fullNotesCache = []; // 搜索使用的内存缓存


// ==================== 2. 自定义系统级 UI 组件 (Toast与Confirm) ====================
function initCustomUI() {
    // 动态注入弹窗样式
    const style = document.createElement('style');
    style.innerHTML = `
        #mac-toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
        .mac-toast { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #333; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); font-size: 13px; border: 1px solid rgba(0,0,0,0.1); animation: toast-slide-down 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); max-width: 450px; word-wrap: break-word; white-space: pre-wrap; text-align: center; line-height: 1.5; pointer-events: auto; }
        .mac-toast.error { border-left: 4px solid #ff4a4a; }
        .mac-toast.success { border-left: 4px solid #34c759; }
        .mac-toast.fade-out { opacity: 0; transform: translateY(-20px); transition: all 0.3s ease; }
        @keyframes toast-slide-down { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }

        .mac-confirm-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.4); z-index: 9999; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
        .mac-confirm-overlay.active { opacity: 1; pointer-events: auto; }
        .mac-confirm-box { background: #fff; border-radius: 12px; padding: 24px; width: 300px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2); transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .mac-confirm-overlay.active .mac-confirm-box { transform: scale(1); }
        .mac-confirm-text { font-size: 14px; margin-bottom: 24px; white-space: pre-wrap; line-height: 1.5; font-weight: 500;}
        .mac-confirm-actions { display: flex; gap: 12px; justify-content: center; }
        .mac-confirm-btn { flex: 1; padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; background: #e5e5ea; color: #333; transition: all 0.2s; outline: none; }
        .mac-confirm-btn:hover { filter: brightness(0.9); }
        .mac-confirm-btn.primary { background: #007aff; color: white; }

        /* 暗黑模式适配 */
        @media (prefers-color-scheme: dark) { 
            html:not([data-theme="light"]) .mac-toast { background: rgba(40, 40, 40, 0.85); color: #eee; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(0,0,0,0.3); } 
            html:not([data-theme="light"]) .mac-confirm-box { background: #2c2c2c; color: #eee; border: 1px solid rgba(255,255,255,0.1); }
            html:not([data-theme="light"]) .mac-confirm-btn { background: #444; color: #eee; }
        }
        html[data-theme="dark"] .mac-toast { background: rgba(40, 40, 40, 0.85); color: #eee; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
        html[data-theme="dark"] .mac-confirm-box { background: #2c2c2c; color: #eee; border: 1px solid rgba(255,255,255,0.1); }
        html[data-theme="dark"] .mac-confirm-btn { background: #444; color: #eee; }
    `;
    document.head.appendChild(style);

    // 挂载 Toast 容器
    const toastContainer = document.createElement('div');
    toastContainer.id = 'mac-toast-container';
    document.body.appendChild(toastContainer);

    // 挂载 Confirm 确认框容器
    const confirmModal = document.createElement('div');
    confirmModal.id = 'mac-confirm-modal';
    confirmModal.className = 'mac-confirm-overlay';
    confirmModal.innerHTML = `
        <div class="mac-confirm-box">
            <div class="mac-confirm-text" id="mac-confirm-text"></div>
            <div class="mac-confirm-actions">
                <button id="mac-confirm-cancel" class="mac-confirm-btn">取消</button>
                <button id="mac-confirm-ok" class="mac-confirm-btn primary">继续</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmModal);
}
initCustomUI();

// 暴露为全局方法
window.showMessage = function(text, type = 'success', duration = 3000) {
    const container = document.getElementById('mac-toast-container');
    const toast = document.createElement('div');
    toast.className = `mac-toast ${type}`;
    toast.innerText = text;
    container.appendChild(toast);
    
    setTimeout(() => { 
        toast.classList.add('fade-out'); 
        setTimeout(() => toast.remove(), 300); 
    }, duration);
};

window.showConfirm = function(text) {
    return new Promise((resolve) => {
        const modal = document.getElementById('mac-confirm-modal');
        document.getElementById('mac-confirm-text').innerText = text;
        modal.classList.add('active');
        
        const cleanup = () => { 
            modal.classList.remove('active'); 
            document.getElementById('mac-confirm-ok').onclick = null; 
            document.getElementById('mac-confirm-cancel').onclick = null; 
        };
        
        document.getElementById('mac-confirm-ok').onclick = () => { cleanup(); resolve(true); };
        document.getElementById('mac-confirm-cancel').onclick = () => { cleanup(); resolve(false); };
    });
};


// ==================== 3. 核心配置与主题系统 ====================
// 系统默认配置
const DEFAULT_CONFIG = {
    pinClearsMain: true,
    allowDuplicates: false,
    stickerPosition: 'offset',
    searchFuzzy: true,
    searchRealtime: true,
    searchLimit: 30,
    timeFormat: 'relative',
    autoSaveInterval: 0,
    theme: 'system',
    fontSize: '15px',
    lineHeight: '1.6',
    closeToTray: true, // 默认隐藏到托盘
    clearMainOnHide: false // 默认关闭不清空主编辑器内容
};
let AppConfig = { ...DEFAULT_CONFIG };

// 加载配置
async function loadConfig() {
    try {
        const raw = await invoke('load_note', { id: '__config_v1__' });
        if (raw) AppConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (e) { 
        console.warn("无本地配置，使用默认"); 
    }
    applyDynamicStyles();
}

// 保存配置
async function saveConfig() {
    await invoke('save_note', { id: '__config_v1__', content: JSON.stringify(AppConfig) });
}

// 应用动态样式 (字体大小、行高、深色模式适配)
function applyDynamicStyles() {
    document.documentElement.setAttribute('data-app-theme', AppConfig.theme);
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        if (AppConfig.theme === 'light') themeBtn.title = '当前: 浅色 (点击切换深色)';
        else if (AppConfig.theme === 'dark') themeBtn.title = '当前: 深色 (点击切换跟随系统)';
        else themeBtn.title = '当前: 跟随系统 (点击切换浅色)';
    }

    // 判断最终的亮暗态
    let isDark = false;
    if (AppConfig.theme === 'dark') isDark = true;
    else if (AppConfig.theme === 'light') isDark = false;
    else isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // 同步 Vditor 主题
    if (globalVditor) {
        globalVditor.setTheme(isDark ? 'dark' : 'classic', isDark ? 'dark' : 'light', isDark ? 'native' : 'github');
    }

    // 注入动态 CSS
    let stylePatch = document.getElementById('dynamic-style-patch');
    if (!stylePatch) {
        stylePatch = document.createElement('style');
        stylePatch.id = 'dynamic-style-patch';
        document.head.appendChild(stylePatch);
    }
    
    stylePatch.innerHTML = `
        .vditor-reset { font-size: ${AppConfig.fontSize} !important; }
        .vditor-reset p, .vditor-reset li, .vditor-reset h1, .vditor-reset h2, .vditor-reset h3, .vditor-reset h4, .vditor-reset h5, .vditor-reset h6 {
            line-height: ${AppConfig.lineHeight} !important;
        }
        #preview-render-box { font-size: ${AppConfig.fontSize} !important; }
        #preview-render-box p, #preview-render-box li { line-height: ${AppConfig.lineHeight} !important; }
    `;
}

// 绑定顶部主题切换按钮
const themeBtn = document.getElementById('theme-btn');
if (themeBtn) {
    themeBtn.addEventListener('click', async () => {
        if (AppConfig.theme === 'system') AppConfig.theme = 'light';
        else if (AppConfig.theme === 'light') AppConfig.theme = 'dark';
        else AppConfig.theme = 'system';
        
        await saveConfig();
        syncUIFromConfig();
        applyDynamicStyles();
    });
}

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (AppConfig.theme === 'system') applyDynamicStyles();
});


// ==================== 4. 工具函数 ====================
// 防抖函数，用于自动保存
function debounce(func, wait) {
    let timeout; 
    return function(...args) { 
        clearTimeout(timeout); 
        if (wait === 0) return func.apply(this, args); 
        timeout = setTimeout(() => func.apply(this, args), wait); 
    };
}

// 时间格式化 (相对时间/绝对时间)
function formatTime(id, updatedAt) {
    let createTime = parseInt(id.replace('backup_', '')); 
    if (isNaN(createTime)) return ''; 
    let targetTime = (updatedAt && updatedAt > 0) ? updatedAt : createTime;
    const date = new Date(targetTime);

    if (AppConfig.timeFormat === 'absolute') {
        const yyyy = date.getFullYear(); 
        const M = date.getMonth() + 1; 
        const d = date.getDate();      
        const hh = String(date.getHours()).padStart(2, '0'); 
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${yyyy}年${M}月${d}日 ${hh}:${mm}`;
    }

    const diff = Date.now() - targetTime;
    const sec = Math.floor(diff / 1000); 
    const min = Math.floor(sec / 60); 
    const hour = Math.floor(min / 60); 
    const day = Math.floor(hour / 24);
    
    if (sec < 60) return `${Math.max(1, sec)}秒前`; 
    if (min < 60) return `${min}分钟前`; 
    if (hour < 24) return `${hour}小时前`; 
    if (day < 7) return `${day}天前`;
    
    const y = date.getFullYear(); 
    const m = date.getMonth() + 1; 
    const d_rel = date.getDate();      
    return y === new Date().getFullYear() ? `${m}月${d_rel}日` : `${y}年${m}月${d_rel}日`;
}

// 剥离 Markdown 语法用于搜索预览
function stripMarkdown(md) { 
    return md ? md.replace(/<!--[\s\S]*?-->/g, '')
                  .replace(/!\[.*?\]\(.*?\)/g, '[图片]')
                  .replace(/\[(.*?)\]\(.*?\)/g, '$1')
                  .replace(/[*_]{1,3}(.*?)[*_]{1,3}/g, '$1')
                  .replace(/~~(.*?)~~/g, '$1')
                  .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
                  .replace(/^[#>-\s]+(.*?)$/gm, '$1')
                  .replace(/\n/g, ' ').trim() : ''; 
}


// ==================== 5. 磁贴状态与应用初始化 ====================
async function getActiveStickers() { 
    try { return JSON.parse(await invoke('load_note', { id: '__active_stickers__' }) || '[]'); } 
    catch (e) { return []; } 
}

async function addActiveSticker(id) { 
    const active = await getActiveStickers(); 
    if (!active.includes(id)) { 
        active.push(id); 
        await invoke('save_note', { id: '__active_stickers__', content: JSON.stringify(active) }); 
    } 
}

async function removeActiveSticker(id) { 
    let active = await getActiveStickers(); 
    active = active.filter(item => item !== id); 
    await invoke('save_note', { id: '__active_stickers__', content: JSON.stringify(active) }); 
}

// 启动入口
async function initApp() {
    await loadConfig(); 
    // 如果是主窗口，负责恢复所有上次没关掉的独立磁贴
    if (!isSticker) {
        let activeStickers = await getActiveStickers();
        if (activeStickers.length > 0) {
            const rawNotes = await invoke('get_notes_preview');
            const validIds = new Set(rawNotes.map(n => n.id));
            const validActive = activeStickers.filter(id => id !== 'main' && !id.startsWith('__') && validIds.has(id));
            if (validActive.length !== activeStickers.length) { 
                await invoke('save_note', { id: '__active_stickers__', content: JSON.stringify(validActive) }); 
            }
            await Promise.all(validActive.map(id => invoke('spawn_sticker', { id: id })));
        }
    }
}
initApp();


// ==================== 6. 窗口控制逻辑 (最大/最小/关闭/置顶/Pin) ====================
const closeBtn = document.getElementById('close-btn'); 
const minBtn = document.getElementById('min-btn'); 
const maxBtn = document.getElementById('max-btn');
const topBtn = document.getElementById('top-btn'); 
const pinBtn = document.getElementById('pin-btn'); 
const settingsBtn = document.getElementById('settings-btn'); 
const destroyBtn = document.getElementById('destroy-btn');

// 根据窗口类型调整按钮显示
if (isSticker) {
    if (topBtn) topBtn.style.display = 'none'; 
    if (pinBtn) pinBtn.style.display = 'none';
    if (settingsBtn) settingsBtn.style.display = 'none'; 
    if (destroyBtn) destroyBtn.style.display = 'flex'; // 磁贴专属销毁按钮
} else { 
    if (destroyBtn) destroyBtn.style.display = 'none'; 
}

// 🌟🌟 检查并清空主编辑器 (用于关闭/隐藏行为前)
async function checkAndClearMainNote() {
    if (!isSticker && AppConfig.clearMainOnHide && globalVditor) {
        globalVditor.setValue(""); // 清空编辑器画面
        await invoke('save_note', { id: 'main', content: "" }); // 清空本地持久化存储
    }
}

// 处理点击左上角红叉关闭按钮
if (closeBtn) {
    closeBtn.addEventListener('click', async () => { 
        if (isSticker && currentId) { 
            await removeActiveSticker(currentId); 
            await appWindow.close(); 
        } else { 
            await checkAndClearMainNote(); // 隐藏或退出前，判断是否需要清空

            if (AppConfig.closeToTray) {
                await appWindow.hide(); // 隐藏到托盘
            } else {
                await invoke('exit_app'); // 完全退出进程
            }
        }
    });
}

// 拦截原生关闭事件 (如 Alt+F4、任务栏右键关闭)
if (!isSticker) {
    appWindow.onCloseRequested(async (event) => {
        await checkAndClearMainNote(); // 隐藏前判断是否需要清空

        if (AppConfig.closeToTray) {
            event.preventDefault(); // 拦截原生销毁行为
            await appWindow.hide(); // 隐藏主窗口
        }
    });
}

if (minBtn) minBtn.addEventListener('click', () => appWindow.minimize());
if (maxBtn) maxBtn.addEventListener('click', async () => await appWindow.toggleMaximize());

// 置顶切换
if (topBtn) {
    topBtn.addEventListener('click', async () => { 
        isAlwaysOnTop = !isAlwaysOnTop; 
        await appWindow.setAlwaysOnTop(isAlwaysOnTop); 
        topBtn.classList.toggle('active', isAlwaysOnTop); 
    });
}

// 独立磁贴彻底销毁
if (destroyBtn) {
    destroyBtn.addEventListener('click', async () => { 
        if (isSticker && currentId) { 
            await removeActiveSticker(currentId); 
            await invoke('delete_note', { id: currentId }); 
        } 
        await appWindow.close(); 
    });
}

// 核心功能：Pin (将当前主屏幕内容撕下变成独立磁贴)
if (pinBtn) {
    pinBtn.addEventListener('click', async () => {
        if (!globalVditor || isPinning) return; 
        const currentContent = globalVditor.getValue(); 
        if (!currentContent.trim()) return; 
        
        isPinning = true; 
        pinBtn.style.opacity = '0.5'; 
        
        try {
            const id = Date.now().toString(); 
            await invoke('save_note', { id: id, content: currentContent });
            
            // Inbox模式：Pin后自动清空主编辑器
            if (AppConfig.pinClearsMain) { 
                globalVditor.setValue(""); 
                await invoke('save_note', { id: 'main', content: "" }); 
            }
            
            await addActiveSticker(id); 
            fullNotesCache.push({ id: id, content: currentContent, updated_at: Date.now() });
            
            let opts = { id: id }; 
            if (AppConfig.stickerPosition === 'offset') { 
                opts.x = window.screenX + 50; 
                opts.y = window.screenY + 50; 
            } 
            await invoke('spawn_sticker', opts);
        } finally { 
            isPinning = false; 
            pinBtn.style.opacity = '1'; 
        }
    });
}


// ==================== 7. 偏好设置交互逻辑 ====================
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');

// 将配置数据同步到设置界面的表单状态中
function syncUIFromConfig() {
    document.getElementById('cfg-pinClearsMain').checked = AppConfig.pinClearsMain; 
    document.getElementById('cfg-allowDuplicates').checked = AppConfig.allowDuplicates; 
    document.getElementById('cfg-stickerPosition').value = AppConfig.stickerPosition; 
    document.getElementById('cfg-searchFuzzy').checked = AppConfig.searchFuzzy; 
    document.getElementById('cfg-searchRealtime').checked = AppConfig.searchRealtime; 
    document.getElementById('cfg-searchLimit').value = AppConfig.searchLimit.toString(); 
    document.getElementById('cfg-timeFormat').value = AppConfig.timeFormat; 
    document.getElementById('cfg-autoSaveInterval').value = AppConfig.autoSaveInterval.toString();
    document.getElementById('cfg-theme').value = AppConfig.theme;
    document.getElementById('cfg-fontSize').value = AppConfig.fontSize;
    document.getElementById('cfg-lineHeight').value = AppConfig.lineHeight;
    document.getElementById('cfg-closeToTray').checked = AppConfig.closeToTray;
    document.getElementById('cfg-clearMainOnHide').checked = AppConfig.clearMainOnHide; // 🌟 同步清空开关
}

// 打开与关闭设置弹窗
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => { 
        syncUIFromConfig(); 
        settingsModal.classList.add('active'); 
    });
}
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));

// 设置界面左侧导航栏切换
const scrollArea = document.getElementById('settings-scroll-area');
const navItems = document.querySelectorAll('.settings-sidebar .nav-item');
const sections = document.querySelectorAll('.settings-content .cfg-section');

sections.forEach((sec, index) => { 
    if (index === 0) sec.classList.add('active'); 
    else sec.classList.remove('active'); 
});

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active')); 
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        
        sections.forEach(sec => { 
            if (sec.getAttribute('id') === targetId) sec.classList.add('active'); 
            else sec.classList.remove('active'); 
        });
        
        if (scrollArea) scrollArea.scrollTop = 0; 
    });
});

// 监听所有配置项的修改并自动保存
document.querySelectorAll('.cfg-item input, .cfg-item select').forEach(el => {
    el.addEventListener('change', async (e) => {
        const id = e.target.id.replace('cfg-', ''); // 提取配置项名
        
        if (e.target.type === 'checkbox') AppConfig[id] = e.target.checked;
        else if (id === 'searchLimit' || id === 'autoSaveInterval') AppConfig[id] = parseInt(e.target.value);
        else AppConfig[id] = e.target.value;
        
        await saveConfig();
        
        if (id === 'autoSaveInterval') initVditor(true); // 刷新自动保存频率
        
        if (id === 'timeFormat') {
            document.querySelectorAll('.time-updater').forEach(t => {
                t.innerText = formatTime(t.getAttribute('data-id'), parseInt(t.getAttribute('data-updated')));
            });
        }
        
        if (['theme', 'fontSize', 'lineHeight'].includes(id)) {
            applyDynamicStyles(); // 实时应用样式
        }
    });
});

// ---------- 数据导出 ----------
document.getElementById('cfg-btn-export').addEventListener('click', async () => {
    try {
        const rawNotes = await invoke('get_notes_preview');
        let exportData = {}; 
        
        for (let n of rawNotes) { 
            if (!n.id.startsWith('__')) {
                exportData[n.id] = await invoke('load_note', { id: n.id }); 
            }
        }
        
        const jsonData = JSON.stringify(exportData, null, 2); 
        const defaultName = `SnapNote_Backup_${new Date().toISOString().slice(0,10)}.json`;
        
        try { 
            const savePath = await invoke('save_backup_dialog', { filename: defaultName, content: jsonData }); 
            showMessage(`导出成功！\n文件已妥善保存至:\n${savePath}`, 'success', 5000); 
            return; 
        } catch (err) { 
            if (err === "CANCELED") return; 
        }
        
        // 浏览器备用方案
        if (window.showSaveFilePicker) {
            try { 
                const handle = await window.showSaveFilePicker({ 
                    suggestedName: defaultName, 
                    types: [{ description: 'JSON 备份文件', accept: { 'application/json': ['.json'] } }] 
                }); 
                const writable = await handle.createWritable(); 
                await writable.write(jsonData); 
                await writable.close(); 
                showMessage("导出成功！", "success"); 
                return; 
            } catch (err) { 
                if (err.name === 'AbortError') return; 
            }
        }
        
        const blob = new Blob([jsonData], { type: 'application/json' }); 
        const a = document.createElement('a'); 
        a.href = URL.createObjectURL(blob); 
        a.download = defaultName; 
        a.click();
    } catch (e) { 
        console.error(e); 
        showMessage("导出时发生错误，请检查控制台", "error"); 
    }
});

// ---------- 数据导入 ----------
const importBtn = document.getElementById('cfg-btn-import');
if (importBtn) {
    importBtn.addEventListener('click', async () => {
        const proceed = await showConfirm("导入的备份将与当前的网络合并。\n（如存在同名记录，将被备份覆盖）\n\n是否继续？"); 
        if (!proceed) return;
        
        try {
            let jsonData = ""; 
            try { 
                jsonData = await invoke('read_backup_dialog'); 
            } catch (err) { 
                if (err === "CANCELED") return; 
                throw new Error("NATIVE_FAILED"); 
            }
            await processImportData(jsonData);
        } catch (e) {
            if (e.message !== "NATIVE_FAILED") console.error(e);
            
            // 浏览器 fallback 方案
            const input = document.createElement('input'); 
            input.type = 'file'; 
            input.accept = '.json';
            
            input.onchange = (event) => { 
                const file = event.target.files[0]; 
                if (!file) return; 
                const reader = new FileReader(); 
                reader.onload = async (e) => await processImportData(e.target.result); 
                reader.readAsText(file); 
            };
            input.click();
        }
    });
}

// 处理导入的数据写入
async function processImportData(jsonString) {
    try {
        const importData = JSON.parse(jsonString); 
        let successCount = 0; 
        let isMainOverwritten = false;
        
        for (const [id, content] of Object.entries(importData)) { 
            if (id && typeof content === 'string' && !id.startsWith('__config')) { 
                await invoke('save_note', { id: id, content: content }); 
                successCount++; 
                if (id === 'main') isMainOverwritten = true; 
            } 
        }
        
        fullNotesCache = []; 
        if (isMainOverwritten && globalVditor && currentId === null) { 
            const newMain = await invoke('load_note', { id: 'main' }); 
            globalVditor.setValue(newMain || ""); 
        }
        showMessage(`🎉 导入成功！共恢复了 ${successCount} 条记忆。\n(新内容将在下次搜索时生效)`, 'success', 4000);
    } catch (err) { 
        console.error(err); 
        showMessage("导入失败：备份文件格式不正确。", "error"); 
    }
}

// 重建索引缓存
document.getElementById('cfg-btn-rebuild').addEventListener('click', async () => { 
    fullNotesCache = []; 
    showMessage("缓存已清空，下次搜索将重新建立索引。", "success"); 
});


// ==================== 8. Vditor 编辑器初始化 ====================
let saveDebouncer = null;
function initVditor(isReload = false) {
    // 重新加载配置并应用
    if (isReload && globalVditor) {
        saveDebouncer = debounce(async (noteId, value) => {
            await invoke('save_note', { id: noteId, content: value });
            if (isSticker && currentId) { 
                const cached = fullNotesCache.find(n => n.id === currentId); 
                if (cached) { 
                    cached.content = value; 
                    cached.updated_at = Date.now(); 
                } 
            }
        }, AppConfig.autoSaveInterval);
        return;
    }

    const checkVditor = setInterval(() => {
        if (typeof Vditor !== 'undefined') {
            clearInterval(checkVditor);
            const noteId = (isSticker && currentId) ? currentId : 'main'; // 磁贴使用自身的id，主窗口使用 'main'
            
            saveDebouncer = debounce(async (id, val) => { 
                await invoke('save_note', { id: id, content: val }); 
            }, AppConfig.autoSaveInterval);
            
            let isDark = AppConfig.theme === 'dark' || (AppConfig.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

            const vditor = new Vditor('vditor', {
                height: '100%', 
                mode: 'ir', 
                placeholder: isSticker ? "磁贴便签..." : "随手记下灵感，Cmd+P 唤出大脑...",
                outline: { enable: false }, 
                toolbarConfig: { hide: true }, 
                cache: { enable: false }, 
                cdn: './vditor', 
                theme: isDark ? 'dark' : 'classic',
                input: (value) => saveDebouncer(noteId, value),
                after: async () => {
                    globalVditor = vditor;
                    applyDynamicStyles();
                    const savedContent = await invoke('load_note', { id: noteId });
                    if (savedContent) vditor.setValue(savedContent); // 恢复内容
                }
            });
        }
    }, 100);
}
initVditor();


// ==================== 9. 搜索与命令面板 (Cmd+P) ====================
const searchModal = document.getElementById('search-modal'); 
const searchInput = document.getElementById('search-input'); 
const searchResultsContainer = document.getElementById('search-results'); 
const searchPreviewContainer = document.getElementById('search-preview-container');

async function toggleSearch(initialKeyword = "") {
    if (searchModal.classList.contains('active') && initialKeyword === "") { 
        closeSearch(); 
        return; 
    }
    searchModal.classList.add('active'); 
    searchInput.value = initialKeyword; 
    searchInput.focus();
    
    searchResultsContainer.innerHTML = '<div class="search-item"><div class="search-item-main"><div class="search-item-title">加载记忆网络中...</div></div></div>';
    
    try {
        const rawNotes = await invoke('get_notes_preview'); 
        const validRaw = rawNotes.filter(n => !n.id.startsWith('__') && n.id !== 'main');
        
        fullNotesCache = await Promise.all(validRaw.map(async n => { 
            const cached = fullNotesCache.find(c => c.id === n.id); 
            if (cached && cached.updated_at === n.updated_at) return cached; 
            return { id: n.id, content: await invoke('load_note', { id: n.id }) || '', updated_at: n.updated_at }; 
        }));
        
        fullNotesCache.sort((a, b) => { 
            const timeA = a.updated_at > 0 ? a.updated_at : parseInt(a.id.replace('backup_', '')) || 0; 
            const timeB = b.updated_at > 0 ? b.updated_at : parseInt(b.id.replace('backup_', '')) || 0; 
            return timeB - timeA; 
        });
        
        handleSearchInput(initialKeyword);
    } catch (error) { 
        console.error(error); 
    }
}

function closeSearch() { 
    searchModal.classList.remove('active'); 
    searchInput.blur(); 
}

function getRegex(pattern) {
    if (!pattern) return null;
    if (AppConfig.searchFuzzy) { 
        const regexStr = pattern.split('').map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*?'); 
        return new RegExp(regexStr, 'i'); 
    } else { 
        return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); 
    }
}

function handleSearchInput(rawKeyword) {
    const keyword = rawKeyword.trim(); 
    searchResultsContainer.innerHTML = '';
    
    // 命令模式
    if (keyword.startsWith('>')) {
        const cmdText = keyword.substring(1).trim().toLowerCase();
        const commands = [ 
            { cmd: 'pin', title: '撕下当前内容 (Pin)', action: async () => { closeSearch(); document.getElementById('pin-btn').click(); } }, 
            { cmd: 'clear', title: '清空主屏幕 (Inbox)', action: async () => { closeSearch(); globalVditor.setValue(''); await invoke('save_note', { id: 'main', content: "" }); } } 
        ];
        const matchedCmds = commands.filter(c => c.cmd.includes(cmdText) || c.title.includes(cmdText));
        
        searchResultsContainer.innerHTML = '<div class="search-group-title">命令面板</div>';
        matchedCmds.forEach((c, i) => {
            const item = document.createElement('div'); 
            item.className = `search-item ${i === 0 ? 'selected' : ''}`; 
            item.innerHTML = `<div class="search-item-main"><div class="search-item-title">${c.title}</div></div>`; 
            item.addEventListener('click', c.action); 
            item.addEventListener('mouseenter', () => updateSearchSelection(item)); 
            searchResultsContainer.appendChild(item);
        });
        updatePreviewPane(null); 
        return;
    }

    // 正常检索模式
    const regex = getRegex(keyword); 
    const filtered = fullNotesCache.filter(note => regex ? regex.test(note.content) : true);
    
    if (filtered.length === 0) { 
        searchResultsContainer.innerHTML = `<div class="search-item selected" id="search-empty-state"><div class="search-item-main"><div class="search-item-title" style="color:#aaa;">未找到匹配</div><div style="margin-top:12px;"><kbd class="cmd-kbd">Enter</kbd> 创建新磁贴</div></div></div>`; 
        updatePreviewPane(null); 
        return; 
    }

    filtered.slice(0, AppConfig.searchLimit).forEach((note, index) => {
        const item = document.createElement('div'); 
        item.className = `search-item ${index === 0 ? 'selected' : ''}`;
        
        let snippet = stripMarkdown(note.content) || '（空白）'; 
        const timeStr = formatTime(note.id, note.updated_at);
        
        item.innerHTML = `
            <div class="search-item-main">
                <div class="search-item-title">${snippet.substring(0, 80)}</div>
            </div>
            <div class="search-item-time time-updater" data-id="${note.id}" data-updated="${note.updated_at}">${timeStr}</div>
            <div class="search-item-actions">
                <button class="s-btn del" title="彻底删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        
        // 彻底删除便签
        item.querySelector('.s-btn.del').addEventListener('click', async (e) => { 
            e.stopPropagation(); 
            try { 
                await removeActiveSticker(note.id); 
                await invoke('delete_note', { id: note.id }); 
                await invoke('close_sticker_window', { id: note.id }); 
                fullNotesCache = fullNotesCache.filter(n => n.id !== note.id); 
                item.remove(); 
                handleSearchInput(searchInput.value); 
            } catch (err) { 
                console.error("删除失败:", err); 
            } 
        });
        
        // 选中打开磁贴
        item.addEventListener('click', async () => { 
            if (!AppConfig.allowDuplicates) { 
                const active = await getActiveStickers(); 
                if (active.includes(note.id)) { 
                    showMessage("该磁贴已在桌面上打开。", "error"); 
                    closeSearch(); 
                    return; 
                } 
            } 
            closeSearch(); 
            await addActiveSticker(note.id); 
            await invoke('spawn_sticker', { id: note.id }); 
        });
        
        item.addEventListener('mouseenter', () => updateSearchSelection(item, note)); 
        searchResultsContainer.appendChild(item); 
        
        if (index === 0) updatePreviewPane(note); 
    });
}

// 侧边预览与选中高亮控制
function updateSearchSelection(element, note = null) {
    document.querySelectorAll('.search-item').forEach(i => i.classList.remove('selected'));
    if (element) { 
        element.classList.add('selected'); 
        element.scrollIntoView({ block: 'nearest' }); 
        if (note) updatePreviewPane(note); 
    }
}

async function updatePreviewPane(note) {
    if (!note) { 
        searchPreviewContainer.innerHTML = '<div class="preview-empty">未选择内容</div>'; 
        return; 
    }
    searchPreviewContainer.innerHTML = `
        <div class="preview-title">最近修改: <span class="time-updater" data-id="${note.id}" data-updated="${note.updated_at}">${formatTime(note.id, note.updated_at)}</span></div>
        <div id="preview-render-box" class="preview-content vditor-reset"></div>
    `;
    if (typeof Vditor !== 'undefined') {
        await Vditor.preview(document.getElementById('preview-render-box'), note.content, { theme: 'classic' });
    }
}

searchInput.addEventListener('input', (e) => { 
    if (AppConfig.searchRealtime) handleSearchInput(e.target.value); 
});

// 监听键盘快捷键
document.addEventListener('keydown', async (e) => {
    // Cmd+Shift+P 快捷命令
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') { 
        e.preventDefault(); toggleSearch(">"); return; 
    }
    // Cmd+P 唤出大脑
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') { 
        e.preventDefault(); toggleSearch(""); return; 
    }
    if (!searchModal.classList.contains('active')) return;
    
    // 如果没有开启实时搜索，按回车时执行检索
    if (!AppConfig.searchRealtime && e.key === 'Enter' && document.activeElement === searchInput && searchResultsContainer.children.length <= 1) { 
        handleSearchInput(searchInput.value); 
        e.preventDefault(); 
        return; 
    }
    
    // 搜索列表的上下左右按键导航
    const items = Array.from(document.querySelectorAll('.search-item')); 
    let idx = items.findIndex(item => item.classList.contains('selected'));
    
    if (e.key === 'Escape') {
        closeSearch();
    } else if (e.key === 'ArrowDown') { 
        e.preventDefault(); 
        if (idx < items.length - 1) { 
            items[idx].classList.remove('selected'); 
            items[idx+1].dispatchEvent(new Event('mouseenter')); 
        } 
    } else if (e.key === 'ArrowUp') { 
        e.preventDefault(); 
        if (idx > 0) { 
            items[idx].classList.remove('selected'); 
            items[idx-1].dispatchEvent(new Event('mouseenter')); 
        } 
    } else if (e.key === 'Enter') { 
        e.preventDefault(); 
        const emptyState = document.getElementById('search-empty-state');
        if (emptyState && emptyState.classList.contains('selected')) {
            const keyword = searchInput.value.trim();
            if (keyword) { 
                closeSearch(); 
                const id = Date.now().toString(); 
                await invoke('save_note', { id: id, content: keyword }); 
                await addActiveSticker(id); 
                fullNotesCache.push({ id: id, content: keyword, updated_at: Date.now() }); 
                await invoke('spawn_sticker', { id: id }); 
            }
        } else if (idx > -1 && items[idx]) { 
            items[idx].click(); 
        }
    }
});

// 点击黑色半透明遮罩关闭搜索框
searchModal.addEventListener('click', (e) => { 
    if (e.target === searchModal || e.target.classList.contains('search-container')) closeSearch(); 
});

// 动态刷新界面上的“相对时间”文字
setInterval(() => { 
    document.querySelectorAll('.time-updater').forEach(el => { 
        const id = el.getAttribute('data-id'); 
        const updated = parseInt(el.getAttribute('data-updated')) || 0; 
        if (id) el.innerText = formatTime(id, updated); 
    }); 
}, 60000); 
