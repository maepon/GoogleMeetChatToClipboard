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

    // チャット要素を探してクリップボードに保存
    saveChat(appState, selectors, chatMemberNameElementClassName) {
        const chatMessage = this.getChatText(appState, selectors, chatMemberNameElementClassName);
        appState.chatOutputFlag = true;
        if (chatMessage === '') {
            return;
        }
        navigator.clipboard.writeText(chatMessage).catch(err => {
            console.error('クリップボードへの書き込み失敗:', err);
        });
    },

    // PinP環境専用のsaveChat（明示的にPinPウィンドウのdocumentを使用）
    saveChatFromPinP(appState, selectors, chatMemberNameElementClassName, pinpDocument) {
        const chatMessage = this.getChatTextFromPinP(appState, selectors, chatMemberNameElementClassName, pinpDocument);
        appState.chatOutputFlag = true;
        if (chatMessage === '') {
            return;
        }
        
        // メインウィンドウにフォーカスを移す
        window.focus();
        if (document.body) {
            document.body.focus();
        }
        
        // フォーカス移動後に少し待ってからクリップボード書き込み
        setTimeout(() => {
            navigator.clipboard.writeText(chatMessage).then(() => {
                appState.chatOutputFlag = true;
            }).catch(err => {
                // フォールバック: 従来のexecCommandを試行
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
                        appState.chatOutputFlag = true;
                    } else {
                        throw new Error('execCommand failed');
                    }
                    
                    document.body.removeChild(textArea);
                } catch (execErr) {
                    // 最終的にtmpChatLogTextに保存
                    appState.tmpChatLogText = chatMessage;
                }
            });
        }, 100); // 100ms待機
    },

    // PinP環境でのコピーボタン専用（フォーカス移動なし）
    saveChatFromPinPCopy(appState, selectors, chatMemberNameElementClassName, pinpDocument) {
        const chatMessage = this.getChatTextFromPinP(appState, selectors, chatMemberNameElementClassName, pinpDocument);
        appState.chatOutputFlag = true;
        if (chatMessage === '') {
            return;
        }
        
        // フォーカス移動せずにexecCommandを直接使用
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
                appState.chatOutputFlag = true;
            } else {
                throw new Error('execCommand failed');
            }
            
            document.body.removeChild(textArea);
        } catch (execErr) {
            // 最終的にtmpChatLogTextに保存
            appState.tmpChatLogText = chatMessage;
        }
    },

    // 一時保存されたチャットログをクリップボードに保存
    saveChatLog(appState) {
        if (appState.tmpChatLogText === '') return;
        navigator.clipboard.writeText(appState.tmpChatLogText);
    },

    // チャットテキストを取得
    getChatText(appState, selectors, chatMemberNameElementClassName) {
        // 適切なdocumentを取得
        const targetDoc = this.getTargetDocument();
        
        // 全体のセレクター
        this.getSelfLabel(appState, selectors, targetDoc);
        const allElements = targetDoc.querySelectorAll(selectors.chatMessage);
        
        const chatMessages = [...allElements].map(el => {
            if (this.isSelfNameAndLabelReady(appState) && 
                el.classList.contains(chatMemberNameElementClassName) && 
                el.innerText.toString() === appState.selfNameLabel) {
                return appState.selfName;
            }
            return el.innerText;
        });
        return chatMessages.length ? chatMessages.join('\n') : '';
    },

    // PinP環境専用のgetChatText（明示的にPinPウィンドウのdocumentを使用）
    getChatTextFromPinP(appState, selectors, chatMemberNameElementClassName, pinpDocument) {
        // 全体のセレクター
        this.getSelfLabelFromPinP(appState, selectors, pinpDocument);
        const allElements = pinpDocument.querySelectorAll(selectors.chatMessage);
        
        const chatMessages = [...allElements].map(el => {
            if (this.isSelfNameAndLabelReady(appState) && 
                el.classList.contains(chatMemberNameElementClassName) && 
                el.innerText.toString() === appState.selfNameLabel) {
                return appState.selfName;
            }
            return el.innerText;
        });
        return chatMessages.length ? chatMessages.join('\n') : '';
    },

    // 自分の名前と自分の名前として表示されるラベルを取得する
    getSelfLabel(appState, selectors, targetDoc = null) {
        const doc = targetDoc || this.getTargetDocument();
        const selfNameElement = doc.querySelector(selectors.selfNameElement);
        if (selfNameElement) {
            appState.selfNameLabel = selfNameElement.textContent;
        }
    },

    // PinP環境専用のgetSelfLabel
    getSelfLabelFromPinP(appState, selectors, pinpDocument) {
        const selfNameElement = pinpDocument.querySelector(selectors.selfNameElement);
        if (selfNameElement) {
            appState.selfNameLabel = selfNameElement.textContent;
        }
    },

    // チャットメンバー名を取得
    getChatMemberName(appState, selectors) {
        const targetDoc = this.getTargetDocument();
        const chatMemberNameElement = targetDoc.querySelector(selectors.chatMemberName);
        if (chatMemberNameElement && chatMemberNameElement.getAttribute('title')) {
            appState.selfName = chatMemberNameElement.getAttribute('title');
        }
    },

    // 自分の名前とラベルが保存されているかを確認する
    isSelfNameAndLabelReady(appState) {
        return appState.selfName !== '' && appState.selfNameLabel !== '';
    }
};

// モジュールとして利用可能にする
window.ChatManager = ChatManager;