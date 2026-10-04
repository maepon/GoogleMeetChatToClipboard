// UI作成とスタイル関連の機能を管理するモジュール

const UIManager = {
    // チャットの見出しの存在判定を行い、コピーボタンを作成する
    initializeCopyButtonObserver(config, selectors, ids, targetDoc) {
        if (!targetDoc) return null;
        // 初回チェック
        this.checkAndCreateCopyButton(config, selectors, ids, targetDoc);
        
        // Observerでチャットタイトル要素の監視を開始
        return ObserverManager.observeForUIChanges(
            selectors.chatTitle,
            (chatHeadingElement, observer) => {
                this.checkAndCreateCopyButton(config, selectors, ids, targetDoc);
            },
            targetDoc
        );
    },

    // チャットの見出しの存在判定を行い、コピーボタンを作成する（内部処理）
    checkAndCreateCopyButton(config, selectors, ids, targetDoc) {
        if (!targetDoc || !ChatManager.isSaveTarget(targetDoc, selectors)) {
            return;
        }
        const chatHeadingElement = targetDoc.querySelector(selectors.chatTitle);
        if (chatHeadingElement !== null && targetDoc.querySelector(`#${ids.copyButton}`) === null) {
            const copyButton = this.createCopyButton(config, ids, targetDoc);
            if (copyButton) {
                // チャットタイトルの親要素の直後に挿入
                chatHeadingElement.parentElement.after(copyButton);
            }
        }
    },

    // コピーボタンのDOMを作成する
    createCopyButton(config, ids, targetDoc) {
        if (!targetDoc) return null;
        const copyIconSpan = this.createCopyIconSpan(config, targetDoc);
        const copyButton = this.createButtonWithIcon(copyIconSpan, config, ids, targetDoc);
        if (!copyButton) return null;

        copyButton.addEventListener('mouseenter', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_HOVER));
        copyButton.addEventListener('mouseleave', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_NORMAL));
        copyButton.addEventListener('mousedown', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_NORMAL));
        copyButton.addEventListener('mouseup', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_HOVER));
        
        const wrapDiv = targetDoc.createElement('div');
        wrapDiv.append(copyButton);
        return wrapDiv;
    },

    // アイコンspan要素を作成
    createCopyIconSpan(config, targetDoc) {
        if (!targetDoc) return null;
        const copyIconSpan = targetDoc.createElement('span');
        copyIconSpan.classList.add('google-material-icons');
        copyIconSpan.textContent = 'content_copy';
        copyIconSpan.style.color = config.STYLES.COPY_ICON.color;
        return copyIconSpan;
    },

    // ボタン要素を作成してアイコンを追加
    createButtonWithIcon(iconElement, config, ids, targetDoc) {
        if (!targetDoc) return null;
        const copyButton = targetDoc.createElement('button');
        copyButton.type = 'button';
        copyButton.style.backgroundColor = config.STYLES.COPY_BUTTON.backgroundColor;
        copyButton.style.border = config.STYLES.COPY_BUTTON.border;
        copyButton.style.padding = config.STYLES.COPY_BUTTON.padding;
        copyButton.style.cursor = config.STYLES.COPY_BUTTON.cursor;
        copyButton.style.borderRadius = config.STYLES.COPY_BUTTON.borderRadius;
        if (iconElement) copyButton.append(iconElement);
        copyButton.id = ids.copyButton;
        return copyButton;
    },

    // ボタン単位の復帰タイマー管理
    _copyFeedbackTimers: new WeakMap(),

    // i18n 文言を取得（未提供・空文字・例外の場合はフォールバック文言を返す）
    getFeedbackMessage(key, fallback) {
        try {
            if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
                const msg = chrome.i18n.getMessage(key);
                if (msg) {
                    return msg;
                }
            }
        } catch (error) {
            // 拡張機能コンテキスト無効化等の異常系ではフォールバック文言を使用（例外を外へ漏らさない）
        }
        return fallback;
    },

    // コピー結果（success / failed / empty）をボタン上に一時表示する
    showCopyFeedback(button, status, config, targetDoc) {
        if (!button) return;
        const feedback = config.STYLES.COPY_FEEDBACK && config.STYLES.COPY_FEEDBACK[status];
        if (!feedback) return;

        const existingTimer = this._copyFeedbackTimers.get(button);
        if (existingTimer !== undefined) {
            clearTimeout(existingTimer);
        }

        const message = this.getFeedbackMessage(feedback.messageKey, feedback.fallback);
        const iconSpan = button.querySelector('span');
        if (iconSpan) {
            iconSpan.textContent = feedback.icon;
            iconSpan.style.color = feedback.color;
        }
        button.setAttribute('title', message);
        button.setAttribute('aria-label', message);
        button.setAttribute('data-gmctc-feedback', status);

        const timerId = setTimeout(() => this.resetCopyFeedback(button, config), config.TIMEOUTS.COPY_FEEDBACK);
        this._copyFeedbackTimers.set(button, timerId);
    },

    // 一時表示を元のコピーアイコンに戻す
    resetCopyFeedback(button, config) {
        if (!button) return;
        const iconSpan = button.querySelector('span');
        if (iconSpan) {
            iconSpan.textContent = 'content_copy';
            iconSpan.style.color = config.STYLES.COPY_ICON.color;
        }
        button.removeAttribute('title');
        button.removeAttribute('aria-label');
        button.removeAttribute('data-gmctc-feedback');
        this._copyFeedbackTimers.delete(button);
    },

    // ボタンの色を変更するイベント
    handleCopyButtonColorChange(e, color) {
        e.target.style.backgroundColor = color;
    },

    // 退出後のUI要素を作成
    createExitedUI(config, ids, chatLogText, saveChatLogCallback, targetDoc) {
        if (!targetDoc) {
            console.error('createExitedUI: targetDoc is required');
            return null;
        }
        const textarea = targetDoc.createElement('textarea');
        textarea.id = ids.chatLogTextArea;
        textarea.style.width = config.STYLES.TEXTAREA.width;
        textarea.style.height = config.STYLES.TEXTAREA.height;
        textarea.value = chatLogText;
        const copyButton = targetDoc.createElement('button');
        let copyButtonText = 'コピー';

        try {
            if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
                const msg = chrome.i18n.getMessage('copyButtonText');
                if (msg) {
                    copyButtonText = msg;
                }
            }
        } catch (error) {
            // 拡張機能コンテキスト無効化等の異常系ではフォールバック文言を使用（例外を外へ漏らさない）
        }

        copyButton.textContent = copyButtonText;
        copyButton.type = 'button';
        copyButton.addEventListener('click', () => {
            if (typeof saveChatLogCallback === 'function') {
                saveChatLogCallback(textarea.value);
            }
        });
        
        const pElement = targetDoc.createElement('p');
        pElement.append(copyButton);
        
        const wrapDiv = targetDoc.createElement('div');
        wrapDiv.append(textarea, pElement);
        
        return wrapDiv;
    }
};

// モジュールとして利用可能にする
window.UIManager = UIManager;