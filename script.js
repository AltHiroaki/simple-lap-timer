/* ==========================================================================
   CONSTANTS & VARIABLES (定義・状態管理)
   ========================================================================== */

// --- UI要素の参照 ---
const EL_TIMER_DISPLAY  = document.getElementById('timer-display');
const EL_COMPARISON     = document.getElementById('comparison-target-name');
const EL_BTN_START      = document.getElementById('btn-start');
const EL_BTN_LAP        = document.getElementById('btn-lap');
const EL_BTN_STOP       = document.getElementById('btn-stop');
const EL_LIST_CONTAINER = document.getElementById('segment-list-container');
const EL_BTN_ADD        = document.getElementById('btn-add-segment');
const EL_BTN_DONE       = document.getElementById('btn-done-setup');
const EL_BTN_CLEAR      = document.getElementById('btn-clear-data');
const EL_LAP_LIST_BODY  = document.getElementById('lap-list-body');

// インポート機能用UI（新規追加）
const EL_IMPORT_TEXT    = document.getElementById('import-text');
const EL_BTN_IMPORT     = document.getElementById('btn-import');

// --- アプリケーションの状態 ---

// データ構造: { name: "区間名", target: "目標秒数(文字列)" } の配列
// 初期値として4つの区間を設定
let segmentsData = [
    { name: "Area 1", target: "" },
    { name: "Boss 1", target: "" },
    { name: "Area 2", target: "" },
    { name: "Boss 2", target: "" },
    { name: "Timer Stop", target: "" }
];

// ベスト記録（累積タイムの配列）[ms, ms, ms...]
// 以前のセッションまたは完了したランから読み込まれる
let personalBestSplits = []; 

// タイマー計測用変数
let startTime = 0;           // 計測開始時刻（Unix Time）
let elapsedTime = 0;         // 現在の経過時間（ミリ秒）
let timerInterval = null;    // setIntervalのID
let isRunning = false;       // 動作中フラグ
let currentSegmentIndex = 0; // 現在計測中の区間インデックス
let currentRunSplits = [];   // 今回の計測中のタイム記録用配列

// LocalStorageのキー定義
const LS_KEY_DATA = "rta_timer_data_v2"; // データ保存用キー

/* ==========================================================================
   FUNCTIONS (ロジック・操作)
   ========================================================================== */

/**
 * アプリ起動時の初期化処理を行う関数
 * 保存データの読み込み、UIの構築、初期状態のセットアップを順に実行する。
 */
function initApp() {
    loadData(); // LocalStorageから設定と記録を復元
    renderSetupList(); // 設定画面の入力欄を生成
    finishSetup(); // メイン画面のテーブルを初期化
}

/**
 * LocalStorageからデータを読み込む関数
 * 保存されたJSONデータを解析し、segmentsData および personalBestSplits に反映する。
 * データが存在しない場合はデフォルト値を使用する。
 */
function loadData() {
    const json = localStorage.getItem(LS_KEY_DATA);
    if (json) {
        try {
            const data = JSON.parse(json);
            if (data.segments) segmentsData = data.segments;
            if (data.pb) personalBestSplits = data.pb;
        } catch (e) {
            console.error("データ読み込みエラー:", e);
        }
    }
}

/**
 * LocalStorageへ現在のデータを保存する関数
 * segmentsData（区間設定）と personalBestSplits（自己ベスト）をJSON化して保存する。
 * 設定変更時や記録更新時に呼び出される。
 */
function saveData() {
    const data = {
        segments: segmentsData,
        pb: personalBestSplits
    };
    localStorage.setItem(LS_KEY_DATA, JSON.stringify(data));
}

/**
 * データを全消去する関数
 * ユーザーの確認後、LocalStorageとメモリ上のデータを初期化し、画面をリセットする。
 */
function clearAllData() {
    if(!confirm("自己ベスト記録を含め、全ての設定を削除しますか？\nこの操作は取り消せません。")) return;
    
    localStorage.removeItem(LS_KEY_DATA);
    // 初期状態へリセット
    segmentsData = [{ name: "Segment 1", target: "" }];
    personalBestSplits = [];
    
    // 画面再描画
    renderSetupList();
    finishSetup();
}

