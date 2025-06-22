// DOM操作とObserver関連のユーティリティ関数

const DOMUtils = {
    // セレクタを元にDOMを検索し、存在したら指定のイベントを追加する関数
    observeAndAttachEvent(selector, event, eventHandler, disconnect) {
        return ObserverManager.observeAndAttachEvent(selector, event, eventHandler, disconnect);
    },

    // Picture-in-Picture専用のObserver関数
    observeAndAttachEventPinP(pinpWindow, selector, event, eventHandler, disconnect) {
        return ObserverManager.observeForElement(selector, (element, observer) => {
            // PinP内のイベントハンドラーを追加
            // メインウィンドウのコンテキストでイベントハンドラーを実行
            element.addEventListener(event, () => {
                // メインウィンドウの関数を呼び出す
                window.parent.postMessage({ type: 'PINP_EVENT', eventType: event, selector: selector }, '*');
            });
        }, disconnect, pinpWindow.document);
    },

    // 指定されたセレクターの要素が存在するかチェック
    elementExists(selector) {
        return document.querySelector(selector) !== null;
    },

    // 要素にスタイルを適用
    applyStyles(element, styles) {
        Object.keys(styles).forEach(property => {
            element.style[property] = styles[property];
        });
    }
};

// モジュールとして利用可能にする
window.DOMUtils = DOMUtils;