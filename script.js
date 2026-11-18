
const STORAGE_KEY = "national-city-elevator-v3";

const LEAGUE_COUNT = 16;
const CITIES_PER_LEAGUE = 8;
const EXPECTED_CITIES = 128;

let dataset = null;

let state = {
  season: 1,
  leagues: null,
  results: null,
  completed: false
};

const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function cityName(id) {
  return dataset.cities.find(c => c.city_id === id)?.name_ja ?? id;
}

function getCity(id) {
  return dataset.cities.find(c => c.city_id === id);
}

function formatValue(value) {
  return Number(value).toLocaleString("ja-JP", {
    maximumFractionDigits: 2
  });
}

function isLowerBetter(criterion) {
  const value = String(criterion.better ?? "higher").toLowerCase();
  return ["lower", "low", "smaller", "less", "昇順", "小さい"].includes(value);
}

/* -------------------------
   データの検査
------------------------- */

function validateDataset() {
  if (!dataset || !Array.isArray(dataset.cities) ||
      !Array.isArray(dataset.criteria)) {
    throw new Error("cities.json の形式が正しくありません。");
  }

  if (dataset.cities.length !== EXPECTED_CITIES) {
    throw new Error(
      `都市数が${EXPECTED_CITIES}ではありません。現在：${dataset.cities.length}都市`
    );
  }

  const ids = dataset.cities.map(city => city.city_id);

  if (ids.some(id => !id)) {
    throw new Error("city_id が空の都市があります。");
  }

  if (new Set(ids).size !== EXPECTED_CITIES) {
    throw new Error("cities.json 内に city_id の重複があります。");
  }

  for (const city of dataset.cities) {
    if (!city.name_ja || !city.values) {
      throw new Error(`${city.city_id} の都市名または values がありません。`);
    }

    for (const criterion of dataset.criteria) {
      const value = city.values[criterion.key];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(
          `${city.name_ja} の「${criterion.name}」の数値が不正です。`
        );
      }
    }
  }
}

/* -------------------------
   リーグ構成の検査
------------------------- */

function validateLeagues(leagues) {
function validateLeagues(leagues) {
  if (!Array.isArray(leagues) || leagues.length !== 16) {
    throw new Error("リーグ数が16ではありません。");
  }

  const expectedIds = dataset.cities.map(c => c.city_id);
  const expectedSet = new Set(expectedIds);
  const occurrences = new Map();

  for (let i = 0; i < 16; i++) {
    if (!Array.isArray(leagues[i]) || leagues[i].length !== 8) {
      throw new Error(`第${i + 1}リーグの都市数が8ではありません。`);
    }

    for (const id of leagues[i]) {
      if (!expectedSet.has(id)) {
        throw new Error(`登録されていない都市ID：${id}`);
      }

      occurrences.set(id, (occurrences.get(id) || 0) + 1);
    }
  }

  const duplicates = [...occurrences.entries()]
    .filter(([id, count]) => count > 1)
    .map(([id, count]) => `${cityName(id)}（${count}回）`);

  const missing = expectedIds
    .filter(id => !occurrences.has(id))
    .map(id => cityName(id));

  if (duplicates.length > 0 || missing.length > 0) {
    throw new Error(
      "都市の重複・欠落を検出しました。\n" +
      "重複：" + (duplicates.join("、") || "なし") + "\n" +
      "欠落：" + (missing.join("、") || "なし")
    );
  }

  return true;
}
}

/* -------------------------
   抽選
------------------------- */

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function makeDraw() {
  const shuffled = shuffle(dataset.cities.map(c => c.city_id));

  const leagues = [];

  for (let i = 0; i < LEAGUE_COUNT; i++) {
    leagues.push(
      shuffled.slice(i * CITIES_PER_LEAGUE, (i + 1) * CITIES_PER_LEAGUE)
    );
  }

  validateLeagues(leagues);

  state = {
    season: 1,
    leagues,
    results: null,
    completed: false
  };

  saveState();
  render();

  setStatus("第1シーズンの抽選が完了しました。");
}