/**
 * テキストエリアから区間リストを一括インポートする関数
 * 改行区切りで区間を認識し、タブまたはカンマ区切りで「名前」と「目標タイム」を抽出する。
 * Excelからのコピペに対応。
 */
function importSegments() {
    const text = EL_IMPORT_TEXT.value;
    if (!text || !text.trim()) {
        alert("テキストエリアが空です。貼り付けてから実行してください。");
        return;
    }

    // ユーザーへの確認
    if (!confirm("現在のリストを上書きしてインポートしますか？\n※既存の区間設定とベスト記録はリセットされます。")) return;

    const lines = text.split('\n');
    const newSegments = [];

    lines.forEach(line => {
        if (!line.trim()) return; // 空行はスキップ

        // タブ(Excel)またはカンマ(CSV)で分割を試みる
        // 例: "Opening" または "Opening\t120"
        let parts = line.split(/\t|,/);
        
        const name = parts[0].trim();
        let target = "";

        // 2列目があり、かつ数値として解釈できる場合は目標タイムとする
        if (parts.length > 1) {
            const val = parts[1].trim();
            if (val && !isNaN(val)) {
                target = val;
            }
        }

        if (name) {
            newSegments.push({ name: name, target: target });
        }
    });

    if (newSegments.length === 0) {
        alert("有効なデータが見つかりませんでした。");
        return;
    }

    // データの更新
    segmentsData = newSegments;
    personalBestSplits = []; // 区間が変わるためPBはリセット
    EL_IMPORT_TEXT.value = ""; // 入力欄をクリア

    saveData();
    renderSetupList();
    finishSetup();
    
    // detailsタグを閉じる（UIの見栄えのため）
    const details = document.querySelector('.import-section');
    if (details) details.removeAttribute('open');
    
    alert("インポートが完了しました。");
}

/**
 * セットアップ画面の入力リストを描画する関数
 * segmentsDataに基づき、区間名と目標タイムの入力フィールドを動的に生成する。
 */
function renderSetupList() {
    EL_LIST_CONTAINER.innerHTML = "";
    
    segmentsData.forEach((seg, index) => {
        const div = document.createElement('div');
        div.className = 'segment-row';

        // 区間名入力フィールド
        const inputName = document.createElement('input');
        inputName.type = "text";
        inputName.value = seg.name;
        inputName.placeholder = `区間 ${index + 1}`;
        // 入力時に即時保存
        inputName.oninput = (e) => {
            segmentsData[index].name = e.target.value;
            saveData(); 
        };

        // 目標タイム入力フィールド（秒単位）
        const inputTarget = document.createElement('input');
        inputTarget.type = "number";
        inputTarget.placeholder = "目標(秒)";
        inputTarget.value = seg.target;
        inputTarget.title = "この区間までの目標累積時間（秒）を入力";
        // 入力時に即時保存
        inputTarget.oninput = (e) => {
            segmentsData[index].target = e.target.value;
            saveData();
        };

        // 削除ボタン
        const delBtn = document.createElement('button');
        delBtn.textContent = "×";
        delBtn.className = "btn-remove";
        delBtn.onclick = () => removeSegment(index);

        div.appendChild(inputName);
        div.appendChild(inputTarget);
        div.appendChild(delBtn);
        EL_LIST_CONTAINER.appendChild(div);
    });
}

/**
 * 新しい区間を追加する関数
 * 配列の末尾に空の区間データを追加し、画面を更新・保存する。
 */
function addSegment() {
    segmentsData.push({ name: "", target: "" });
    renderSetupList();
    saveData();
}

/**
 * 指定されたインデックスの区間を削除する関数
 * 区間数が1つ未満にならないよう制御する。
 * 区間構造が変わるため、整合性維持のために自己ベスト記録はリセットされる。
 * @param {number} index - 削除対象のインデックス
 */
function removeSegment(index) {
    if (segmentsData.length <= 1) {
        alert("これ以上削除できません");
        return;
    }
    segmentsData.splice(index, 1);
    
    // 区間構成が変わると過去の記録と比較できないためリセット
    personalBestSplits = []; 
    
    renderSetupList();
    saveData();
}

/**
 * セットアップを完了し、計測画面（テーブル）を初期化する関数
 * タイマーのリセット、比較対象（PBまたは目標）の決定、テーブルの再構築を行う。
 */
