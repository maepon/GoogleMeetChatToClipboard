// チャット処理関連の機能を管理するモジュール

const ChatManager = {
    // PinP環境かどうかを判定し、適切なdocumentを返す
    getTargetDocument() {
        // PinPウィンドウ内で実行されているかチェック
        // PinP環境では常にメインウィンドウのチャットデータを参照する
        if (window.documentPictureInPicture && 
            window.documentPictureInPicture.window && 
            window.documentPictureInPicture.window.document === document) {
            // PinP内で実行されている場合、メインウィンドウのdocumentを参照
            return window.parent ? window.parent.document : document;
        }
        // メインウィンドウで実行されている場合
        return document;
    },

    // 保存対象のミーティングか判定（div.hsLqkc の存在確認）
    isSaveTarget(targetDoc, selectors) {
        if (!targetDoc || !selectors || !selectors.nonSaveTargetIndicator) {
            return false;
        }
        return targetDoc.querySelector(selectors.nonSaveTargetIndicator) !== null;
    },

    // チャット要素を探してクリップボードに保存
    saveChat(appState, selectors, targetDoc) {
        const doc = targetDoc || this.getTargetDocument();
        const chatMessage = this.getChatText(appState, selectors, doc);
        if (chatMessage === '') {
            return;
        }
        appState.tmpChatLogText = chatMessage;
        navigator.clipboard.writeText(chatMessage).catch(err => {
            console.error(chrome.i18n.getMessage('clipboardWriteError'), err);
            this._execCommandClipboard(chatMessage, appState);
        });
    },

    // execCommandを使用したクリップボード書き込みヘルパー関数
    _execCommandClipboard(chatMessage, appState) {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = chatMessage;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            if (document.execCommand('copy')) {
                return true;
            } else {
                throw new Error('execCommand failed');
            }
        } catch (execErr) {
            // 最終的にtmpChatLogTextに保存
            appState.tmpChatLogText = chatMessage;
            return false;
        } finally {
            // textAreaの後始末
            const textArea = document.querySelector('textarea[style*="-999999px"]');
            if (textArea && textArea.parentNode) {
                textArea.parentNode.removeChild(textArea);
            }
        }
    },

    // PinP環境専用のsaveChat（明示的にPinPウィンドウのdocumentを使用）
    saveChatFromPinP(appState, selectors, pinpDocument) {
        const chatMessage = this.getChatTextFromPinP(appState, selectors, pinpDocument);
        if (chatMessage === '') {
            return;
        }
        appState.tmpChatLogText = chatMessage;
        
        // メインウィンドウにフォーカスを移す
        window.focus();
        if (document.body) {
            document.body.focus();
        }
        
        // フォーカス移動後に少し待ってからクリップボード書き込み
        setTimeout(() => {
            navigator.clipboard.writeText(chatMessage).catch(err => {
                // フォールバック: execCommandを試行
                this._execCommandClipboard(chatMessage, appState);
            });
        }, 100); // 100ms待機
    },

    // PinP環境でのコピーボタン専用（フォーカス移動なし）
    saveChatFromPinPCopy(appState, selectors, pinpDocument) {
        const chatMessage = this.getChatTextFromPinP(appState, selectors, pinpDocument);
        if (chatMessage === '') {
            return;
        }
        appState.tmpChatLogText = chatMessage;
        
        // フォーカス移動せずにexecCommandを直接使用
        this._execCommandClipboard(chatMessage, appState);
    },

    // 一時保存されたチャットログをクリップボードに保存
    saveChatLog(appState) {
        const textToSave = appState.pendingExitChatLogText || appState.tmpChatLogText;
        if (!textToSave) return;
        navigator.clipboard.writeText(textToSave).catch(err => {
            console.error(chrome.i18n.getMessage('clipboardWriteError'), err);
            this._execCommandClipboard(textToSave, appState);
        });
    },

    // チャットテキストを取得（メッセージブロック単位での解析）
    getChatText(appState, selectors, targetDoc) {
        const doc = targetDoc || this.getTargetDocument();
        
        if (!doc || !this.isSaveTarget(doc, selectors)) {
            return '';
        }

        const container = doc.querySelector(selectors.chatContainer);
        if (!container) return '';

        const messageBlocks = container.querySelectorAll(selectors.chatMessage);
        const chatMessages = [];

        messageBlocks.forEach(block => {
            const textElements = block.querySelectorAll(selectors.messageText);
            if (!textElements || textElements.length === 0) return;

            const timeEl = block.querySelector(selectors.messageTime);
            const senderEl = block.querySelector(selectors.messageSender);

            const getTextContent = (el) => {
                if (!el) return '';
                const value = typeof el.innerText === 'string' ? el.innerText : el.textContent;
                return (value || '').trim();
            };

            // 発信者表示がない場合は自分発言とし、selfName が無ければ名前表示を行わない
            const sender = senderEl ? getTextContent(senderEl) : (appState ? (appState.selfName || '') : '');
            const time = getTextContent(timeEl);

            const blockLines = [];
            if (sender) blockLines.push(sender);
            if (time) blockLines.push(time);

            let hasValidText = false;
            textElements.forEach(textEl => {
                const text = getTextContent(textEl);
                if (text) {
                    blockLines.push(text);
                    hasValidText = true;
                }
            });

            if (hasValidText && blockLines.length > 0) {
                chatMessages.push(blockLines.join('\n'));
            }
        });

        return chatMessages.length ? chatMessages.join('\n') : '';
    },

    // PinP環境専用のgetChatText（明示的にPinPウィンドウのdocumentを使用）
    getChatTextFromPinP(appState, selectors, pinpDocument) {
        return this.getChatText(appState, selectors, pinpDocument);
    },

    // チャットメンバー名を取得
    getChatMemberName(appState, selectors) {
        const targetDoc = this.getTargetDocument();
        const chatMemberNameElement = targetDoc.querySelector(selectors.chatMemberName);
        if (chatMemberNameElement && chatMemberNameElement.getAttribute('title')) {
            appState.selfName = chatMemberNameElement.getAttribute('title');
        }
    }
};

// モジュールとして利用可能にする
window.ChatManager = ChatManager;