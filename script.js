const STORAGE_KEY = "national-city-elevator-v2";
let dataset = null;
let state = { season: 1, leagues: null, results: null, completed: false };

const $ = id => document.getElementById(id);
const criteriaNames = () => dataset.criteria.map(c => c.name);

async function init(){
  try{
    const res = await fetch("data/cities.json");
    if(!res.ok) throw new Error("data/cities.json を読み込めません");
    dataset = await res.json();
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved) state = JSON.parse(saved);
    render();
  }catch(e){ $("status").textContent = "読み込みエラー: " + e.message; }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function allCities(){ return dataset.cities; }
function isNumeric(v){ return typeof v === "number" && Number.isFinite(v); }
function missingValues(){
  const missing=[];
  for(const city of allCities()) for(const c of dataset.criteria){
    if(!isNumeric(city.values[c.key])) missing.push(`${city.name_ja}：${c.name}`);
  }
  return missing;
}
function shuffle(a){
  const x=[...a];
  for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}
  return x;
}
function makeDraw(){
  const shuffled=shuffle(allCities());
  state.leagues=Array.from({length:16},(_,i)=>shuffled.slice(i*8,(i+1)*8).map(c=>c.city_id));
  state.results=null;state.completed=false;save();render();
  $("status").textContent="完全抽選が完了しました。各リーグ8都市に振り分けました。";
}
function city(id){return allCities().find(c=>c.city_id===id);}
function compareCities(a,b){
  let aWins=0,bWins=0,totalA=0,totalB=0;
  for(const c of dataset.criteria){
    const av=a.values[c.key],bv=b.values[c.key];
    const sign=c.better==="lower"?-1:1;
    totalA+=av*sign;totalB+=bv*sign;
    if(av===bv) continue;
    if((av-bv)*sign>0)aWins++;else bWins++;
  }
  if(aWins!==bWins)return aWins>bWins?1:-1;
  if(totalA!==totalB)return totalA>totalB?1:-1;
  return a.city_id.localeCompare(b.city_id)<0?1:-1;
}
function fixtures(ids){
  const arr=[...ids],out=[];
  for(let r=0;r<7;r++){
    for(let i=0;i<4;i++)out.push([arr[i],arr[7-i]]);
    arr.splice(1,0,arr.pop());
  }
  return out;
}
function runSeason(){
  const missing=missingValues();
  if(missing.length){
    $("status").textContent=`試合を開始できません。数値未入力が ${missing.length} 項目あります。公式原数値を入力してください。`;
    return;
  }
  if(!state.leagues){$("status").textContent="先に初回リーグ抽選を行ってください。";return;}
  state.results=state.leagues.map(ids=>{
    const wins=Object.fromEntries(ids.map(id=>[id,0]));
    const matches=fixtures(ids).map(([x,y])=>{
      const a=city(x),b=city(y),winner=compareCities(a,b)>0?x:y;
      wins[winner]++;
      return {a:x,b:y,winner};
    });
    const table=ids.map(id=>({id,wins:wins[id]})).sort((a,b)=>b.wins-a.wins||a.id.localeCompare(b.id));
    return {matches,table};
  });
  state.completed=true;save();render();
  $("status").textContent="全16リーグの総当たり戦が終了しました。順位表を確認してください。";
}
function advance(){
  if(!state.completed||!state.results){$("status").textContent="先に全リーグの試合を完了してください。";return;}
  const ranked=state.results.map(r=>r.table.map(x=>x.id));
  const next=ranked.map((ids,i)=>i===0?[...ids.slice(0,5),...ranked[1].slice(5,8)]
    :i===15?[...ranked[14].slice(0,3),...ids.slice(3,8)]
    :[...ranked[i-1].slice(5,8),...ids.slice(3,5),...ranked[i+1].slice(0,3)]);
  state.leagues=next;state.season++;state.results=null;state.completed=false;save();render();
  $("status").textContent=`第${state.season}シーズンのリーグ編成が完了しました。`;
}
function render(){
  if(!dataset)return;
  const missing=missingValues();
  $("stats").innerHTML=`<div class="stat">登録都市：${allCities().length} / 128</div><div class="stat">評価項目：${dataset.criteria.length} / 19</div><div class="stat">数値入力済み：${dataset.criteria.length*allCities().length-missing.length} / ${dataset.criteria.length*allCities().length}</div><div class="stat">シーズン：第${state.season}</div>`;
  $("criteria").innerHTML=dataset.criteria.map(c=>{
    const count=allCities().filter(x=>isNumeric(x.values[c.key])).length;
    return `<div class="criterion"><b>${c.name}</b><span class="tag">${c.unit} ・ ${c.better==="higher"?"大きい方を評価":"小さい方を評価"} ・ 入力 ${count}/128</span></div>`;
  }).join("");
  $("leagueTitle").textContent=state.leagues?`第${state.season}シーズン・リーグ編成`:"リーグ一覧（未抽選）";
  $("leagues").innerHTML=state.leagues?state.leagues.map((ids,i)=>{
    const rank=state.results?.[i]?.table;
    const names=rank||ids.map(id=>({id,wins:null}));
    return `<article class="league"><h3>${i+1}部リーグ</h3><ol>${names.map(row=>`<li>${city(row.id).name_ja}${row.wins===null?"":` <b>（${row.wins}勝）</b>`}</li>`).join("")}</ol>${state.results?`<p class="tag">対戦数：${state.results[i].matches.length}</p>`:""}</article>`;
  }).join(""):"<p class='muted'>抽選ボタンを押すと16リーグが表示されます。</p>";
  $("drawBtn").disabled=!!state.leagues;
  $("runBtn").disabled=!state.leagues||state.completed;
  $("nextBtn").disabled=!state.completed;
  if(missing.length) $("status").textContent=`原数値の入力待ち：${missing.length} セル。未確認の値を推測で埋めず、公式資料から入力してください。`;
}
$("drawBtn").addEventListener("click",makeDraw);
$("runBtn").addEventListener("click",runSeason);
$("nextBtn").addEventListener("click",advance);
$("resetBtn").addEventListener("click",()=>{
  if(confirm("保存したリーグ編成・結果を削除しますか？")){
    localStorage.removeItem(STORAGE_KEY);state={season:1,leagues:null,results:null,completed:false};render();
    $("status").textContent="大会データをリセットしました。";
  }
});
init();