function finishSetup() {
    stopTimer();
    elapsedTime = 0;
    currentSegmentIndex = 0;
    currentRunSplits = [];
    EL_TIMER_DISPLAY.textContent = "00:00:00.000";

    // 比較対象の決定（PBが全区間分あればPB優先、なければ目標タイム）
    const hasPB = (personalBestSplits.length === segmentsData.length);
    EL_COMPARISON.textContent = hasPB ? "比較: 自己ベスト (PB)" : "比較: 目標タイム (Target)";

    // テーブル生成
    EL_LAP_LIST_BODY.innerHTML = "";
    
    segmentsData.forEach((seg, i) => {
        const row = document.createElement('tr');
        
        // 1. 区間名
        const colName = document.createElement('td');
        colName.textContent = seg.name || `Segment ${i+1}`;
        
        // 2. 目標/Bestタイム（基準タイム）
        const colRef = document.createElement('td');
        let refTimeMs = null;
        if (hasPB) {
            refTimeMs = personalBestSplits[i];
        } else if (seg.target) {
            refTimeMs = parseInt(seg.target) * 1000; // 秒をミリ秒へ変換
        }
        colRef.textContent = refTimeMs ? formatTimeShort(refTimeMs) : "-";
        
        // 3. タイム（現在計測値）
        const colTime = document.createElement('td');
        colTime.textContent = "-";
        
        // 4. 差分 (Diff)
        const colDiff = document.createElement('td');
        colDiff.textContent = "";
        
        row.appendChild(colName);
        row.appendChild(colRef);
        row.appendChild(colTime);
        row.appendChild(colDiff);
        EL_LAP_LIST_BODY.appendChild(row);
    });
}


// --- タイマー処理 ---

/**
 * タイマーを開始する関数
 * 停止中であれば現在時刻を基準にインターバル処理を開始する。
 */
function startTimer() {
    if (isRunning) return;
    startTime = Date.now() - elapsedTime;
    timerInterval = setInterval(updateDisplay, 10);
    isRunning = true;
    highlightCurrentSegment();
}

/**
 * タイマーを停止する関数
 * インターバル処理を解除する。
 */
function stopTimer() {
    if (!isRunning) return;
    clearInterval(timerInterval);
    isRunning = false;
}

/**
 * ラップ（区間切り替え）処理を行う関数
 * - 停止中はタイマーを開始する。
 * - 計測中は現在の区間タイムを記録し、次の区間へ進む。
 * - 最終区間完了時はタイマーを停止し、記録保存判定を行う。
 */
function triggerLap() {
    // 要件：開始スイッチもしくはラップスイッチを押すとタイマーが始動する
    if (!isRunning) {
        startTimer();
        return;
    }

    // まだ未計測の区間が残っている場合
    if (currentSegmentIndex < segmentsData.length) {
        // 現在の経過時間を記録・表示
        recordSegmentTime(elapsedTime, currentSegmentIndex);
        currentRunSplits.push(elapsedTime);
        
        currentSegmentIndex++;
        
        // 全区間終了チェック
        if (currentSegmentIndex >= segmentsData.length) {
            stopTimer();
            checkAndSavePB(); // 自己ベスト更新チェック
        } else {
            // 次の区間をハイライト
            highlightCurrentSegment();
        }
    }
}

/**
 * 画面の時刻表示を更新する関数
 * setIntervalにより定期的に呼び出される。
 */
function updateDisplay() {
    const now = Date.now();
    elapsedTime = now - startTime;
    EL_TIMER_DISPLAY.textContent = formatTime(elapsedTime);
}

// --- 記録・表示関連 ---

/**
 * 現在計測中の区間行（テーブル）をハイライト表示する関数
 */
function highlightCurrentSegment() {
    const rows = EL_LAP_LIST_BODY.getElementsByTagName('tr');
    // 全行のクラスをリセット
    for (let i = 0; i < rows.length; i++) rows[i].classList.remove('current-segment');
    // 対象行にクラスを付与
    if (currentSegmentIndex < rows.length) rows[currentSegmentIndex].classList.add('current-segment');
}

/**
 * 区間タイムをテーブルに書き込み、比較対象との差分を計算して表示する関数
 * @param {number} timeMs - 現在の経過時間（ミリ秒）
 * @param {number} index - 対象の区間インデックス
 */
