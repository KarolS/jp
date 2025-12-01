// ==UserScript==
// @name         JPDB show all occurences
// @description  Shows all occurences of words in your decks on the vocabulary page
// @namespace    http://karols.github.io
// @author       vytah
// @version      2025-12-01
// @match        https://jpdb.io/settings
// @match        https://jpdb.io/vocabulary/*
// @match        https://jpdb.io/kanji/*
// @match        https://jpdb.io/search?*
// @match        https://jpdb.io/deck?*
// @match        https://jpdb.io/textbook/*
// @match        https://jpdb.io/novel/*
// @match        https://jpdb.io/visual-novel/*
// @match        https://jpdb.io/anime/*
// @match        https://jpdb.io/aozora/*
// @match        https://jpdb.io/non-fiction/*
// @match        https://jpdb.io/youtube-video/*
// @match        https://jpdb.io/video-game/*
// @match        https://jpdb.io/live-action/*
// @match        https://jpdb.io/web-novel/*
// @match        https://jpdb.io/audio/*
// @match        https://jpdb.io/vocabulary-list/*
// @grant        GM_xmlhttpRequest
// @connect      jpdb.io
// ==/UserScript==

/*
    USER'S MANUAL:
    1. Install the userscript
    2. Visit https://jpdb.io/settings
    3. Click "Fetch decks into cache"
    4. Wait for the fetching to complete
    5. Vocabulary pages should now show word occurences in all your decks
    6. To update the data after you've made modifications to you decks or their content, perform steps 2-5 again
*/
await (async function() {
    'use strict';

    const findApiKey = () => {
        let useNext = false;
        for(let e of document.getElementsByTagName("td")) {
            if (useNext) return e.innerHTML;
            if (e.innerHTML === 'API key') useNext = true;
        }
        return undefined;
    }
    const NEEDS_ESCAPING = /[<>&"']/;
    const escapeHtml = (str) => {
        return !(NEEDS_ESCAPING.test(str)) ? str : str.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    }
    const fortify = (text) => {
        if (text.length > 7) {
            let parts = text.split('/');
            if (parts.length > 1) return parts.map(fortify).join('/');
            return text;
        }
        return [...text].join('\u200d');
    }
    const time = (f, name) => {
        let start = Date.now();
        let result = f();
        let end = Date.now();
        //console.log(`TIME: ${name??''} ${end-start} ms`);
        return result;
    }

    async function jpdbRequest(url, body, apiKey) {
        let response = await GM.xmlHttpRequest({
            url:"https://jpdb.io/api/v1/" + url,
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            method: "POST",
            responseType: 'json',
            data: JSON.stringify(body),
        }).catch(e => console.error(e));
        response = response.response;
        //console.log(response);
        return response;
    }

    async function fetchAllDecks(apiKey) {
        console.log("Fetching deck list");
        let response = await jpdbRequest("list-user-decks", {fields: ["name", "id"]}, apiKey);
        return response.decks.map(it => ({name:it[0], id:it[1]}));
    }
    async function fetchDeck(deckId, apiKey) {
        console.log("Fetching deck " + deckId);
        let response = await jpdbRequest("deck/list-vocabulary", {id:deckId, fetch_occurences: true}, apiKey);
        let vocabs = [];
        for (let i = 0; i < response.vocabulary.length; i++) {
            let vocab = {
                vid: response.vocabulary[i][0],
                sid: response.vocabulary[i][1],
                occurences: response.occurences[i],
            };
            vocabs.push(vocab);
        }
        return vocabs;
    }
    async function fetchSpellings(wordSet, apiKey) {
        console.log("Fetching spellings for " + wordSet.size + " words");
        let ids = [];
        for (let word of wordSet) {
            ids.push(word.split('/').map(it=>+it));
        }
        // console.log(ids);
        let response = await jpdbRequest("lookup-vocabulary", {list:ids, fields:["spelling"]}, apiKey);
        let map = new Map();
        for (let i = 0; i < response.vocabulary_info.length; i++) {
            let spell = response.vocabulary_info[i][0];
            let id = ids[i][1];
            map.set(id, spell);
        }
        return map;
    }

    const DATA_FORMAT_1_UUID = "2f0169ea-593c-423f-8496-255f98f73df5";
    function compressDecks_format1(decks, spellMap) {
        let words = [];
        let wordMap = new Map();
        let compressedDecks = [];
        for (let deck of decks) {
            let compressed = [];
            for (let word of deck.vocabulary) {
                if (!spellMap.has(word.sid)) continue;
                let vsid = `${word.vid}/${word.sid}`;
                let wid = wordMap.get(vsid);
                if (wid == undefined) {
                    wid = words.length/2;
                    wordMap.set(vsid, wid);
                    words.push(word.vid.toString(36));
                    words.push(spellMap.get(word.sid));
                }
                compressed.push(word.occurences === 1 ? wid : [wid, word.occurences]);
            }
            compressedDecks.push({name: deck.name, id:deck.id, vocabulary: compressed});
        }
        return ({
            format: DATA_FORMAT_1_UUID,
            decks: compressedDecks,
            words: words,
            lastFetched: new Date().toString()
        })
    }
    function trimDecks_format1(data, currentVid) {
        let currentVidText;
        let vidMap = new Map();
        if (typeof currentVid === 'number') {
            currentVidText = currentVid.toString(36);
            vidMap.set(currentVid, currentVidText);
        } else {
            currentVidText = new Set();
            for (let vid of currentVid) {
                currentVidText.add(vid.toString(36));
                vidMap.set(vid, vid.toString(36));
            }
        }
        console.log(currentVidText);
        let trimmedDecks = [];
        for (let deck of data.decks) {
            let trimmedVocabulary = [];
            if (typeof currentVidText === 'string') {
                for (let word of deck.vocabulary) {
                    let wid = typeof word === "number" ? word : word[0];
                    if (currentVidText === data.words[wid * 2]){
                        trimmedVocabulary.push({
                            vid: currentVidText,
                            spelling: data.words[wid * 2 + 1],
                            occurences: typeof word === "number" ? 1 : word[1]
                        })
                    }
                }
            } else {
                for (let word of deck.vocabulary) {
                    let wid = typeof word === "number" ? word : word[0];
                    let vid = data.words[wid * 2]
                    if (currentVidText.has(vid)){
                        trimmedVocabulary.push({
                            vid: vid,
                            spelling: data.words[wid * 2 + 1],
                            occurences: typeof word === "number" ? 1 : word[1]
                        })
                    }
                }
            }
            trimmedDecks.push({
                name: deck.name,
                id: deck.id,
                trimmedVocabulary: trimmedVocabulary,
                vidMap: vidMap
            });
        }
        return trimmedDecks;
    }

    function trimDecks_formatAuto(data, currentVid) {
        if (data?.format === DATA_FORMAT_1_UUID) {
            return trimDecks_format1(data, currentVid);
        }
        console.error("Unknown format: " + data?.format);
        return [];
    }
    function hasSupportedFormat(data) {
        return [DATA_FORMAT_1_UUID].includes(data?.format);
    }

    function getTrimmedDecks(currentVid) {
        let data = time(()=>{
            let stored = localStorage.getItem('vv_decks');
            return stored ? JSON.parse(stored) : stored;
        }, "parse");
        if (!data) {
            console.error("Visit https://jpdb.io/settings to fetch decks")
            return;
        }
        if (!hasSupportedFormat(data)) {
            console.error("Invalid cached decks format. Visit https://jpdb.io/settings to fetch decks again")
            return;
        }
        return time(() => trimDecks_formatAuto(data, currentVid), "trim decks");
    }

    function getSettings() {
        let settings = {};
        try {
            let stored = localStorage.getItem('vv_config');
            if (stored) {
                settings = JSON.parse(stored);
                if (typeof settings !== 'object') {
                    console.error("Damaged config!");
                    settings = {};
                }
            }
        } catch (e) {
            console.error("Damaged config!");
        }
        settings.displayOnDeckPage ??= true;
        settings.displayOnVocabularyPage ??= true;
        settings.displayOnVocabularyUsedInPage ??= false;
        settings.displayInUsedInLists ??= true;
        settings.targetDecks ??= 'all';
        return settings;
    }
    function setSettings(settings) {
        console.log('saving');
        localStorage.setItem('vv_config', JSON.stringify(settings));
        console.log('saved');
    }
    function isInvalidDeck(settings, deck) {
        let s = settings.targetDecks;
        if (s === 'all') return false;
        if (Array.isArray(s)) return !s.includes(deck.id);
        console.log('Invalid targetDecks setting: ' + s);
        return false;
    }
    function getTooltipForCounts(item, c) {
        if (c.otherSpellings.size <= 0) {
            if (c.totalThisSpelling <= 0) {
                return `${fortify(item.spelling)} never occurs in the decks`
            }
            return `
${fortify(item.spelling)} occurs\u00a0${c.totalThisSpelling}×
and is the only spelling`;
        } else {
            return `
${fortify(item.spelling)} occurs\u00a0${c.totalThisSpelling}×
${fortify([...c.otherSpellings].join('/')) }\u00a0occur${c.otherSpellings.size===1?'s':''}\u00a0${c.totalAllSpellings-c.totalThisSpelling}×`;
        }
    }
    function getAllRelevantVidsInDocument(currentVid){
        let relevantVids;
        if (currentVid instanceof Set) {
            relevantVids = new Set(currentVid);
        } else {
            relevantVids = new Set();
        }
        if (typeof currentVid === 'string') {
            relevantVids.add(currentVid);
        }
        for(const link of document.querySelectorAll("a")) {
            if (!link.href) continue;
            let vid = getVidFromUrl(link.href);
            if (!vid) continue;
            relevantVids.add(vid);
        }
        return relevantVids;
    }


    const URL_REGEX = /^https:\/\/[\w.]+\/vocabulary\/(\d+)\/([^#\/]+)\/?(?:#.*)?/;
    function getVidAndSpellingFromUrl(href) {
        let urlTokens = href.match(URL_REGEX);
        if (!urlTokens) return undefined;
        let vid = +urlTokens[1];
        let spelling = decodeURI(urlTokens[2]);
        return {vid, spelling};
    }
    function getVidFromUrl(href) {
        let urlTokens = href.match(URL_REGEX);
        if (!urlTokens) return undefined;
        return +urlTokens[1];
    }
    function getWordCounts(item, decks, settings) {
        let otherSpellings = new Set();
        let totalAllSpellings = 0;
        let totalThisSpelling = 0;
        for (let deck of decks) {
            if (isInvalidDeck(settings, deck)) continue;
            if (deck.trimmedVocabulary.length === 0) continue;
            let mappedVid = deck.vidMap ? deck.vidMap.get(item.vid) : item.vid;
            if (mappedVid === undefined) continue;
            let thisDeckAllSpellings = 0;
            let thisDeckThisSpelling = 0;
            for (let word of deck.trimmedVocabulary) {
                if (word.vid === mappedVid) {
                    thisDeckAllSpellings += word.occurences;
                    if (word.spelling === item.spelling) {
                        thisDeckThisSpelling += word.occurences;
                    } else {
                        otherSpellings.add(word.spelling);
                    }
                }
            }
            totalAllSpellings += thisDeckAllSpellings;
            totalThisSpelling += thisDeckThisSpelling;
        }
        return {totalAllSpellings, totalThisSpelling, otherSpellings};
    }

    if (document.URL === "https://jpdb.io/settings") {
        let apiKey = findApiKey();
        console.log(apiKey);
        let data = undefined;
        try {
            let stored = localStorage.getItem('vv_decks');
            if (stored) {
                data = JSON.parse(stored);
                if (!hasSupportedFormat(data)) {
                    console.error("Incompatible deck format in cache: " + data?.format);
                    data = undefined;
                }
            }
        } catch (e) {
            console.error("Damaged parsed decks!");
        }
        document.vv_fetchAllDecks = async () => {
            let progress = document.getElementById("vv_fetch_progress");
            progress.innerHTML = `Fetching decks`;
            let decks = await fetchAllDecks(apiKey);
            //console.log(decks);
            let wordSet = new Set();
            let ix = 1;
            for (let deck of decks) {
                progress.innerHTML = `Fetching deck ${ix} of ${decks.length}`;
                let vocab = await fetchDeck(deck.id, apiKey);
                deck.vocabulary = vocab;
                for(let word of vocab) {
                    wordSet.add(`${word.vid}/${word.sid}`);
                }
                ix += 1;
            }
            progress.innerHTML = "Fetching word spellings";
            let spellMap = await fetchSpellings(wordSet, apiKey);
            progress.innerHTML = "Compressing data";
            let deckData = compressDecks_format1(decks, spellMap);
            localStorage.setItem('vv_decks', JSON.stringify(deckData));
            progress.innerHTML = "Last time fetched: " + deckData.lastFetched;
        }
        const applySettings = (settings) => {
            document.getElementById('vv-displayOnDeckPage').checked = settings.displayOnDeckPage;
            document.getElementById('vv-displayOnVocabularyPage').checked = settings.displayOnVocabularyPage;
            document.getElementById('vv-displayOnVocabularyUsedInPage').checked = settings.displayOnVocabularyUsedInPage;
            document.getElementById('vv-displayInUsedInLists').checked = settings.displayInUsedInLists;
            document.getElementById('vv-targetDecks').value =
                typeof settings.targetDecks === "string" ? settings.targetDecks :
                Array.isArray(settings.targetDecks) ? settings.targetDecks.join(',') :
                "all";

        }
        document.vv_saveSettings = () => {
            let targetDecks = (document.getElementById('vv-targetDecks').value ?? '').trim();
            if (targetDecks !== 'all') {
                try {
                    let array = targetDecks.split(/[,;]/).map(it=>+it.trim());
                    console.log(array);
                    let nan = array.find(it=>it!==it);
                    if (nan === undefined) {
                        targetDecks = array;
                    } else {
                        console.error('Invalid targetDecks value: ' + targetDecks);
                        targetDecks = 'all';
                    }
                } catch (e) {
                    console.error('Invalid targetDecks value: ' + targetDecks);
                    targetDecks = 'all';
                }
            }
            let settings = {
                targetDecks: targetDecks,
                displayOnDeckPage: document.getElementById('vv-displayOnDeckPage').checked,
                displayOnVocabularyPage: document.getElementById('vv-displayOnVocabularyPage').checked,
                displayOnVocabularyUsedInPage: document.getElementById('vv-displayOnVocabularyUsedInPage').checked,
                displayInUsedInLists: document.getElementById('vv-displayInUsedInLists').checked,
            };
            console.log(settings);
            setSettings(settings);
            applySettings(settings)
        }
        let settings = getSettings();
        try {
            let header = document.getElementsByTagName("H4")[0];
            let last_date = data?.lastFetched;
            if (last_date) last_date = "Last time fetched: " + last_date; else last_date = "No decks in cache. You need to fetch them before using the script.";
            console.log(last_date);
            function checkbox(id, text) {
                return `
<div class="checkbox">
<input type="checkbox" class="vv-saves-settings" id="vv-${id}" name="vv-${id}" checked="${settings[id]} ? 'checked' : ''}">
<label for="vv-${id}">${text}</label>
</div>`
            }
            header.outerHTML += `
<form>
<h6 style="margin-top: 0;">Settings for ‟Show all occurences” script</h6>
<div><div class="subsection-header">
<span id="vv_fetch_progress">${last_date}</span>
<br>
<input type="button" onclick="document.vv_fetchAllDecks()" class="outline" style="font-weight: bold;" value="Fetch decks into cache">
</div></div>
${checkbox('displayOnDeckPage', 'Display occurences in deck vocabulary list')}
${checkbox('displayInUsedInLists', 'Display occurences in "Used in vocabulary" and "Composed of" lists')}
${checkbox('displayOnVocabularyPage', 'Display detailed occurences on vocabulary details page')}
${checkbox('displayOnVocabularyUsedInPage', 'Display detailed occurences on vocabulary "Used in" page')}
<div class="form-box-parent"><div class="form-box"><div>
<label for="vv-targetDecks">Deck ids for counting occurences (or <i>all</i> for all):</label>
<input style="max-width: 32rem;" type="text" id="vv-targetDecks" name="vv-targetDecks" value="">
</div></div></div>
<div><div class="subsection-header">
<br>
<input type="button" onclick="document.vv_saveSettings()" class="outline" style="font-weight: bold;" value="Save settings for ‟Show all occurences” script">
</div></div>
</form>
            `;
            applySettings(settings);
        } catch (e) {
            console.error("Failed to inject UI. You can fetch decks manually by executing in the console:\ndocument.vv_fetchAllDecks()");
        }
    }

    if (document.URL.startsWith('https://jpdb.io/vocabulary/') || document.URL.startsWith('https://jpdb.io/search?')) {
        let settings = getSettings();
        if (document.URL.includes("/used-in")) {
            if (!settings.displayOnVocabularyUsedInPage) return;
        } else {
            if (!settings.displayOnVocabularyPage) return;
        }
        let currentVid = +document.URL.split('/')[4];
        if (!Number.isInteger(currentVid) || currentVid < 0) {
            console.log("Invalid word ID in URL")
            return;
        }
        let siblingDiv = undefined;
        if (document.URL.includes("/used-in")) {
            siblingDiv = document.getElementsByClassName('vocabulary')[0];
        } else {
            try {
                siblingDiv = document.getElementsByClassName('view-conjugations-link')[0].parentElement;
            } catch (e) {
                siblingDiv = document.getElementsByClassName('subsection-pitch-accent')[0].parentElement.parentElement.parentElement;
            }
        }
        if (!siblingDiv) {
            console.log("No target div found")
            return;
        }
        let relevantVids;
        if (settings.displayInUsedInLists) {
            relevantVids = getAllRelevantVidsInDocument(currentVid);
        } else {
            relevantVids = currentVid;
        }
        let decks = getTrimmedDecks(relevantVids);
        if (!decks) return;
        let spellingsList = time(() => {
            let spellings = new Map();
            for (let deck of decks) {
                for (let word of deck.trimmedVocabulary) {
                    spellings.set(word.spelling, (spellings.get(word.spelling) ?? 0) + word.occurences);
                }
            }
            return [...spellings.entries()];
        }, "build spellings map");
        if (spellingsList.length === 0) {
            console.log("Word not in any deck");
            if (!settings.displayInUsedInLists) return;
        }
        spellingsList.sort((a,b) => b[1] - a[1]);
        const nudgeFactor = (i) => i < 0 ? 1e8 : 1e8 + (spellingsList.length - i);
        let rows = [];
        time(() =>{
            for (let deck of decks) {
                if (isInvalidDeck(settings, deck)) continue;
                if (deck.trimmedVocabulary.length === 0) continue;
                let cells = Array(spellingsList.length);
                cells.fill({html: `<td style="padding:0;border:none;padding-left:1em;text-align:right"></td>`});
                let totalInThisDeck = 0;
                let totalInThisDeckNudged = 0;
                for (let word of deck.trimmedVocabulary) {
                    let index = spellingsList.findIndex(it => it[0] === word.spelling);
                    totalInThisDeck += word.occurences;
                    totalInThisDeckNudged += word.occurences * nudgeFactor(index);
                    let cell = {
                        occurences: word.occurences,
                        html: `
<td style="padding:0;border:none;padding-left:1em;text-align:right">
<b>${word.occurences}×</b>&nbsp;<a class="plain" href="https://jpdb.io/vocabulary/${currentVid}/${encodeURI(word.spelling)}#a">${word.spelling}</a>
</td>`
                    };
                    if (index < 0) {
                        cells.push(cell);
                    } else {
                        cells[index] = cell;
                    }
                }
                if (totalInThisDeck > 0) {
                    rows.push({
                        occurences: totalInThisDeck,
                        nudgedOccurences: totalInThisDeckNudged,
                        html: `<tr>
<td style="padding:0;border:none"><a href="https://jpdb.io/deck?id=${deck.id}">${escapeHtml(deck.name)}</a></td>
${cells.map(it=>it.html).join('')}
</tr>`
                    });
                }
            }
        }, "build table");
        if (rows.length) {
            rows.sort((a,b) => b.nudgedOccurences - a.nudgedOccurences);
            let total = rows.map(it => it.occurences).reduce((a, b) => a + b);
            console.log("Word found in " + rows.length + " decks");
            siblingDiv.outerHTML += `
            <div><table>
            ${rows.map(it=>it.html).join('')}
            <tr><td style="border:none">Total: <b>${total}</b></td>
            ${spellingsList.map(s => s[1] ? `
                <td class="greyed-out" style="padding:0;border:none;padding-left:1em;text-align:right">
                <b>${s[1]}×</b>&nbsp;<a class="plain" href="https://jpdb.io/vocabulary/${currentVid}/${encodeURI(s[0])}#a">${s[0]}</a>
                </td>
            ` : `<td class="greyed-out" style="padding:0;border:none"></td>`).join('')}
            </tr></table></div>`;
        } else {
            console.log("Word not in any deck");
        }


        const usedInExamples = document.querySelectorAll("div.subsection-used-in div.used-in");
        if (settings.displayInUsedInLists && usedInExamples) {
            for (let usedInExample of usedInExamples) {
                const usedInLink = usedInExample.querySelector("a");
                if (!usedInLink) continue;
                let vs = getVidAndSpellingFromUrl(usedInLink.href);
                if (!vs) continue;
                let c = getWordCounts(vs, decks, settings);
                if (!c) continue;
                let tooltip = getTooltipForCounts(vs, c);
                usedInExample.innerHTML += `
                    <div class="tag tooltip" style="text-align:left !important;padding:0;${c.totalAllSpellings ? '' : 'opacity:0.5'}" data-tooltip="${tooltip}"><span>
                    In all decks: ${c.totalThisSpelling}${c.totalAllSpellings !== c.totalThisSpelling ? `&nbsp;<span style="opacity:0.5">(${c.totalAllSpellings})</span>` : ''}
                    </span></div>`;
            }
        }
        const composedOfExamples = document.querySelectorAll("div.composed-of");
        if (settings.displayInUsedInLists && composedOfExamples) {
            for (let composedOfExample of composedOfExamples) {
                const composedOfLink = composedOfExample.querySelector("a");
                if (!composedOfLink) continue;
                let vs = getVidAndSpellingFromUrl(composedOfLink.href);
                if (!vs) continue;
                let c = getWordCounts(vs, decks, settings);
                if (!c) continue;
                const targetDiv = composedOfExample.querySelector("div.description");
                if (!targetDiv) continue;
                let tooltip = getTooltipForCounts(vs, c);
                targetDiv.innerHTML += `
                    <br><div class="tag tooltip" style="text-align:left !important;padding:0;${c.totalAllSpellings ? '' : 'opacity:0.5'}" data-tooltip="${tooltip}"><span>
                    In all decks: ${c.totalThisSpelling}${c.totalAllSpellings !== c.totalThisSpelling ? `&nbsp;<span style="opacity:0.5">(${c.totalAllSpellings})</span>` : ''}
                    </span></div>`;
            }
        }
    }

    if (document.URL.startsWith('https://jpdb.io/kanji/')) {
        let settings = getSettings();
        if (!settings.displayInUsedInLists) return;
        let relevantVids = getAllRelevantVidsInDocument();
        let decks = getTrimmedDecks(relevantVids);
        const usedInExamples = document.querySelectorAll("div.subsection-used-in div.used-in");
        if (usedInExamples) {
            for (let usedInExample of usedInExamples) {
                const usedInLink = usedInExample.querySelector("a");
                if (!usedInLink) continue;
                let vs = getVidAndSpellingFromUrl(usedInLink.href);
                if (!vs) continue;
                let c = getWordCounts(vs, decks, settings);
                if (!c) continue;
                let tooltip = getTooltipForCounts(vs, c);
                usedInExample.innerHTML += `
                    <div class="tag tooltip" style="text-align:left !important;padding:0;${c.totalAllSpellings ? '' : 'opacity:0.5'}" data-tooltip="${tooltip}"><span>
                    In all decks: ${c.totalThisSpelling}${c.totalAllSpellings !== c.totalThisSpelling ? `&nbsp;<span style="opacity:0.5">(${c.totalAllSpellings})</span>` : ''}
                    </span></div>`;
            }
        }
    }

    if (document.URL.startsWith('https://jpdb.io/deck?') || document.URL.includes('/vocabulary-list')) {
        let settings = getSettings();
        if (!settings.displayOnDeckPage) return;
        let itemsDivs = document.getElementsByClassName("entry");
        let vids = new Set();
        let items = [];
        for (let itemDiv of itemsDivs) {
            let vs = getVidAndSpellingFromUrl(itemDiv.getElementsByTagName("a")[0].href);
            if (!vs) continue;
            vids.add(vs.vid);
            items.push({...vs, div: itemDiv});
        }
        let decks = getTrimmedDecks(vids);
        if (!decks) return;
        for (let item of items) {
            let c = getWordCounts(item, decks, settings);
            let tooltip = getTooltipForCounts(item, c);
            let tagDiv = item.div.getElementsByClassName("tags")[0]
            if (tagDiv) {
                tagDiv.innerHTML = `
                <div class="tag tooltip" style="${c.totalAllSpellings ? '' : 'opacity:0.5'}" data-tooltip="${tooltip}"><span>
                In all decks: ${c.totalThisSpelling}${c.totalAllSpellings !== c.totalThisSpelling ? `&nbsp;<span style="opacity:0.5">(${c.totalAllSpellings})</span>` : ''}
                </span></div>` + tagDiv.innerHTML
            } else {
                console.log("No div with tags");
            }
        }
    }

})();
