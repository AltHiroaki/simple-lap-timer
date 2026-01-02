/* ==========================================================================
   CONSTANTS & VARIABLES (定義・状態管理)
   ========================================================================== */

// --- UI要素の参照 ---
const EL_TIMER_DISPLAY  = document.getElementById('timer-display');
const EL_BTN_START      = document.getElementById('btn-start');
const EL_BTN_LAP        = document.getElementById('btn-lap');
const EL_BTN_STOP       = document.getElementById('btn-stop');
const EL_SETUP_AREA     = document.getElementById('setup-area');
const EL_LIST_CONTAINER = document.getElementById('segment-list-container');
const EL_BTN_ADD        = document.getElementById('btn-add-segment');
const EL_BTN_DONE       = document.getElementById('btn-done-setup');
const EL_LAP_LIST_BODY  = document.getElementById('lap-list-body');

// --- アプリケーションの状態 ---

// 区間名のリスト（初期値）
let segmentsData = ["Opening", "Lap 1", "Lap 2", "Ending"];

// タイマー計測用変数
let startTime = 0;         // 計測開始時刻（Unix Time）
let elapsedTime = 0;       // 経過時間（ミリ秒）
let timerInterval = null;  // setIntervalのID
let isRunning = false;     // 動作中フラグ
let currentSegmentIndex = 0; // 現在計測中の区間番号

/* ==========================================================================
   FUNCTIONS (ロジック・操作)
   ========================================================================== */

/**
 * セットアップ画面の入力リストを描画する関数
 * segmentsData配列の中身をもとに、input要素と削除ボタンを動的に生成します。
 */
function renderSetupList() {
    EL_LIST_CONTAINER.innerHTML = ""; // 既存の内容をクリア

    segmentsData.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = 'segment-row';

        // 入力フィールド作成
        const input = document.createElement('input');
        input.type = "text";
        input.value = name;
        input.placeholder = `区間 ${index + 1}`;
        
        // 入力変更時に配列データを更新するイベント
        input.oninput = (e) => {
            segmentsData[index] = e.target.value;
        };

        // 削除ボタン作成
        const delBtn = document.createElement('button');
        delBtn.textContent = "×";
        delBtn.className = "btn-remove";
        
        // 削除実行イベント
        delBtn.onclick = () => removeSegment(index);

        div.appendChild(input);
        div.appendChild(delBtn);
        EL_LIST_CONTAINER.appendChild(div);
    });
}

/**
 * 新しい区間をリストの末尾に追加する関数
 * 配列に空文字を追加し、画面を再描画します。
 */
function addSegment() {
    segmentsData.push("");
    renderSetupList();
}

/**
 * 指定したインデックスの区間を削除する関数
 * @param {number} index - 削除対象の配列インデックス
 */
function removeSegment(index) {
    if (segmentsData.length <= 1) {
        alert("これ以上削除できません。少なくとも1つの区間が必要です。");
        return;
    }
    segmentsData.splice(index, 1);
    renderSetupList();
}

/**
 * セットアップを完了し、計測画面（テーブル）を初期化する関数
 * 現在の入力内容を確定させ、タイマーをリセット状態にします。
 */
function finishSetup() {
    // タイマーを完全にリセット
    stopTimer();
    elapsedTime = 0;
    currentSegmentIndex = 0;
    EL_TIMER_DISPLAY.textContent = "00:00:00.000";

    // テーブルの再構築
    EL_LAP_LIST_BODY.innerHTML = "";
    
    segmentsData.forEach((seg) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const timeCell = document.createElement('td');
        
        // 区間名が空の場合はデフォルト表示
        nameCell.textContent = seg || "(名称未設定)";
        // タイムの初期表示も桁数を合わせる
        timeCell.textContent = "--:--:--.---";
        
        row.appendChild(nameCell);
        row.appendChild(timeCell);
        EL_LAP_LIST_BODY.appendChild(row);
    });
}

