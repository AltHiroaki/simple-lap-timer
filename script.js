/* ==========================================================================
   1. SETTINGS & DOM ELEMENTS (設定・DOM要素の取得)
   ========================================================================== */

// LocalStorageの保存キー
const LS_KEY_DATA = "rta_timer_data_v2";

// --- メイン画面のUI要素 ---
const EL = {
	TIMER_DISPLAY: document.getElementById('timer-display'),
	COMPARISON: document.getElementById('comparison-target-name'),
	LIST_CONTAINER: document.getElementById('segment-list-container'),
	LAP_LIST_BODY: document.getElementById('lap-list-body'),

	// 操作ボタン
	BTN_START: document.getElementById('btn-start'),
	BTN_LAP: document.getElementById('btn-lap'),
	BTN_STOP: document.getElementById('btn-stop'),

	// 設定・データ操作ボタン
	BTN_ADD: document.getElementById('btn-add-segment'),
	BTN_DONE: document.getElementById('btn-done-setup'),
	BTN_CLEAR: document.getElementById('btn-clear-data'),

	// インポート関連
	IMPORT_TEXT: document.getElementById('import-text'),
	BTN_IMPORT: document.getElementById('btn-import'),

	// モーダル関連
	BTN_HELP: document.getElementById('btn-help'),
	MODAL: document.getElementById('help-modal'),
	BTN_CLOSE_MODAL: document.querySelector('.close-modal')
};

/* ==========================================================================
   2. APP STATE (アプリケーションの状態管理)
   ========================================================================== */

/**
 * 区間データの配列 (ユーザー設定)
 * @type {Array<{name: string, target: string}>} 
 * targetはユーザーが入力した文字列（"1:30"など）をそのまま保持する
 */
let segmentsData = [
	{ name: "Area 1", target: "" },
	{ name: "Boss 1", target: "" },
	{ name: "Area 2", target: "" },
	{ name: "Boss 2", target: "" },
	{ name: "Timer Stop", target: "" }
];

/**
 * 自己ベスト記録 (PB)
 * @type {number[]} ミリ秒単位の経過時間の配列
 */
let personalBestSplits = [];

// タイマー関連の状態
let timerState = {
	startTime: 0,           // 計測開始時刻 (Unix Time)
	elapsedTime: 0,         // 経過時間 (ミリ秒)
	intervalId: null,       // setIntervalのID
	isRunning: false,       // 動作中フラグ
	currentSegmentIndex: 0, // 現在計測中の区間インデックス
	currentRunSplits: []    // 今回の計測ラップタイム配列
};

/* ==========================================================================
   3. APP INITIALIZATION (初期化処理)
   ========================================================================== */

/**
 * アプリ起動時のメイン処理
 */
function initApp() {
	loadData();        // 1. 保存データを読み込む
	renderSetupList(); // 2. 設定画面を描画する
	finishSetup();     // 3. 計測画面を初期化する
}

/* ==========================================================================
   4. DATA MANAGEMENT (データ管理: 保存・読込・削除・インポート)
   ========================================================================== */

/**
 * LocalStorageからデータを読み込む
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
 * 現在の状態をLocalStorageへ保存する
 */
function saveData() {
	const data = {
		segments: segmentsData,
		pb: personalBestSplits
	};
	localStorage.setItem(LS_KEY_DATA, JSON.stringify(data));
}

/**
 * データを全消去する
 */
function clearAllData() {
	if (!confirm("自己ベスト記録を含め、全ての設定を削除しますか？\nこの操作は取り消せません。")) return;

	localStorage.removeItem(LS_KEY_DATA);

	// 初期状態へリセット
	segmentsData = [{ name: "Segment 1", target: "" }];
	personalBestSplits = [];

	renderSetupList();
	finishSetup();
}

/**
 * テキストエリアから区間リストを一括インポートする
 * (タブ区切り、カンマ区切り、スペース区切りに対応)
 */