/* -------------------------
   各都市の評価順位
   ※異なる単位の数値を直接合計しない
------------------------- */

function getRankScores() {
  const scores = {};

  for (const city of dataset.cities) {
    scores[city.city_id] = 0;
  }

  for (const criterion of dataset.criteria) {
    const sorted = [...dataset.cities].sort((a, b) => {
      const av = a.values[criterion.key];
      const bv = b.values[criterion.key];

      return isLowerBetter(criterion) ? av - bv : bv - av;
    });

    sorted.forEach((city, index) => {
      scores[city.city_id] += EXPECTED_CITIES - index;
    });
  }

  return scores;
}

/* -------------------------
   1試合の判定
------------------------- */

function compareCities(idA, idB, rankScores) {
  const cityA = getCity(idA);
  const cityB = getCity(idB);

  let scoreA = 0;
  let scoreB = 0;
  const breakdown = [];

  for (const criterion of dataset.criteria) {
    const valueA = cityA.values[criterion.key];
    const valueB = cityB.values[criterion.key];

    let winner = "draw";

    if (valueA !== valueB) {
      const aWins = isLowerBetter(criterion)
        ? valueA < valueB
        : valueA > valueB;

      if (aWins) {
        scoreA++;
        winner = "A";
      } else {
        scoreB++;
        winner = "B";
      }
    }

    breakdown.push({
      name: criterion.name,
      unit: criterion.unit ?? "",
      valueA,
      valueB,
      winner
    });
  }

  let winner;
  let decider = "19項目の獲得数";

  if (scoreA > scoreB) {
    winner = idA;
  } else if (scoreB > scoreA) {
    winner = idB;
  } else {
    decider = "全都市の評価順位によるタイブレーク";

    if (rankScores[idA] > rankScores[idB]) {
      winner = idA;
    } else if (rankScores[idB] > rankScores[idA]) {
      winner = idB;
    } else {
      decider = "都市IDによる最終判定";
      winner = idA.localeCompare(idB, "ja") < 0 ? idA : idB;
    }
  }

  return {
    a: idA,
    b: idB,
    scoreA,
    scoreB,
    winner,
    decider,
    breakdown
  };
}

/* -------------------------
   リーグ順位表
------------------------- */

function makeStandings(league, matches, rankScores) {
  const table = league.map(id => ({
    id,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointsDiff: 0,
    rankScore: rankScores[id]
  }));

  const byId = Object.fromEntries(table.map(row => [row.id, row]));

  for (const match of matches) {
    const a = byId[match.a];
    const b = byId[match.b];

    a.pointsFor += match.scoreA;
    a.pointsAgainst += match.scoreB;

    b.pointsFor += match.scoreB;
    b.pointsAgainst += match.scoreA;

    if (match.winner === match.a) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
  }

  for (const row of table) {
    row.pointsDiff = row.pointsFor - row.pointsAgainst;
  }

  table.sort((a, b) =>
    b.wins - a.wins ||
    b.pointsDiff - a.pointsDiff ||
    b.pointsFor - a.pointsFor ||
    b.rankScore - a.rankScore ||
    a.id.localeCompare(b.id, "ja")
  );

  return table;
}

/* -------------------------
   シーズン実施
------------------------- */

function runSeason() {
  if (!state.leagues) {
    setStatus("先に抽選を行ってください。");
    return;
  }

  if (state.completed) {
    setStatus("このシーズンはすでに終了しています。");
    return;
  }

  validateLeagues(state.leagues);

  const rankScores = getRankScores();
  const allResults = [];

  for (let i = 0; i < LEAGUE_COUNT; i++) {
    const league = state.leagues[i];
    const matches = [];

    for (let a = 0; a < league.length; a++) {
      for (let b = a + 1; b < league.length; b++) {
        matches.push(
          compareCities(league[a], league[b], rankScores)
        );
      }
    }

    allResults.push({
      league: i + 1,
      matches,
      standings: makeStandings(league, matches, rankScores)
    });
  }

  state.results = allResults;
  state.completed = true;

  saveState();
  render();

  setStatus(`第${state.season}シーズンの全448試合が終了しました。`);
}

