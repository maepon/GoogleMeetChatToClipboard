// 通話から退出ボタンを識別するためのセレクタ
const exitButtonSelector = '[jsname="CQylAd"]';

// チャットメッセージを識別するためのセレクタ
const chatMessageSelector = '[jsname="Ypafjf"] div div';

// チャット要素を探してクリップボードに保存
function saveChat() {
    let chatMessage = getChatText();
    if (chatMessage === '') {
        return;
    }
    navigator.clipboard.writeText(chatMessage);
}

function getChatText() {
    let chatMessages = [...document.querySelectorAll(chatMessageSelector)].map(el => el.innerText);
    if (chatMessages.length === 0) {
        return '';
    }
    return chatMessages.join('\n');
}

// ボタンクリックを監視するためのMutationObserver
const observer = new MutationObserver((mutationsList, observer) => {
    for(let mutation of mutationsList) {
        if (mutation.type === 'childList') {
            const exitButton = document.querySelector(exitButtonSelector);
            if (exitButton) {
                exitButton.addEventListener('click', saveChat);
                observer.disconnect();  // 通話から退出ボタンが見つかったら監視を停止
            }
        }
    }
});

// ドキュメント全体の変更を監視開始
observer.observe(document, { childList: true, subtree: true });