function importSegments() {
	const text = EL.IMPORT_TEXT.value;
	if (!text || !text.trim()) {
		alert("テキストエリアが空です。貼り付けてから実行してください。");
		return;
	}

	if (!confirm("現在のリストを上書きしてインポートしますか？\n※既存の区間設定とベスト記録はリセットされます。")) return;

	const lines = text.split('\n');
	const newSegments = [];

	lines.forEach(line => {
		if (!line.trim()) return;

		let name = line.trim();
		let target = "";

		// 1. 明確な区切り文字（タブ、カンマ、読点、全角スペース）チェック
		const delimiterMatch = line.match(/[\t,、\u3000]/);

		if (delimiterMatch) {
			const parts = line.split(/[\t,、\u3000]/);
			const validParts = parts.map(p => p.trim()).filter(p => p !== "");
			if (validParts.length >= 2) {
				name = validParts[0];
				target = validParts[1];
			}
		} else {
			// 2. スペース区切りの解析 (末尾が時間っぽい場合のみ分割)
			const spaceMatch = line.match(/^(.*?)[\s]+([\d:.]+)$/);
			if (spaceMatch) {
				const potentialTime = spaceMatch[2];
				// コロンかドットを含む場合のみ時間とみなす (整数の誤爆防止)
				if (potentialTime.includes(':') || potentialTime.includes('.')) {
					name = spaceMatch[1];
					target = potentialTime;
				}
			}
		}
		newSegments.push({ name: name, target: target });
	});

	if (newSegments.length === 0) {
		alert("有効なデータが見つかりませんでした。");
		return;
	}

	// 更新処理
	segmentsData = newSegments;
	personalBestSplits = []; // 区間構成が変わるためPBはリセット
	EL.IMPORT_TEXT.value = "";

	saveData();
	renderSetupList();
	finishSetup();

	// detailsタグを閉じる
	const details = document.querySelector('.import-section');
	if (details) details.removeAttribute('open');

	alert("インポートが完了しました。");
}

/* ==========================================================================
   5. UI RENDERING (画面描画ロジック)
   ========================================================================== */

/**
 * 設定画面（リスト編集エリア）を描画する
 */
function renderSetupList() {
	EL.LIST_CONTAINER.innerHTML = "";

	segmentsData.forEach((seg, index) => {
		const div = document.createElement('div');
		div.className = 'segment-row';

		// 区間名入力
		const inputName = document.createElement('input');
		inputName.type = "text";
		inputName.value = seg.name;
		inputName.placeholder = `区間 ${index + 1}`;
		inputName.oninput = (e) => {
			segmentsData[index].name = e.target.value;
			saveData();
		};

		// 目標タイム入力
		const inputTarget = document.createElement('input');
		inputTarget.type = "text";
		inputTarget.className = "input-target";
		inputTarget.placeholder = "目標(1:30等)";
		inputTarget.value = seg.target;
		inputTarget.title = "目標タイムを入力";
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
		EL.LIST_CONTAINER.appendChild(div);
	});
}

/**
 * 計測画面（テーブル）を初期化・再構築する
 * (セットアップ完了時やリセット時に呼ばれる)
 */