/* -------------------------
   昇格・降格
------------------------- */

function advance() {
  if (!state.completed || !state.results) {
    setStatus("先にシーズンを終了してください。");
    return;
  }

  const rankings = state.results.map(result => result.standings);
  const nextLeagues = [];

  // 第1リーグ：残留5都市＋第2リーグから昇格3都市
  nextLeagues.push([
    ...rankings[0].slice(0, 5).map(row => row.id),
    ...rankings[1].slice(-3).map(row => row.id)
  ]);

  // 第2～15リーグ
  for (let i = 1; i < 15; i++) {
    nextLeagues.push([
      ...rankings[i - 1].slice(-3).map(row => row.id),
      ...rankings[i].slice(3, 5).map(row => row.id),
      ...rankings[i + 1].slice(0, 3).map(row => row.id)
    ]);
  }

  // 第16リーグ：第15リーグから降格3都市＋残留5都市
  nextLeagues.push([
    ...rankings[14].slice(-3).map(row => row.id),
    ...rankings[15].slice(3, 8).map(row => row.id)
  ]);

  try {
    validateLeagues(nextLeagues);
  } catch (error) {
    setStatus("昇格・降格を中止しました：" + error.message);
    return;
  }

  state.season++;
  state.leagues = nextLeagues;
  state.results = null;
  state.completed = false;

  saveState();
  render();

  setStatus(
    `昇格・降格が完了しました。第${state.season}シーズンの準備ができました。`
  );
}

/* -------------------------
   保存・読み込み
------------------------- */

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    setStatus("保存に失敗しました。ブラウザの保存設定を確認してください。");
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return;

    const parsed = JSON.parse(saved);

    if (!parsed || !Number.isInteger(parsed.season) ||
        !Array.isArray(parsed.leagues)) {
      return;
    }

    validateLeagues(parsed.leagues);

    state = {
      season: parsed.season,
      leagues: parsed.leagues,
      results: Array.isArray(parsed.results) ? parsed.results : null,
      completed: Boolean(parsed.completed)
    };

    if (state.completed && !state.results) {
      state.completed = false;
    }
  } catch (error) {
    state = {
      season: 1,
      leagues: null,
      results: null,
      completed: false
    };

    setStatus("保存データに問題があります。新しく抽選してください。");
  }
}

/* -------------------------
   画面表示
------------------------- */

function setStatus(message) {
  const element = $("status");
  if (element) element.textContent = message;
}

function renderCriteria() {
  const element = $("criteria");
  if (!element) return;

  element.innerHTML = dataset.criteria.map((criterion, index) => `
    <span class="criterion-item">
      ${index + 1}. ${escapeHtml(criterion.name)}
    </span>
  `).join(" ");
}