function recordSegmentTime(timeMs, index) {
    const rows = EL_LAP_LIST_BODY.getElementsByTagName('tr');
    if (index >= rows.length) return;

    const row = rows[index];
    const cellTime = row.cells[2];
    const cellDiff = row.cells[3];

    // タイム表示更新
    cellTime.textContent = formatTimeShort(timeMs);

    // 比較基準タイム（PB or Target）の取得
    let refTimeMs = null;
    const hasPB = (personalBestSplits.length === segmentsData.length);
    
    if (hasPB) {
        refTimeMs = personalBestSplits[index];
    } else {
        const targetSec = segmentsData[index].target;
        if (targetSec) refTimeMs = parseInt(targetSec) * 1000;
    }

    // 差分の計算と表示
    if (refTimeMs !== null) {
        const diff = timeMs - refTimeMs;
        const sign = diff >= 0 ? "+" : "-";
        const diffAbs = Math.abs(diff);
        
        cellDiff.textContent = `${sign}${formatTimeShort(diffAbs)}`;
        
        // 色付けクラスの適用
        cellDiff.className = ""; // クラスリセット
        if (diff < 0) {
            cellDiff.classList.add("diff-minus"); // 速い（青/緑）
        } else {
            cellDiff.classList.add("diff-plus");  // 遅い（赤）
        }
    }
}

/**
 * 完走後に自己ベスト(PB)更新をチェックし、保存する関数
 * 現在のランの合計タイムと比較し、更新していればLocalStorageに保存する。
 */
function checkAndSavePB() {
    const hasPB = (personalBestSplits.length === segmentsData.length);
    const currentTotal = currentRunSplits[currentRunSplits.length - 1];
    // PBがない場合はInfinity（無限大）扱いとして必ず更新させる
    const pbTotal = hasPB ? personalBestSplits[personalBestSplits.length - 1] : Infinity;

    // 今回のタイムがPBより速い場合
    if (currentTotal < pbTotal) {
        if (hasPB) {
            const diff = (pbTotal - currentTotal) / 1000;
            alert(`おめでとうございます！自己ベスト更新です！\n(-${diff.toFixed(3)}s)`);
        } else {
            alert("初完走おめでとうございます！記録を保存しました。\n次回からこの記録が「自己ベスト」として比較対象になります。");
        }
        
        // 新しい記録を保存
        personalBestSplits = [...currentRunSplits]; 
        saveData();
        
        // UI更新（次回の比較対象表示をPBに切り替えるため）
        finishSetup();
    }
}

/**
 * ミリ秒を「hh:mm:ss.ms」形式の文字列に変換するヘルパー関数
 * メインタイマー表示用。
 * @param {number} ms - 変換対象のミリ秒
 * @returns {string} フォーマット済み文字列
 */
function formatTime(ms) {
    const d = new Date(ms);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    const msStr = String(d.getUTCMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${msStr}`;
}

/**
 * ミリ秒を短縮形式（分:秒.ミリ）に変換するヘルパー関数
 * テーブル表示用。時間が0の場合は「mm:ss.ms」形式にする。
 * @param {number} ms - 変換対象のミリ秒
 * @returns {string} フォーマット済み文字列
 */
function formatTimeShort(ms) {
    const d = new Date(ms);
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    const msStr = String(d.getUTCMilliseconds()).padStart(3, '0');
    
    if (h > 0) {
        return `${h}:${m}:${s}.${msStr}`;
    } else {
        return `${m}:${s}.${msStr}`;
    }
}

/* ==========================================================================
   EVENT LISTENERS (イベント登録・初期化)
   ========================================================================== */

// DOM読み込み完了後にイベントを設定し、アプリを初期化する
document.addEventListener('DOMContentLoaded', () => {
    // タイマー操作ボタン
    EL_BTN_START.addEventListener('click', startTimer);
    EL_BTN_LAP.addEventListener('click', triggerLap);
    EL_BTN_STOP.addEventListener('click', stopTimer);
    
    // 設定・データ操作ボタン
    EL_BTN_ADD.addEventListener('click', addSegment);
    EL_BTN_DONE.addEventListener('click', finishSetup);
    EL_BTN_CLEAR.addEventListener('click', clearAllData);
    
    // インポートボタン（新規）
    EL_BTN_IMPORT.addEventListener('click', importSegments);

    // アプリケーション初期化実行
    initApp();
});