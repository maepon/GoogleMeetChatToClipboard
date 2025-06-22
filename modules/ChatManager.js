// チャット処理関連の機能を管理するモジュール

const ChatManager = {
    // チャット要素を探してクリップボードに保存
    saveChat(appState, selectors, chatMemberNameElementClassName) {
        const chatMessage = this.getChatText(appState, selectors, chatMemberNameElementClassName);
        appState.chatOutputFlag = true;
        if (chatMessage === '') return;
        navigator.clipboard.writeText(chatMessage);
    },

    // 一時保存されたチャットログをクリップボードに保存
    saveChatLog(appState) {
        if (appState.tmpChatLogText === '') return;
        navigator.clipboard.writeText(appState.tmpChatLogText);
    },

    // チャットテキストを取得
    getChatText(appState, selectors, chatMemberNameElementClassName) {
        this.getSelfLabel(appState, selectors);
        const chatMessages = [...document.querySelectorAll(selectors.chatMessage)].map(el => {
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