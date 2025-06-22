// チャット処理関連の機能を管理するモジュール

const ChatManager = {
    // チャット要素を探してクリップボードに保存
    saveChat(appState, selectors, chatMemberNameElementClassName) {
        console.log('ChatManager.saveChat開始');
        const chatMessage = this.getChatText(appState, selectors, chatMemberNameElementClassName);
        console.log('取得したチャットメッセージ:', chatMessage);
        appState.chatOutputFlag = true;
        if (chatMessage === '') {
            console.log('チャットメッセージが空のため処理を終了');
            return;
        }
        console.log('クリップボードに書き込み中...');
        navigator.clipboard.writeText(chatMessage).then(() => {
            console.log('クリップボードへの書き込み成功');
        }).catch(err => {
            console.error('クリップボードへの書き込み失敗:', err);
        });
    },

    // 一時保存されたチャットログをクリップボードに保存
    saveChatLog(appState) {
        if (appState.tmpChatLogText === '') return;
        navigator.clipboard.writeText(appState.tmpChatLogText);
    },

    // チャットテキストを取得
    getChatText(appState, selectors, chatMemberNameElementClassName) {
        console.log('getChatText開始');
        console.log('使用するセレクター:', selectors.chatMessage);
        
        this.getSelfLabel(appState, selectors);
        const allElements = document.querySelectorAll(selectors.chatMessage);
        console.log('querySelector結果:', allElements.length, '個の要素が見つかりました');
        
        // デバッグ: 最初の数個の要素を確認
        Array.from(allElements).slice(0, 3).forEach((el, index) => {
            console.log(`要素 ${index}:`, el.tagName, el.className, el.innerText.substring(0, 50));
        });
        
        const chatMessages = [...allElements].map(el => {
            if (this.isSelfNameAndLabelReady(appState) && 
                el.classList.contains(chatMemberNameElementClassName) && 
                el.innerText.toString() === appState.selfNameLabel) {
                return appState.selfName;
            }
            return el.innerText;
        });
        console.log('変換後のチャットメッセージ数:', chatMessages.length);
        return chatMessages.length ? chatMessages.join('\n') : '';
    },

    // 自分の名前と自分の名前として表示されるラベルを取得する
    getSelfLabel(appState, selectors) {
        const selfNameElement = document.querySelector(selectors.selfNameElement);
        if (selfNameElement) {
            appState.selfNameLabel = selfNameElement.textContent;
        }
    },

    // チャットメンバー名を取得
    getChatMemberName(appState, selectors) {
        const chatMemberNameElement = document.querySelector(selectors.chatMemberName);
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