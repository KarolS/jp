// ==UserScript==
// @name         Hide Chinese Pixiv novels
// @namespace    http://tampermonkey.net/
// @version      2026-05-12
// @description  Hides Chinese novels on Pixiv in Google search results
// @author       vytah
// @match        https://www.google.com/search*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    let search = window.location.search;
    if (!search) return;
    searching_pixiv: {
        for(let term of ["site:www.pixiv.net", "site:pixiv.net", "site%3Awww.pixiv.net", "site%3Apixiv.net"]) {
            if (search.includes(term)) {
                break searching_pixiv;
            }
        }
        return;
    }
    //
    let chineseCharacters = "级给绝丝结纪续实语论认说计记设们问简轻军见则马妈饱资兴发书险脸为伦沦欢戏难压护处飞长".split('');
    let links = document.getElementsByTagName("a");
    for (let a of links) {
        if (a.href && a.href.includes("pixiv") && a.href.includes("novel")) {
            let text = a.text;
            if (!text.includes("pixiv")) continue;
            let div = a.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement;
            let lang = div.lang;
            console.log(text, lang);
            let isChinese;
            if (lang && lang.startsWith("zh")) {
                isChinese = true;
            } else {
                isChinese = false;
                for (let c of chineseCharacters) {
                    if (text.includes(c)) {
                        isChinese = true;
                        break;
                    }
                }
            }
            if (isChinese) {
                div.style += ";opacity: 30%;";
            }
        }
    }
})();
