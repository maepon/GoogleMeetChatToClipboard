// 通話から退出ボタンを識別するためのセレクタ
const exitButtonSelector = '[aria-label="通話から退出"]';

// チャット要素を探してクリップボードに保存
function saveChat() {
    console.log('saveChat');
    let chatMessages = [...document.querySelectorAll('.GDhqjd div div')].map(el => el.innerText);
    navigator.clipboard.writeText(chatMessages.join('\n'));
    console.log(chatMessages.join('\n'));
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