function renderMatch(match) {
  const aName = cityName(match.a);
  const bName = cityName(match.b);
  const winnerName = cityName(match.winner);

  const details = match.breakdown.map(item => {
    let resultText = "引き分け";
    if (item.winner === "A") resultText = aName + " の勝ち";
    if (item.winner === "B") resultText = bName + " の勝ち";

    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${formatValue(item.valueA)} ${escapeHtml(item.unit)}</td>
        <td>${formatValue(item.valueB)} ${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(resultText)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="match-card">
      <div class="match-score">
        <strong>${escapeHtml(aName)}</strong>
        <span>${match.scoreA} - ${match.scoreB}</span>
        <strong>${escapeHtml(bName)}</strong>
      </div>

      <div class="match-winner">
        勝者：${escapeHtml(winnerName)}
      </div>

      <details>
        <summary>19項目の試合内容を見る</summary>
        <p>決着方法：${escapeHtml(match.decider)}</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>評価項目</th>
                <th>${escapeHtml(aName)}</th>
                <th>${escapeHtml(bName)}</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>${details}</tbody>
          </table>
        </div>
      </details>
    </div>
  `;
}

function renderLeague(index) {
  const league = state.leagues[index];
  const result = state.results?.[index];

  let tableRows;

  if (result) {
    tableRows = result.standings.map((row, position) => `
      <tr>
        <td>${position + 1}</td>
        <td>${escapeHtml(cityName(row.id))}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td>${row.pointsFor} - ${row.pointsAgainst}</td>
        <td>${row.pointsDiff > 0 ? "+" : ""}${row.pointsDiff}</td>
      </tr>
    `).join("");
  } else {
    tableRows = league.map((id, position) => `
      <tr>
        <td>${position + 1}</td>
        <td>${escapeHtml(cityName(id))}</td>
        <td colspan="4">試合前</td>
      </tr>
    `).join("");
  }

  const matchesHtml = result
    ? result.matches.map(renderMatch).join("")
    : "<p>まだ試合は行われていません。</p>";

  return `
    <section class="league-card">
      <h3>第${index + 1}リーグ</h3>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>都市</th>
              <th>勝</th>
              <th>敗</th>
              <th>得点 - 失点</th>
              <th>得失点差</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>

      <details>
        <summary>第${index + 1}リーグの試合結果</summary>
        ${matchesHtml}
      </details>
    </section>
  `;
}

function render() {
  if (!dataset) return;

  renderCriteria();

  const title = $("leagueTitle");
  if (title) {
    title.textContent = `第${state.season}シーズン`;
  }

  const stats = $("stats");
  if (stats) {
    const matchCount = state.completed
      ? LEAGUE_COUNT * 28
      : 0;

    stats.textContent =
      `都市数：128｜リーグ数：16｜1リーグ：8都市｜` +
      `今シーズンの試合数：${matchCount}/448`;
  }

  const leaguesElement = $("leagues");
  if (leaguesElement) {
    if (!state.leagues) {
      leaguesElement.innerHTML =
        "<p>抽選ボタンを押して大会を開始してください。</p>";
    } else {
      leaguesElement.innerHTML = state.leagues
        .map((_, index) => renderLeague(index))
        .join("");
    }
  }

  const runButton = $("runBtn");
  const nextButton = $("nextBtn");

  if (runButton) {
    runButton.disabled = !state.leagues || state.completed;
  }

  if (nextButton) {
    nextButton.disabled = !state.completed;
  }
}

/* -------------------------
   初期化
------------------------- */

async function init() {
  try {
    setStatus("都市データを読み込んでいます……");

    const response = await fetch("data/cities.json");

    if (!response.ok) {
      throw new Error("data/cities.json を読み込めませんでした。");
    }

    dataset = await response.json();

    validateDataset();
    loadState();
    render();

    setStatus(
      state.leagues
        ? `第${state.season}シーズンを読み込みました。`
        : "データの読み込みが完了しました。抽選を開始できます。"
    );

  } catch (error) {
    console.error(error);
    setStatus("エラー：" + error.message);
  }
}

/* -------------------------
   ボタン操作
------------------------- */

if ($("drawBtn")) {
  $("drawBtn").addEventListener("click", () => {
    try {
      makeDraw();
    } catch (error) {
      setStatus("抽選エラー：" + error.message);
    }
  });
}

if ($("runBtn")) {
  $("runBtn").addEventListener("click", () => {
    try {
      runSeason();
    } catch (error) {
      setStatus("試合エラー：" + error.message);
    }
  });
}

if ($("nextBtn")) {
  $("nextBtn").addEventListener("click", () => {
    try {
      advance();
    } catch (error) {
      setStatus("昇格・降格エラー：" + error.message);
    }
  });
}

if ($("resetBtn")) {
  $("resetBtn").addEventListener("click", () => {
    const confirmed = confirm(
      "第3版の大会データをリセットして、新しく抽選しますか？"
    );

    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);

    state = {
      season: 1,
      leagues: null,
      results: null,
      completed: false
    };

    render();
    setStatus("リセットしました。新しく抽選してください。");
  });
}

init();