/**
 * タイマーを開始する関数
 * 停止中であれば現在時刻を基準にインターバルを開始します。
 * 既に動作中の場合は何もしません。
 */
function startTimer() {
    if (isRunning) return;

    // 現在時刻から「これまでの経過時間」を引いた時間を開始点とする
    startTime = Date.now() - elapsedTime;
    timerInterval = setInterval(updateDisplay, 10); // 10msごとに画面更新
    isRunning = true;
    
    highlightCurrentSegment();
}

/**
 * タイマーを停止する関数
 * インターバルを解除します。
 */
function stopTimer() {
    if (!isRunning) return;
    clearInterval(timerInterval);
    isRunning = false;
}

/**
 * ラップ（区間切り替え）処理を行う関数
 * - タイマー停止中なら「スタート」として機能します。
 * - 動作中なら現在の区間タイムを確定し、次の区間へ進みます。
 * - 全区間終了時はタイマーをストップします。
 */
function triggerLap() {
    // 要件：開始スイッチもしくはラップスイッチを押すとタイマーが始動する
    if (!isRunning) {
        startTimer();
        return;
    }

    // ラップ記録処理
    if (currentSegmentIndex < segmentsData.length) {
        // 現在の経過時間を記録
        recordSegmentTime(elapsedTime);
        
        // 次の区間へ
        currentSegmentIndex++;
        highlightCurrentSegment();
    } else {
        // 最後の区間が終わったら停止
        stopTimer();
    }
}

/**
 * 画面の時刻表示を更新する関数
 * インターバルで呼び出されます。
 */
function updateDisplay() {
    const now = Date.now();
    elapsedTime = now - startTime;
    EL_TIMER_DISPLAY.textContent = formatTime(elapsedTime);
}

/**
 * 現在計測中の区間行（テーブル）をハイライト表示する関数
 */
function highlightCurrentSegment() {
    const rows = EL_LAP_LIST_BODY.getElementsByTagName('tr');
    
    // 全ての行からハイライトクラスを除去
    for (let i = 0; i < rows.length; i++) {
        rows[i].classList.remove('current-segment');
    }
    
    // 現在の対象行にクラス付与
    if (currentSegmentIndex < rows.length) {
        rows[currentSegmentIndex].classList.add('current-segment');
    }
}

/**
 * 指定した経過時間をテーブルに書き込む関数
 * @param {number} timeMs - 記録するミリ秒
 */
function recordSegmentTime(timeMs) {
    const rows = EL_LAP_LIST_BODY.getElementsByTagName('tr');
    
    if (currentSegmentIndex < rows.length) {
        const timeCell = rows[currentSegmentIndex].cells[1];
        timeCell.textContent = formatTime(timeMs);
    }
}

/**
 * ミリ秒を「hh:mm:ss.ms」形式の文字列に変換するヘルパー関数
 * 常に時、分、秒、ミリ秒の桁数で表示します。
 * @param {number} ms - 変換対象のミリ秒
 * @returns {string} フォーマット済み文字列
 */
function formatTime(ms) {
    const date = new Date(ms);
    // UTCメソッドを使うことでタイムゾーンの影響を受けずに絶対時間として計算
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    const msStr = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${msStr}`;
}

/* ==========================================================================
   EVENT LISTENERS (イベント登録・初期化)
   ========================================================================== */

// DOM読み込み完了後にイベントを設定
document.addEventListener('DOMContentLoaded', () => {
    // ボタン操作
    EL_BTN_START.addEventListener('click', startTimer);
    EL_BTN_LAP.addEventListener('click', triggerLap);
    EL_BTN_STOP.addEventListener('click', stopTimer);
    
    // セットアップ操作
    EL_BTN_ADD.addEventListener('click', addSegment);
    EL_BTN_DONE.addEventListener('click', finishSetup);

    // 初期表示の描画
    renderSetupList();
    finishSetup();
});