function finishSetup() {
	stopTimer();
	timerState.elapsedTime = 0;
	timerState.currentSegmentIndex = 0;
	timerState.currentRunSplits = [];
	EL.TIMER_DISPLAY.textContent = "00:00:00.000";

	// 比較対象の表示切り替え (PBがあればPB、なければTarget)
	const hasPB = (personalBestSplits.length === segmentsData.length);
	EL.COMPARISON.textContent = hasPB ? "比較: 自己ベスト (PB)" : "比較: 目標タイム (Target)";

	// テーブル生成
	EL.LAP_LIST_BODY.innerHTML = "";

	segmentsData.forEach((seg, i) => {
		const row = document.createElement('tr');

		// 1. 区間名
		const colName = document.createElement('td');
		colName.textContent = seg.name || `Segment ${i + 1}`;

		// 2. 目標/Bestタイム (計算用基準値)
		const colRef = document.createElement('td');
		let refTimeMs = null;

		if (hasPB) {
			refTimeMs = personalBestSplits[i];
		} else if (seg.target) {
			// 文字列時間をミリ秒に変換
			const parsed = parseTimeInput(seg.target);
			if (parsed !== null) {
				refTimeMs = Math.round(parsed * 1000);
			}
		}
		colRef.textContent = refTimeMs ? formatTimeShort(refTimeMs) : "-";

		// 3. タイム (空欄)
		const colTime = document.createElement('td');
		colTime.textContent = "-";

		// 4. 差分 (空欄)
		const colDiff = document.createElement('td');
		colDiff.textContent = "";

		row.appendChild(colName);
		row.appendChild(colRef);
		row.appendChild(colTime);
		row.appendChild(colDiff);
		EL.LAP_LIST_BODY.appendChild(row);
	});
}

/**
 * 区間の追加
 */
function addSegment() {
	segmentsData.push({ name: "", target: "" });
	renderSetupList();
	saveData();
}

/**
 * 区間の削除
 */
function removeSegment(index) {
	if (segmentsData.length <= 1) {
		alert("これ以上削除できません");
		return;
	}
	segmentsData.splice(index, 1);
	personalBestSplits = []; // 構成が変わるのでPBリセット
	renderSetupList();
	saveData();
}

/* ==========================================================================
   6. TIMER ENGINE (タイマー制御ロジック)
   ========================================================================== */

function startTimer() {
	if (timerState.isRunning) return;

	// 現在時刻 - これまでの経過時間 = 開始基準点
	timerState.startTime = Date.now() - timerState.elapsedTime;
	timerState.intervalId = setInterval(updateDisplay, 10);
	timerState.isRunning = true;

	highlightCurrentSegment();
}

function stopTimer() {
	if (!timerState.isRunning) return;

	clearInterval(timerState.intervalId);
	timerState.isRunning = false;
}

/**
 * ラップ/区間通過処理
 */
function triggerLap() {
	// 停止中ならスタートさせる
	if (!timerState.isRunning) {
		startTimer();
		return;
	}

	// まだ区間が残っている場合
	if (timerState.currentSegmentIndex < segmentsData.length) {
		// 現在のタイムを記録
		recordSegmentTime(timerState.elapsedTime, timerState.currentSegmentIndex);
		timerState.currentRunSplits.push(timerState.elapsedTime);

		timerState.currentSegmentIndex++;

		// 全区間終了チェック
		if (timerState.currentSegmentIndex >= segmentsData.length) {
			stopTimer();
			checkAndSavePB();
		} else {
			highlightCurrentSegment();
		}
	}
}

/**
 * 画面更新 (10msごとに呼ばれる)
 */
function updateDisplay() {
	const now = Date.now();
	timerState.elapsedTime = now - timerState.startTime;
	EL.TIMER_DISPLAY.textContent = formatTime(timerState.elapsedTime);
}

/**
 * 現在の行をハイライトする
 */
function highlightCurrentSegment() {
	const rows = EL.LAP_LIST_BODY.getElementsByTagName('tr');
	// 全てのリセット
	for (let i = 0; i < rows.length; i++) rows[i].classList.remove('current-segment');
	// 対象行のハイライト
	if (timerState.currentSegmentIndex < rows.length) {
		rows[timerState.currentSegmentIndex].classList.add('current-segment');
	}
}

/**
 * 区間タイムの記録と差分計算
 */
