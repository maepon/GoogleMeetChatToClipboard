// UI作成とスタイル関連の機能を管理するモジュール

const UIManager = {
    // チャットの見出しの存在判定を行い、コピーボタンを作成する
    initializeCopyButtonObserver(config, selectors, ids) {
        // 初回チェック
        this.checkAndCreateCopyButton(config, selectors, ids);
        
        // Observerでチャットタイトル要素の監視を開始
        return ObserverManager.observeForUIChanges(
            selectors.chatTitle,
            (chatHeadingElement, observer) => {
                this.checkAndCreateCopyButton(config, selectors, ids);
            }
        );
    },

    // チャットの見出しの存在判定を行い、コピーボタンを作成する（内部処理）
    checkAndCreateCopyButton(config, selectors, ids) {
        const chatHeadingElement = document.querySelector(selectors.chatTitle);
        if (chatHeadingElement !== null) {
            if (document.querySelector(`#${ids.copyButton}`) === null) {
                chatHeadingElement.after(this.createCopyButton(config, ids));
            }
        }
    },

    // コピーボタンのDOMを作成する
    createCopyButton(config, ids) {
        const copyIconSpan = this.createCopyIconSpan(config);
        const copyButton = this.createButtonWithIcon(copyIconSpan, config, ids);
        copyButton.addEventListener('mouseenter', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_HOVER));
        copyButton.addEventListener('mouseleave', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_NORMAL));
        copyButton.addEventListener('mousedown', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_NORMAL));
        copyButton.addEventListener('mouseup', (e) => this.handleCopyButtonColorChange(e, config.STYLES.COPY_BUTTON_HOVER));
        const wrapDiv = document.createElement('div');
        wrapDiv.append(copyButton);
        return wrapDiv;
    },

    // アイコンspan要素を作成
    createCopyIconSpan(config) {
        const copyIconSpan = document.createElement('span');
        copyIconSpan.classList.add('google-material-icons');
        copyIconSpan.textContent = 'content_copy';
        copyIconSpan.style.color = config.STYLES.COPY_ICON.color;
        return copyIconSpan;
    },

    // ボタン要素を作成してアイコンを追加
    createButtonWithIcon(iconElement, config, ids) {
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.style.backgroundColor = config.STYLES.COPY_BUTTON.backgroundColor;
        copyButton.style.border = config.STYLES.COPY_BUTTON.border;
        copyButton.style.padding = config.STYLES.COPY_BUTTON.padding;
        copyButton.style.cursor = config.STYLES.COPY_BUTTON.cursor;
        copyButton.style.borderRadius = config.STYLES.COPY_BUTTON.borderRadius;
        copyButton.append(iconElement);
        copyButton.id = ids.copyButton;
        return copyButton;
    },

    // ボタンの色を変更するイベント
    handleCopyButtonColorChange(e, color) {
        e.target.style.backgroundColor = color;
    },

    // 退出後のUI要素を作成
    createExitedUI(config, ids, chatLogText, saveChatLogCallback) {
        const textarea = document.createElement('textarea');
        textarea.id = ids.chatLogTextArea;
        textarea.style.width = config.STYLES.TEXTAREA.width;
        textarea.style.height = config.STYLES.TEXTAREA.height;
        textarea.value = chatLogText;
        
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy';
        copyButton.type = 'button';
        copyButton.addEventListener('click', saveChatLogCallback);
        
        const pElement = document.createElement('p');
        pElement.append(copyButton);
        
        const wrapDiv = document.createElement('div');
        wrapDiv.append(textarea, pElement);
        
        return wrapDiv;
    }
};

// モジュールとして利用可能にする
window.UIManager = UIManager;