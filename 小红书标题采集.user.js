// ==UserScript==
// @name         小红书搜索下拉词采集工具
// @namespace    http://tampermonkey.net/
// @version      1
// @description  采集小红书搜索下拉词，支持批量获取原词+a-z组合词，支持直接输入搜索
// @author       You
// @match        https://www.xiaohongshu.com/*
// @match        https://*.xiaohongshu.com/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    // 等待页面加载完成后再创建面板
    function init() {
        // 检查是否已存在面板
        if (document.querySelector('#xhs-search-tool')) {
            return;
        }

        // 确保在正确的页面上
        if (window.location.hostname.includes('xiaohongshu.com')) {
            createPanel();
            monitorAPI();
            console.log('小红书搜索下拉词采集工具已初始化');
        }
    }

    let latestResponseData = null;
    let previousRecommendData = null;
    let allContents = [];
    let isCollecting = false;
    let currentKeyword = "";

    // 获取当前搜索词
    const getKeywordFromUrl = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const keyword = urlParams.get("keyword");
        return keyword ? decodeURIComponent(keyword) : "";
    };

    // 创建控制面板
    const createPanel = () => {
        const panel = document.createElement("div");
        panel.id = 'xhs-search-tool';  // 添加唯一ID
        panel.style.position = "fixed";
        panel.style.top = "20px";
        panel.style.right = "20px";
        panel.style.padding = "10px";
        panel.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
        panel.style.borderRadius = "8px";
        panel.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";
        panel.style.zIndex = "10000";
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.gap = "8px";
        panel.style.width = "300px";

        // 创建标题
        const title = document.createElement("div");
        title.textContent = "下拉词采集工具";
        title.style.fontWeight = "bold";
        title.style.marginBottom = "8px";
        title.style.textAlign = "center";
        panel.appendChild(title);

        // 创建搜索输入框
        const searchContainer = document.createElement("div");
        searchContainer.style.display = "flex";
        searchContainer.style.gap = "8px";
        searchContainer.style.marginBottom = "8px";

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "输入搜索关键词";
        searchInput.style.flex = "1";
        searchInput.style.padding = "6px";
        searchInput.style.borderRadius = "4px";
        searchInput.style.border = "1px solid #ddd";
        const urlKeyword = getKeywordFromUrl();
        currentKeyword = urlKeyword;
        searchInput.value = urlKeyword;

        // 监听输入事件和光标位置
        searchInput.addEventListener('input', async (e) => {
            const cursorPosition = e.target.selectionStart;
            const inputValue = e.target.value;

            if (!inputValue.trim()) {
                currentKeyword = "";
                return;
            }

            // 检查是否在输入关键词
            if (!currentKeyword || inputValue.length < currentKeyword.length) {
                currentKeyword = inputValue;
                return;
            }

            // 检查光标是否在关键词末尾
            const spaceIndex = inputValue.lastIndexOf(' ');
            const isAtEnd = cursorPosition === inputValue.length;

            if (spaceIndex === -1) {
                currentKeyword = inputValue;
            } else if (isAtEnd) {
                const lastPart = inputValue.slice(spaceIndex + 1);
                if (lastPart.length === 1 && /[a-zA-Z]/.test(lastPart)) {
                    await triggerSearchWithEvents(inputValue);
                }
                currentKeyword = inputValue;
            }
        });

        // 监听点击事件，更新光标位置
        searchInput.addEventListener('click', (e) => {
            const cursorPosition = e.target.selectionStart;
            const inputValue = e.target.value;

            const spaceIndex = inputValue.lastIndexOf(' ');
            if (spaceIndex === -1) {
                currentKeyword = inputValue;
            } else {
                currentKeyword = inputValue.slice(0, spaceIndex);
            }
        });

        const searchButton = createStyledButton("搜索");
        searchButton.style.width = "60px";
        searchButton.addEventListener("click", () => triggerSearchWithEvents(searchInput.value));

        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(searchButton);
        panel.appendChild(searchContainer);

        // 创建按钮容器
        const buttonContainer = document.createElement("div");
        buttonContainer.style.display = "flex";
        buttonContainer.style.flexDirection = "column";
        buttonContainer.style.gap = "8px";

        // 创建批量获取按钮
        const batchButton = createStyledButton("批量获取下拉词(含原词+a-z)");
        batchButton.addEventListener("click", () => handleBatchClick(batchButton));
        buttonContainer.appendChild(batchButton);

        // 创建单个保存按钮
        const saveButton = createStyledButton("保存当前下拉词");
        saveButton.addEventListener("click", (event) => handleSaveClick(event));
        buttonContainer.appendChild(saveButton);

        // 添加说明文字
        const description = document.createElement("div");
        description.style.cssText = `
            font-size: 12px;
            color: #666;
            margin-top: 8px;
            padding: 8px;
            background-color: #f5f5f5;
            border-radius: 4px;
            line-height: 1.5;
            width: 100%;
            box-sizing: border-box;
        `;
        description.innerHTML = "温馨提示：使用a-z批量采集的原因是，用户在搜索时输入任何细分需求时都会先打上某个字母下的文字，这26个字母覆盖了所有可能的搜索场景，帮你收集到最全面的相关搜索词，但是网页端没有手机端全，仅作为参考";
        buttonContainer.appendChild(description);

        panel.appendChild(buttonContainer);
        document.body.appendChild(panel);

        return panel;
    };

    // 触发搜索框事件序列
    const triggerSearchWithEvents = async (keyword) => {
        const searchBox = await waitForElement('input[type="search"], input.search-input', 5000);
        if (!searchBox) {
            console.error('未找到搜索框');
            return;
        }

        // 聚焦和点击事件
        searchBox.focus();
        searchBox.click();

        // 触发初始事件
        const initialEvents = [
            new Event('focus', { bubbles: true }),
            new MouseEvent('mousedown', { bubbles: true }),
            new MouseEvent('mouseup', { bubbles: true }),
            new MouseEvent('click', { bubbles: true })
        ];
        initialEvents.forEach(event => searchBox.dispatchEvent(event));

        // 设置值并触发输入事件
        searchBox.value = keyword;

        // 触发输入事件序列
        const inputEvents = [
            new Event('input', { bubbles: true }),
            new Event('change', { bubbles: true }),
            new KeyboardEvent('keydown', { bubbles: true }),
            new KeyboardEvent('keypress', { bubbles: true }),
            new KeyboardEvent('keyup', { bubbles: true })
        ];
        inputEvents.forEach(event => searchBox.dispatchEvent(event));

        // 设置光标位置
        searchBox.setSelectionRange(searchBox.value.length, searchBox.value.length);

        // 更新URL
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('keyword', keyword);
        window.history.replaceState({}, '', currentUrl);

        // 等待API响应
        previousRecommendData = null;
        await waitForApiResponse(keyword);
    };

    // 等待元素出现
    const waitForElement = (selector, timeout) => {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    // 创建统一样式的按钮
    const createStyledButton = (text) => {
        const button = document.createElement("button");
        button.textContent = text;
        button.style.padding = "8px 12px";
        button.style.backgroundColor = "#ff2442";
        button.style.color = "white";
        button.style.border = "none";
        button.style.borderRadius = "4px";
        button.style.cursor = "pointer";
        button.style.width = "100%";
        button.style.transition = "background-color 0.2s";

        button.addEventListener("mouseover", () => {
            if (!button.disabled) {
                button.style.backgroundColor = "#e61f3c";
            }
        });
        button.addEventListener("mouseout", () => {
            if (!button.disabled) {
                button.style.backgroundColor = "#ff2442";
            }
        });

        return button;
    };

    // 处理保存逻辑
    const handleSave = (keyword, isBatchOperation = false) => {
        if (!previousRecommendData || !previousRecommendData.data || !previousRecommendData.data.sug_items) {
            console.log("暂无数据或数据格式不正确");
            return false;
        }

        const recommendTexts = previousRecommendData.data.sug_items
            .filter(item => item.text && /[\u4e00-\u9fa5]/.test(item.text))
            .map((item, index) => `${index + 1}. ${item.text}`);

        const fileContent = `
${keyword}下拉词：
${recommendTexts.length > 0 ? recommendTexts.join("\n") : "未找到下拉词"}
        `.trim();

        if (isBatchOperation) {
            allContents.push(fileContent);
            return true;
        } else {
            downloadContent(fileContent, `${keyword}下拉词.txt`);
            return true;
        }
    };

    // 处理保存按钮点击
    const handleSaveClick = (event) => {
        if (isCollecting) return;

        const keyword = getKeywordFromUrl();
        if (!keyword) {
            alert("请先搜索关键词！");
            return;
        }

        if (!previousRecommendData) {
            alert("暂无下拉词数据！");
            return;
        }

        handleSave(keyword, event.isBatchOperation);
    };

    // 等待API响应
    const waitForApiResponse = async (currentKeyword) => {
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            if (previousRecommendData) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }

        console.log(`等待API响应超时: ${currentKeyword}`);
        return false;
    };

    // 处理批量获取按钮点击
    const handleBatchClick = async (button) => {
        if (isCollecting) {
            alert("正在采集中，请等待当前采集完成");
            return;
        }

        const keyword = currentKeyword.split(' ')[0];
        if (!keyword) {
            alert("请先在面板上方输入关键词！");
            return;
        }

        isCollecting = true;
        allContents = [];
        const suffixes = ['', ...('abcdefghijklmnopqrstuvwxyz'.split(''))]; // Added empty string for base keyword
        const totalCount = suffixes.length;

        button.disabled = true;

        try {
            for (let i = 0; i < suffixes.length; i++) {
                const suffix = suffixes[i];
                const progress = Math.round(((i + 1) / totalCount) * 100);
                button.textContent = `采集中 ${progress}%`;

                const newKeyword = suffix ? `${keyword} ${suffix}` : keyword; // Handle base keyword case
                await triggerSearchWithEvents(newKeyword);

                handleSave(newKeyword, true);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            await triggerSearchWithEvents(keyword);

            if (allContents.length > 0) {
                const allContent = allContents.join('\n\n' + '='.repeat(30) + '\n\n');
                downloadContent(allContent, `${keyword}_批量下拉词.txt`);
            } else {
                alert("未采集到任何数据");
            }
        } catch (error) {
            console.error("采集过程出错:", error);
            alert("采集过程出现错误，请重试");
        } finally {
            button.textContent = "批量获取下拉词(含原词+a-z)";
            button.disabled = false;
            isCollecting = false;
        }
    };

    // 下载内容函数
    const downloadContent = (content, filename) => {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // 监控接口
    const monitorAPI = () => {
        const targetUrl = "/edith.xiaohongshu.com/api/sns/web/v1/search/recommend?keyword";

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this._method = method;
            this._url = url;
            return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function () {
            const request = this;
            request.addEventListener("load", () => {
                if (request._url.includes(targetUrl)) {
                    try {
                        const responseData = JSON.parse(request.responseText);
                        previousRecommendData = {
                            url: request._url,
                            data: responseData.data
                        };
                    } catch (error) {
                        console.error("解析API响应出错:", error);
                    }
                }
            });
            return originalSend.apply(this, arguments);
        };

        const originalFetch = window.fetch;
        window.fetch = function (url, options) {
            return originalFetch(url, options).then((response) => {
                if (url.includes(targetUrl)) {
                    response.clone().text().then((text) => {
                        try {
                            const responseData = JSON.parse(text);
                            previousRecommendData = {
                                url: url,
                                data: responseData.data
                            };
                        } catch (error) {
                            console.error("解析Fetch响应出错:", error);
                        }
                    });
                }
                return response;
            });
        };
    };

    // 监听 DOM 加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