function recordSegmentTime(timeMs, index) {
	const rows = EL.LAP_LIST_BODY.getElementsByTagName('tr');
	if (index >= rows.length) return;

	const row = rows[index];
	const cellTime = row.cells[2];
	const cellDiff = row.cells[3];

	// タイム表示
	cellTime.textContent = formatTimeShort(timeMs);

	// 比較対象(基準タイム)の取得
	let refTimeMs = null;
	const hasPB = (personalBestSplits.length === segmentsData.length);

	if (hasPB) {
		refTimeMs = personalBestSplits[index];
	} else {
		const targetStr = segmentsData[index].target;
		const parsed = parseTimeInput(targetStr);
		if (parsed !== null) {
			refTimeMs = Math.round(parsed * 1000);
		}
	}

	// 差分の計算と表示
	if (refTimeMs !== null && !isNaN(refTimeMs)) {
		const diff = timeMs - refTimeMs;
		const diffAbs = Math.abs(diff);
		const sign = diff >= 0 ? "+" : "-";

		cellDiff.textContent = `${sign}${formatTimeShort(diffAbs)}`;

		// 色分け (速い=青/緑, 遅い=赤)
		cellDiff.className = "";
		if (diff < 0) {
			cellDiff.classList.add("diff-minus");
		} else {
			cellDiff.classList.add("diff-plus");
		}
	}
}

/**
 * 自己ベスト(PB)更新チェック
 */
function checkAndSavePB() {
	const hasPB = (personalBestSplits.length === segmentsData.length);
	const currentTotal = timerState.currentRunSplits[timerState.currentRunSplits.length - 1];
	const pbTotal = hasPB ? personalBestSplits[personalBestSplits.length - 1] : Infinity;

	if (currentTotal < pbTotal) {
		if (hasPB) {
			const diff = (pbTotal - currentTotal) / 1000;
			alert(`おめでとうございます！自己ベスト更新です！\n(-${diff.toFixed(3)}s)`);
		} else {
			alert("初完走おめでとうございます！記録を保存しました。");
		}

		personalBestSplits = [...timerState.currentRunSplits];
		saveData();
		finishSetup(); // 画面リセットしてPB表示に切り替え
	}
}

/* ==========================================================================
   7. HELPER FUNCTIONS (時間変換ヘルパー)
   ========================================================================== */

/**
 * 時間文字列解析 ("1:30" -> 90秒)
 */
function parseTimeInput(str) {
	if (!str) return null;

	if (str.includes(':')) {
		const parts = str.split(':').map(part => parseFloat(part));
		if (parts.some(isNaN)) return null;

		if (parts.length === 3) {
			return (parts[0] * 3600) + (parts[1] * 60) + parts[2]; // hh:mm:ss
		} else if (parts.length === 2) {
			return (parts[0] * 60) + parts[1]; // mm:ss
		}
	} else {
		const val = parseFloat(str);
		return isNaN(val) ? null : val;
	}
	return null;
}

/**
 * 時間フォーマット (hh:mm:ss.ms) - タイマー用
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
 * 短縮時間フォーマット (分:秒.ミリ) - テーブル用
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
   8. EVENT LISTENERS (イベント登録)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
	// タイマー操作
	EL.BTN_START.addEventListener('click', startTimer);
	EL.BTN_LAP.addEventListener('click', triggerLap);
	EL.BTN_STOP.addEventListener('click', stopTimer);

	// 設定・データ操作
	EL.BTN_ADD.addEventListener('click', addSegment);
	EL.BTN_DONE.addEventListener('click', finishSetup);
	EL.BTN_CLEAR.addEventListener('click', clearAllData);
	EL.BTN_IMPORT.addEventListener('click', importSegments);

	// モーダル操作
	EL.BTN_HELP.addEventListener('click', () => {
		EL.MODAL.style.display = "block";
	});
	EL.BTN_CLOSE_MODAL.addEventListener('click', () => {
		EL.MODAL.style.display = "none";
	});
	window.addEventListener('click', (event) => {
		if (event.target == EL.MODAL) {
			EL.MODAL.style.display = "none";
		}
	});

	// 初期化実行
	initApp();
});